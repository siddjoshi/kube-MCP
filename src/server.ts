import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Config } from './config/config.js';
import { logger, logError } from './utils/logger.js';
import { KubernetesManager } from './kubernetes/manager.js';
import { ToolManager } from './tools/manager.js';
import { ResourceManager } from './resources/manager.js';
import { PromptManager } from './prompts/manager.js';
import { MetricsManager } from './monitoring/metrics.js';
import { SecurityManager } from './security/manager.js';

export class MCPKubernetesServer {
  private server: Server;
  private kubernetesManager: KubernetesManager;
  private toolManager: ToolManager;
  private resourceManager: ResourceManager;
  private promptManager: PromptManager;
  private metricsManager: MetricsManager;
  private securityManager: SecurityManager;
  private transport: StdioServerTransport | SSEServerTransport | null = null;

  constructor(private config: Config) {
    // Initialize MCP server
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    // Initialize managers
    this.kubernetesManager = new KubernetesManager(config);
    this.securityManager = new SecurityManager(config);
    this.toolManager = new ToolManager(this.kubernetesManager);
    this.resourceManager = new ResourceManager(this.kubernetesManager);
    this.promptManager = new PromptManager(this.kubernetesManager);
    this.metricsManager = new MetricsManager(config);

    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const startTime = Date.now();
      try {
        const tools = await this.toolManager.listTools();
        this.metricsManager.recordOperation('list_tools', Date.now() - startTime);
        return { tools };
      } catch (error) {
        this.metricsManager.recordError('list_tools');
        logError('Failed to list tools', error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const startTime = Date.now();
      const toolName = request.params.name;
      
      try {
        // Security validation
        await this.securityManager.validateAccess({}, toolName, 'execute', request.params.arguments);
        
        const result = await this.toolManager.execute(toolName, request.params.arguments || {});
        this.metricsManager.recordOperation(`tool_${toolName}`, Date.now() - startTime);
        
        // Return in MCP format
        return {
          content: result.content,
          isError: result.isError || false,
        };
      } catch (error) {
        this.metricsManager.recordError(`tool_${toolName}`);
        logError(`Failed to call tool: ${toolName}`, error as Error);
        
        return {
          content: [{
            type: 'text' as const,
            text: `Error executing tool ${toolName}: ${(error as Error).message}`,
          }],
          isError: true,
        };
      }
    });

    // Resources handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const startTime = Date.now();
      try {
        const resources = await this.resourceManager.listResources();
        this.metricsManager.recordOperation('list_resources', Date.now() - startTime);
        return { resources };
      } catch (error) {
        this.metricsManager.recordError('list_resources');
        logError('Failed to list resources', error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const startTime = Date.now();
      const resourceUri = request.params.uri;
      
      try {
        const content = await this.resourceManager.readResource(resourceUri);
        this.metricsManager.recordOperation('read_resource', Date.now() - startTime);
        return { contents: content };
      } catch (error) {
        this.metricsManager.recordError('read_resource');
        logError(`Failed to read resource: ${resourceUri}`, error as Error);
        throw error;
      }
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const startTime = Date.now();
      try {
        const prompts = await this.promptManager.listPrompts();
        this.metricsManager.recordOperation('list_prompts', Date.now() - startTime);
        return { prompts };
      } catch (error) {
        this.metricsManager.recordError('list_prompts');
        logError('Failed to list prompts', error as Error);
        throw error;
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const startTime = Date.now();
      const promptName = request.params.name;
      
      try {
        const prompt = await this.promptManager.getPrompt(promptName, request.params.arguments || {});
        this.metricsManager.recordOperation(`prompt_${promptName}`, Date.now() - startTime);
        return prompt;
      } catch (error) {
        this.metricsManager.recordError(`prompt_${promptName}`);
        logError(`Failed to get prompt: ${promptName}`, error as Error);
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('Initializing MCP Kubernetes Server...');

      // Initialize Kubernetes connection (optional for HTTP transport)
      if (this.config.server.transport !== 'http-chunked') {
        await this.kubernetesManager.initialize();
        logger.info('Kubernetes manager initialized');
      } else {
        logger.info('Skipping Kubernetes initialization for HTTP chunked transport');
      }

      // Start metrics server if enabled
      if (this.config.server.enableMetrics) {
        await this.metricsManager.start();
        logger.info(`Metrics server started on port ${this.config.server.metricsPort}`);
      }

      // Initialize transport
      if (this.config.server.transport === 'sse') {
        this.transport = // @ts-ignore
        new SSEServerTransport(`/sse`, this.server);
        // Start HTTP server for SSE
        const express = await import('express');
        const app = express.default();
        app.use('/sse', // @ts-ignore
        this.transport.expressHandler);
        app.listen(this.config.server.port, this.config.server.host);
        logger.info(`SSE transport started on ${this.config.server.host}:${this.config.server.port}/sse`);
        // Connect server to transport
        await this.server.connect(this.transport);
        logger.info('MCP server connected to transport');
      } else if (this.config.server.transport === 'http-chunked') {
        // HTTP chunked streaming transport
        const express = await import('express');
        const app = express.default();
        app.use(express.json());

        app.post('/call-tool-chunked', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Transfer-Encoding', 'chunked');

          // Example: stream progress chunks
          try {
            const { name, args } = req.body;
            // Simulate streaming tool execution (replace with real logic)
            for (let i = 0; i < 5; i++) {
              await new Promise(r => setTimeout(r, 500));
              res.write(JSON.stringify({ progress: (i + 1) * 20 }) + '\n');
            }
            // Final result
            const result = await this.toolManager.execute(name, args || {});
            res.write(JSON.stringify({ status: 'done', result }) + '\n');
            res.end();
          } catch (err) {
            res.write(JSON.stringify({ error: (err as Error).message }) + '\n');
            res.end();
          }
        });

        app.listen(this.config.server.port, this.config.server.host, () => {
          logger.info(`HTTP chunked MCP server started on http://${this.config.server.host}:${this.config.server.port}`);
        });
        // Do NOT connect server to transport in http-chunked mode
      } else {
        this.transport = new StdioServerTransport();
        logger.info('STDIO transport initialized');
        // Connect server to transport
        await this.server.connect(this.transport);
        logger.info('MCP server connected to transport');
      }

    } catch (error) {
      logError('Failed to start MCP Kubernetes Server', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping MCP Kubernetes Server...');

      // Close server connection
      if (this.server) {
        await this.server.close();
      }

      // Stop metrics server
      if (this.metricsManager) {
        await this.metricsManager.stop();
      }

      // Cleanup Kubernetes manager
      if (this.kubernetesManager) {
        await this.kubernetesManager.cleanup();
      }

      logger.info('MCP Kubernetes Server stopped successfully');
    } catch (error) {
      logError('Error stopping MCP Kubernetes Server', error as Error);
      throw error;
    }
  }

  // Health check endpoint
  async healthCheck(): Promise<{ status: string; details: Record<string, unknown> }> {
    try {
      const kubernetesHealth = await this.kubernetesManager.healthCheck();
      
      return {
        status: 'healthy',
        details: {
          kubernetes: kubernetesHealth,
          server: {
            name: this.config.server.name,
            version: this.config.server.version,
            uptime: process.uptime(),
          },
          metrics: this.metricsManager.getHealthMetrics(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }
}
