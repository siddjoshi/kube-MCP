import { KubernetesManager } from './manager.js';
import { logger, logError, logOperation } from '../utils/logger.js';

export interface KubectlResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

export class KubectlExecutor {
  constructor(
    private k8sManager: KubernetesManager
  ) {}

  async execute(command: string, args: string[] = []): Promise<KubectlResult> {
    try {
      const fullCommand = ['kubectl', command, ...args].join(' ');
      logOperation('kubectl_execute', fullCommand);

      // Parse command and route to appropriate API calls
      const result = await this.routeCommand(command, args);
      
      logger.info('kubectl command executed', {
        command: fullCommand,
        success: result.success,
      });

      return result;
    } catch (error) {
      const errorMsg = `kubectl command failed: ${(error as Error).message}`;
      logError(errorMsg, error as Error);
      
      return {
        success: false,
        output: '',
        error: errorMsg,
        exitCode: 1,
      };
    }
  }

  private async routeCommand(command: string, args: string[]): Promise<KubectlResult> {
    switch (command) {
      case 'get':
        return this.handleGetCommand(args);
      case 'describe':
        return this.handleDescribeCommand(args);
      case 'create':
        return this.handleCreateCommand(args);
      case 'apply':
        return this.handleApplyCommand(args);
      case 'delete':
        return this.handleDeleteCommand(args);
      case 'patch':
        return this.handlePatchCommand(args);
      case 'scale':
        return this.handleScaleCommand(args);
      case 'rollout':
        return this.handleRolloutCommand(args);
      case 'logs':
        return this.handleLogsCommand(args);
      case 'exec':
        return this.handleExecCommand(args);
      case 'port-forward':
        return this.handlePortForwardCommand(args);
      case 'cp':
        return this.handleCpCommand(args);
      case 'top':
        return this.handleTopCommand(args);
      case 'config':
        return this.handleConfigCommand(args);
      case 'cluster-info':
        return this.handleClusterInfoCommand(args);
      case 'version':
        return this.handleVersionCommand(args);
      case 'api-versions':
        return this.handleApiVersionsCommand(args);
      case 'api-resources':
        return this.handleApiResourcesCommand(args);
      default:
        return {
          success: false,
          output: '',
          error: `Command '${command}' not supported`,
          exitCode: 1,
        };
    }
  }

  private async handleGetCommand(args: string[]): Promise<KubectlResult> {
    try {
      const [resourceType, resourceName] = args;
      const namespace = this.extractNamespace(args) || this.k8sManager.getCurrentNamespace();

      if (!resourceType) {
        return {
          success: false,
          output: '',
          error: 'Resource type required',
          exitCode: 1,
        };
      }

      const coreApi = this.k8sManager.getCoreV1Api();
      const appsApi = this.k8sManager.getAppsV1Api();
      let result: any;

      switch ((resourceType || '').toLowerCase()) {
        case 'pods':
        case 'pod':
        case 'po':
          if (resourceName) {
            result = await coreApi.readNamespacedPod(resourceName, namespace);
          } else {
            result = await coreApi.listNamespacedPod(namespace);
          }
          break;

        case 'services':
        case 'service':
        case 'svc':
          if (resourceName) {
            result = await coreApi.readNamespacedService(resourceName, namespace);
          } else {
            result = await coreApi.listNamespacedService(namespace);
          }
          break;

        case 'deployments':
        case 'deployment':
        case 'deploy':
          if (resourceName) {
            result = await appsApi.readNamespacedDeployment(resourceName, namespace);
          } else {
            result = await appsApi.listNamespacedDeployment(namespace);
          }
          break;

        case 'namespaces':
        case 'namespace':
        case 'ns':
          if (resourceName) {
            result = await coreApi.readNamespace(resourceName);
          } else {
            result = await coreApi.listNamespace();
          }
          break;

        case 'nodes':
        case 'node':
        case 'no':
          if (resourceName) {
            result = await coreApi.readNode(resourceName);
          } else {
            result = await coreApi.listNode();
          }
          break;

        default:
          return {
            success: false,
            output: '',
            error: `Resource type '${resourceType}' not supported`,
            exitCode: 1,
          };
      }

      const output = this.formatKubernetesOutput(result.body, resourceType, args.includes('-o'));
      
      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleDescribeCommand(args: string[]): Promise<KubectlResult> {
    try {
      const [resourceType, resourceName] = args;
      const namespace = this.extractNamespace(args) || this.k8sManager.getCurrentNamespace();

      if (!resourceType || !resourceName) {
        return {
          success: false,
          output: '',
          error: 'Resource type and name required',
          exitCode: 1,
        };
      }

      // Get the resource first
      const getResult = await this.handleGetCommand([resourceType, resourceName, ...args.slice(2)]);
      
      if (!getResult.success) {
        return getResult;
      }

      // Format as describe output (simplified)
      const output = `Name:         ${resourceName}\nNamespace:    ${namespace}\n${getResult.output}`;

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleCreateCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Create command not implemented - use apply instead',
      exitCode: 1,
    };
  }

  private async handleApplyCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Apply command not implemented',
      exitCode: 1,
    };
  }

  private async handleDeleteCommand(args: string[]): Promise<KubectlResult> {
    try {
      const [resourceType, resourceName] = args;
      const namespace = this.extractNamespace(args) || this.k8sManager.getCurrentNamespace();

      if (!resourceType || !resourceName) {
        return {
          success: false,
          output: '',
          error: 'Resource type and name required',
          exitCode: 1,
        };
      }

      const coreApi = this.k8sManager.getCoreV1Api();
      const appsApi = this.k8sManager.getAppsV1Api();

      switch ((resourceType || '').toLowerCase()) {
        case 'pod':
        case 'pods':
          await coreApi.deleteNamespacedPod(resourceName, namespace);
          break;

        case 'service':
        case 'svc':
          await coreApi.deleteNamespacedService(resourceName, namespace);
          break;

        case 'deployment':
        case 'deploy':
          await appsApi.deleteNamespacedDeployment(resourceName, namespace);
          break;

        default:
          return {
            success: false,
            output: '',
            error: `Delete not supported for resource type '${resourceType}'`,
            exitCode: 1,
          };
      }

      return {
        success: true,
        output: `${resourceType} "${resourceName}" deleted`,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handlePatchCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Patch command not implemented',
      exitCode: 1,
    };
  }

  private async handleScaleCommand(args: string[]): Promise<KubectlResult> {
    try {
      const resourceArg = args.find((arg: string) => arg.includes('/'));
      const replicasArg = args.find((arg: string) => arg.startsWith('--replicas='));

      if (!resourceArg || !replicasArg) {
        return {
          success: false,
          output: '',
          error: 'Resource and replicas required (e.g., deployment/myapp --replicas=3)',
          exitCode: 1,
        };
      }

      const [resourceType, resourceName] = resourceArg.split('/');
      const replicas = parseInt(replicasArg?.split('=')?.[1] || '1');
      const namespace = this.extractNamespace(args) || this.k8sManager.getCurrentNamespace();

      if (isNaN(replicas)) {
        return {
          success: false,
          output: '',
          error: 'Invalid replicas count',
          exitCode: 1,
        };
      }

      const appsApi = this.k8sManager.getAppsV1Api();

      switch ((resourceType || '').toLowerCase()) {
        case 'deployment':
        case 'deploy':
          await appsApi.patchNamespacedDeploymentScale(
            (resourceName || ''),
            namespace,
            { spec: { replicas } },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { headers: { 'Content-Type': 'application/merge-patch+json' } }
          );
          break;

        default:
          return {
            success: false,
            output: '',
            error: `Scale not supported for resource type '${resourceType}'`,
            exitCode: 1,
          };
      }

      return {
        success: true,
        output: `${resourceType} "${resourceName}" scaled`,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleRolloutCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Rollout command not implemented',
      exitCode: 1,
    };
  }

  private async handleLogsCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Logs command not implemented - use pod logs tool instead',
      exitCode: 1,
    };
  }

  private async handleExecCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Exec command not implemented - use pod exec tool instead',
      exitCode: 1,
    };
  }

  private async handlePortForwardCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Port-forward command not implemented',
      exitCode: 1,
    };
  }

  private async handleCpCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'Copy command not implemented',
      exitCode: 1,
    };
  }

  private async handleTopCommand(args: string[]): Promise<KubectlResult> {
    try {
      const [resourceType] = args;
      const namespace = this.extractNamespace(args) || this.k8sManager.getCurrentNamespace();

      if (!resourceType) {
        return {
          success: false,
          output: '',
          error: 'Resource type required (nodes or pods)',
          exitCode: 1,
        };
      }

      const metricsApi = this.k8sManager.getMetricsApi();

      switch ((resourceType || '').toLowerCase()) {
        case 'nodes':
        case 'node':
          const nodeMetrics = await metricsApi.getNodeMetrics();
          return {
            success: true,
            output: this.formatNodeMetrics(nodeMetrics),
          };

        case 'pods':
        case 'pod':
          const podMetrics = await metricsApi.getPodMetrics(namespace);
          return {
            success: true,
            output: this.formatPodMetrics(podMetrics),
          };

        default:
          return {
            success: false,
            output: '',
            error: `Top not supported for resource type '${resourceType}'`,
            exitCode: 1,
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Metrics not available: ${this.k8sManager.handleKubernetesError(error).message}`,
        exitCode: 1,
      };
    }
  }

  private async handleConfigCommand(args: string[]): Promise<KubectlResult> {
    try {
      const [subCommand] = args;

      switch (subCommand) {
        case 'get-contexts':
          const contexts = await this.k8sManager.listContexts();
          const currentContext = this.k8sManager.getCurrentContext();
          const output = contexts.map(ctx => 
            ctx === currentContext ? `* ${ctx}` : `  ${ctx}`
          ).join('\n');
          
          return {
            success: true,
            output,
          };

        case 'current-context':
          return {
            success: true,
            output: this.k8sManager.getCurrentContext() || 'No current context',
          };

        case 'use-context':
          const [, contextName] = args;
          if (!contextName) {
            return {
              success: false,
              output: '',
              error: 'Context name required',
              exitCode: 1,
            };
          }
          
          await this.k8sManager.switchContext(contextName);
          return {
            success: true,
            output: `Switched to context "${contextName}".`,
          };

        default:
          return {
            success: false,
            output: '',
            error: `Config subcommand '${subCommand}' not supported`,
            exitCode: 1,
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleClusterInfoCommand(_args: string[]): Promise<KubectlResult> {
    try {
      const clusterInfo = await this.k8sManager.getClusterInfo();
      
      const output = [
        `Kubernetes control plane is running at ${clusterInfo.server}`,
        ``,
        `To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.`,
      ].join('\n');

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleVersionCommand(_args: string[]): Promise<KubectlResult> {
    try {
      const clusterInfo = await this.k8sManager.getClusterInfo();
      
      const output = [
        `Client Version: kubectl (simulated)`,
        `Server Version: ${clusterInfo.version || 'unknown'}`,
      ].join('\n');

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: this.k8sManager.handleKubernetesError(error).message,
        exitCode: 1,
      };
    }
  }

  private async handleApiVersionsCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'API versions command not implemented',
      exitCode: 1,
    };
  }

  private async handleApiResourcesCommand(_args: string[]): Promise<KubectlResult> {
    return {
      success: false,
      output: '',
      error: 'API resources command not implemented',
      exitCode: 1,
    };
  }

  // Utility methods
  private extractNamespace(args: string[]): string | undefined {
    const nsIndex = args.findIndex((arg: string) => arg === '-n' || arg === '--namespace');
    if (nsIndex !== -1 && nsIndex + 1 < args.length) {
      return args[nsIndex + 1];
    }
    
    const nsArg = args.find((arg: string) => arg.startsWith('--namespace='));
    if (nsArg) {
      return nsArg.split('=')[1];
    }
    
    return undefined;
  }

  private formatKubernetesOutput(data: any, _resourceType: string, isJson: boolean): string {
    if (isJson) {
      return JSON.stringify(data, null, 2);
    }

    // Simplified table format
    if (Array.isArray(data.items)) {
      const items = data.items;
      if (items.length === 0) {
        return `No resources found.`;
      }

      const headers = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'];
      const rows = items.map((item: any) => {
        const name = item.metadata?.name || 'unknown';
        const ready = this.getReadyStatus(item);
        const status = this.getStatus(item);
        const restarts = this.getRestarts(item);
        const age = this.getAge(item.metadata?.creationTimestamp);
        
        return [name, ready, status, restarts, age];
      });

      return this.formatTable(headers, rows);
    } else {
      // Single resource
      return JSON.stringify(data, null, 2);
    }
  }

  private formatTable(headers: string[], rows: string[][]): string {
    const columnWidths = headers.map((header, i) => {
      const maxWidth = Math.max(
        header.length,
        ...rows.map(row => row[i]?.length || 0)
      );
      return Math.max(maxWidth, 8);
    });

    const headerRow = headers.map((header, i) => 
      header.padEnd(columnWidths[i] || 0)
    ).join('  ');

    const dataRows = rows.map(row =>
      row.map((cell, i) => 
        (cell || '').padEnd(columnWidths[i] || 0)
      ).join('  ')
    );

    return [headerRow, ...dataRows].join('\n');
  }

  private getReadyStatus(item: any): string {
    if (item.status?.readyReplicas && item.status?.replicas) {
      return `${item.status.readyReplicas}/${item.status.replicas}`;
    }
    if (item.status?.containerStatuses) {
      const ready = item.status.containerStatuses.filter((cs: any) => cs.ready).length;
      const total = item.status.containerStatuses.length;
      return `${ready}/${total}`;
    }
    return 'N/A';
  }

  private getStatus(item: any): string {
    return item.status?.phase || item.status?.conditions?.[0]?.type || 'Unknown';
  }

  private getRestarts(item: any): string {
    if (item.status?.containerStatuses) {
      const restarts = item.status.containerStatuses.reduce(
        (total: number, cs: any) => total + (cs.restartCount || 0), 0
      );
      return restarts.toString();
    }
    return '0';
  }

  private getAge(creationTimestamp: string): string {
    if (!creationTimestamp) return 'unknown';
    
    const created = new Date(creationTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  }

  private formatNodeMetrics(_metrics: any): string {
    // Simplified node metrics formatting
    return 'Node metrics not available (metrics-server required)';
  }

  private formatPodMetrics(_metrics: any): string {
    // Simplified pod metrics formatting
    return 'Pod metrics not available (metrics-server required)';
  }
}
