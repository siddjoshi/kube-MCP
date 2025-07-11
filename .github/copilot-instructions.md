# Copilot Instructions for Kubernetes MCP Server

## Project Overview
This is a **Model Context Protocol (MCP) server** that bridges AI assistants with Kubernetes clusters, providing 50+ tools for cluster management through the MCP standard. The server is built with TypeScript and uses ES modules throughout.

## Key Architecture Patterns

### Manager-Based Architecture
The codebase follows a manager pattern where each domain has its own manager class:
- `KubernetesManager` - Core K8s API client management and connection handling
- `ToolManager` - Registers and executes all 50+ MCP tools (pods, deployments, helm, etc.)
- `ResourceManager` - Handles MCP resource discovery and hierarchical organization
- `PromptManager` - Provides guided troubleshooting workflows
- `SecurityManager` - RBAC validation and audit logging
- `MetricsManager` - Prometheus metrics and health monitoring

### Configuration with Zod Validation
All configuration uses Zod schemas in `src/config/config.ts`. The `loadConfig()` function loads from environment variables with intelligent defaults. **Always use the Config type for type safety.**

### Kubernetes Authentication Strategy
`KubernetesManager.loadKubeConfig()` implements a waterfall authentication approach:
1. In-cluster service account
2. `KUBECONFIG_YAML` environment variable
3. `KUBECONFIG_JSON` environment variable  
4. Minimal config (`K8S_SERVER` + `K8S_TOKEN`)
5. Custom path (`KUBECONFIG_PATH`)
6. Default `~/.kube/config`

## Development Workflows

### Build and Development Commands
```bash
npm run build        # TypeScript compilation to dist/
npm run dev          # Watch mode with tsc --watch
npm start           # Run compiled server
npm run start:direct # Run directly with ts-node (development)
npm test            # Jest tests with 95% coverage requirement
npm run lint        # ESLint with TypeScript rules
```

### MCP Server Testing
Start server with `npm start` then test MCP integration:
- Uses stdio transport by default
- SSE transport available with `MCP_TRANSPORT=sse`
- Connect via Claude Desktop or any MCP client

## Code Conventions

### Error Handling Pattern
Use the established error handling utilities:
```typescript
import { logger, logError, logOperation } from '../utils/logger.js';

try {
  const result = await someK8sOperation();
  logOperation('operation_name', additionalContext);
  return result;
} catch (error) {
  logError('Failed to perform operation', error as Error);
  throw this.k8sManager.handleKubernetesError(error);
}
```

### Tool Registration Pattern
New tools in `ToolManager` follow this pattern:
```typescript
private createNewToolHandler(): ToolHandler {
  return {
    name: 'tool-name',
    description: 'Clear description for AI agents',
    inputSchema: {
      type: 'object',
      properties: { /* Zod-style schema */ },
      required: ['requiredParam']
    },
    handler: async (args) => {
      // Validate, execute, return ToolResult
    }
  };
}
```

### ES Module Imports
**Critical**: All imports must use `.js` extensions for compiled output:
```typescript
import { KubernetesManager } from '../kubernetes/manager.js';  // ✅ Correct
import { KubernetesManager } from '../kubernetes/manager';     // ❌ Wrong
```

## Integration Points

### Kubernetes Client Libraries
Uses `@kubernetes/client-node` with multiple API clients initialized in `KubernetesManager`:
- `coreV1Api` - Pods, Services, Namespaces
- `appsV1Api` - Deployments, StatefulSets
- `customObjectsApi` - CRDs and custom resources
- Proper connection testing and health checks implemented

### MCP Protocol Integration
Server implements all MCP capabilities:
- **Tools**: Kubernetes operations exposed as MCP tools
- **Resources**: Dynamic K8s resource discovery with hierarchical URIs
- **Prompts**: Guided troubleshooting workflows
- Request handlers in `server.ts` include security validation and metrics

### Security and RBAC
`SecurityManager` validates operations against K8s RBAC before execution. Use `allowOnlyNonDestructiveTools` config for read-only mode.

## Key Files for Reference
- `src/server.ts` - Main MCP server setup and request routing
- `src/kubernetes/manager.ts` - K8s connection and API client management
- `src/tools/manager.ts` - All 50+ tool implementations
- `src/config/config.ts` - Comprehensive Zod configuration schema
- `package.json` - Build scripts and strict TypeScript/Jest setup

## Common Pitfalls
- Missing `.js` extensions in imports will break compilation
- Not using `ensureInitialized()` before K8s operations
- Forgetting to register new tools in `ToolManager.registerTools()`
- Not handling Kubernetes errors through `handleKubernetesError()`
