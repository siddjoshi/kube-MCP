import { Prompt, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { KubernetesManager } from '../kubernetes/manager.js';
import { logger } from '../utils/logger.js';

interface PromptHandler {
  name: string;
  description: string;
  arguments: any;
  handler: (args: Record<string, string>) => Promise<GetPromptResult>;
}

export class PromptManager {
  private handlers = new Map<string, PromptHandler>();

  constructor(
    private k8sManager: KubernetesManager
  ) {
    this.registerPrompts();
  }

  private registerPrompts(): void {
    // Register basic prompts
    this.handlers.set('k8s-pod-diagnose', {
      name: 'k8s-pod-diagnose',
      description: 'Diagnose pod issues and provide troubleshooting steps',
      arguments: {
        podName: { type: 'string', description: 'Pod name to diagnose' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: this.handlePodDiagnostics.bind(this)
    });

    this.handlers.set('k8s-cluster-health', {
      name: 'k8s-cluster-health', 
      description: 'Check cluster health and provide recommendations',
      arguments: {},
      handler: this.handleClusterHealth.bind(this)
    });

    logger.info(`Registered ${this.handlers.size} prompt handlers`);
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Prompt not found: ${name}`);
    }

    try {
      return await handler.handler(args || {});
    } catch (error) {
      logger.error(`Prompt '${name}' failed`, { error: (error as Error).message });
      throw error;
    }
  }

  listPrompts(): Prompt[] {
    return Array.from(this.handlers.values()).map(handler => ({
      name: handler.name,
      description: handler.description,
      arguments: handler.arguments,
    }));
  }

  private async handlePodDiagnostics(args: Record<string, string>): Promise<GetPromptResult> {
    const podName = args['podName'];
    if (!podName) {
      throw new Error('Pod name is required');
    }

    const namespace = args['namespace'] || this.k8sManager.getCurrentNamespace();

    return {
      description: `Troubleshooting guide for pod ${podName} in namespace ${namespace}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help me troubleshoot pod ${podName} in namespace ${namespace}. Check its status, events, logs, and provide recommendations.`
          }
        }
      ]
    };
  }

  private async handleClusterHealth(): Promise<GetPromptResult> {
    return {
      description: 'Cluster health assessment and recommendations',
      messages: [
        {
          role: 'user', 
          content: {
            type: 'text',
            text: 'Please assess the overall health of this Kubernetes cluster and provide recommendations for improvement.'
          }
        }
      ]
    };
  }
}
