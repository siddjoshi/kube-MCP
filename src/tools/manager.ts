import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KubernetesManager } from '../kubernetes/manager.js';
import { KubectlExecutor } from '../kubernetes/kubectl.js';
import { logger, logError, logOperation } from '../utils/logger.js';

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (_args: Record<string, unknown>) => Promise<ToolResult>;
}

export class ToolManager {
  private handlers = new Map<string, ToolHandler>();
  private kubectlExecutor: KubectlExecutor;

  constructor(
    private k8sManager: KubernetesManager
  ) {
    this.kubectlExecutor = new KubectlExecutor(k8sManager);
    this.registerTools();
  }

  private registerTools(): void {
    // Resource management tools
    this.register(this.createGetPodsToolHandler());
    this.register(this.createGetDeploymentsToolHandler());
    this.register(this.createGetServicesToolHandler());
    this.register(this.createGetNamespacesToolHandler());
    this.register(this.createGetNodesToolHandler());
    this.register(this.createDescribeResourceToolHandler());

    // Kubectl command tools
    this.register(this.createKubectlToolHandler());

    // Pod management tools
    this.register(this.createPodLogsToolHandler());
    this.register(this.createPodExecToolHandler());
    this.register(this.createDeletePodToolHandler());

    // Deployment management tools
    this.register(this.createScaleDeploymentToolHandler());
    this.register(this.createRestartDeploymentToolHandler());
    this.register(this.createRolloutStatusToolHandler());

    // Service management tools
    this.register(this.createPortForwardToolHandler());
    this.register(this.createCreateServiceToolHandler());

    // Configuration tools
    this.register(this.createGetConfigMapToolHandler());
    this.register(this.createGetSecretToolHandler());
    this.register(this.createApplyManifestToolHandler());

    // Monitoring and diagnostics tools
    this.register(this.createClusterInfoToolHandler());
    this.register(this.createNodeMetricsToolHandler());
    this.register(this.createPodMetricsToolHandler());
    this.register(this.createClusterHealthToolHandler());

    // Network tools
    this.register(this.createGetIngressToolHandler());
    this.register(this.createGetNetworkPoliciesToolHandler());

    // Security tools
    this.register(this.createGetRolesToolHandler());
    this.register(this.createGetRoleBindingsToolHandler());
    this.register(this.createGetServiceAccountsToolHandler());

    // Storage tools
    this.register(this.createGetPersistentVolumesToolHandler());
    this.register(this.createGetPersistentVolumeClaimsToolHandler());
    this.register(this.createGetStorageClassesToolHandler());

    // Custom resource tools
    this.register(this.createGetCustomResourcesToolHandler());
    this.register(this.createGetCRDsToolHandler());

    // Context and namespace tools
    this.register(this.createSwitchContextToolHandler());
    this.register(this.createSetNamespaceToolHandler());
    this.register(this.createListContextsToolHandler());

    // Helm tools
    this.register(this.createHelmListToolHandler());
    this.register(this.createHelmInstallToolHandler());
    this.register(this.createHelmUpgradeToolHandler());
    this.register(this.createHelmUninstallToolHandler());

    // Utility tools
    this.register(this.createValidateYamlToolHandler());
    this.register(this.createGenerateManifestToolHandler());
    this.register(this.createDryRunToolHandler());

    logger.info('Registered tools', { count: this.handlers.size });
  }

  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Tool '${name}' not found`);
    }

    try {
      logOperation('tool_execute', name);
      const result = await handler.handler(args);
      
      logger.info('Tool executed successfully', {
        tool: name,
        argsCount: Object.keys(args).length,
      });

      return result;
    } catch (error) {
      logError(`Tool '${name}' execution failed`, error as Error);
      
      return {
        content: [{
          type: 'text',
          text: `Error executing tool '${name}': ${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  }

  listTools(): Tool[] {
    return Array.from(this.handlers.values()).map(handler => ({
      name: handler.name,
      description: handler.description,
      inputSchema: {
        type: 'object' as const,
        properties: (handler.inputSchema as any).properties || {},
        required: (handler.inputSchema as any).required || [],
      },
    }));
  }

  // Tool handler implementations

  private createGetPodsToolHandler(): ToolHandler {
    return {
      name: 'get_pods',
      description: 'Get pods in a namespace',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
          labelSelector: {
            type: 'string',
            description: 'Label selector to filter pods',
          },
        },
      },
      handler: async (args) => {
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();
        const labelSelector = args['labelSelector'] as string;

        const coreApi = this.k8sManager.getCoreV1Api();
        const response = await coreApi.listNamespacedPod(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          labelSelector
        );

        const pods = response.body.items.map(pod => ({
          name: pod.metadata?.name,
          namespace: pod.metadata?.namespace,
          status: pod.status?.phase,
          ready: this.getPodReadyStatus(pod),
          restarts: this.getPodRestarts(pod),
          age: this.getAge(pod.metadata?.creationTimestamp),
          node: pod.spec?.nodeName,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ pods }, null, 2),
          }],
        };
      },
    };
  }

  private createGetDeploymentsToolHandler(): ToolHandler {
    return {
      name: 'get_deployments',
      description: 'Get deployments in a namespace',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
        },
      },
      handler: async (args) => {
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();

        const appsApi = this.k8sManager.getAppsV1Api();
        const response = await appsApi.listNamespacedDeployment(namespace);

        const deployments = response.body.items.map(deployment => ({
          name: deployment.metadata?.name,
          namespace: deployment.metadata?.namespace,
          ready: `${deployment.status?.readyReplicas || 0}/${deployment.status?.replicas || 0}`,
          upToDate: deployment.status?.updatedReplicas || 0,
          available: deployment.status?.availableReplicas || 0,
          age: this.getAge(deployment.metadata?.creationTimestamp),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ deployments }, null, 2),
          }],
        };
      },
    };
  }

  private createGetServicesToolHandler(): ToolHandler {
    return {
      name: 'get_services',
      description: 'Get services in a namespace',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
        },
      },
      handler: async (args) => {
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();

        const coreApi = this.k8sManager.getCoreV1Api();
        const response = await coreApi.listNamespacedService(namespace);

        const services = response.body.items.map(service => ({
          name: service.metadata?.name,
          namespace: service.metadata?.namespace,
          type: service.spec?.type,
          clusterIP: service.spec?.clusterIP,
          externalIP: service.status?.loadBalancer?.ingress?.[0]?.ip || '<none>',
          ports: service.spec?.ports?.map(port => `${port.port}/${port.protocol}`).join(','),
          age: this.getAge(service.metadata?.creationTimestamp),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ services }, null, 2),
          }],
        };
      },
    };
  }

  private createGetNamespacesToolHandler(): ToolHandler {
    return {
      name: 'get_namespaces',
      description: 'Get all namespaces in the cluster',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const namespaces = await this.k8sManager.listNamespaces();

        const namespacesData = namespaces.map(ns => ({
          name: ns.metadata?.name,
          status: ns.status?.phase,
          age: this.getAge(ns.metadata?.creationTimestamp),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ namespaces: namespacesData }, null, 2),
          }],
        };
      },
    };
  }

  private createGetNodesToolHandler(): ToolHandler {
    return {
      name: 'get_nodes',
      description: 'Get all nodes in the cluster',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const coreApi = this.k8sManager.getCoreV1Api();
        const response = await coreApi.listNode();

        const nodes = response.body.items.map(node => ({
          name: node.metadata?.name,
          status: this.getNodeStatus(node),
          roles: this.getNodeRoles(node),
          age: this.getAge(node.metadata?.creationTimestamp),
          version: node.status?.nodeInfo?.kubeletVersion,
          internalIP: node.status?.addresses?.find(addr => addr.type === 'InternalIP')?.address,
          externalIP: node.status?.addresses?.find(addr => addr.type === 'ExternalIP')?.address || '<none>',
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ nodes }, null, 2),
          }],
        };
      },
    };
  }

  private createDescribeResourceToolHandler(): ToolHandler {
    return {
      name: 'describe_resource',
      description: 'Describe a Kubernetes resource',
      inputSchema: {
        type: 'object',
        properties: {
          resourceType: {
            type: 'string',
            description: 'Type of resource (pod, service, deployment, etc.)',
          },
          resourceName: {
            type: 'string',
            description: 'Name of the resource',
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
        },
        required: ['resourceType', 'resourceName'],
      },
      handler: async (args) => {
        const resourceType = args['resourceType'] as string;
        const resourceName = args['resourceName'] as string;
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();

        const result = await this.kubectlExecutor.execute('describe', [
          resourceType,
          resourceName,
          '-n',
          namespace,
        ]);

        return {
          content: [{
            type: 'text',
            text: result.success ? result.output : result.error || 'Unknown error',
          }],
          isError: !result.success,
        };
      },
    };
  }

  private createKubectlToolHandler(): ToolHandler {
    return {
      name: 'kubectl',
      description: 'Execute kubectl commands',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'kubectl command (e.g., get, describe, delete)',
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments',
          },
        },
        required: ['command'],
      },
      handler: async (args) => {
        const command = args['command'] as string;
        const cmdArgs = (args['args'] as string[]) || [];

        const result = await this.kubectlExecutor.execute(command, cmdArgs);

        return {
          content: [{
            type: 'text',
            text: result.success ? result.output : result.error || 'Unknown error',
          }],
          isError: !result.success,
        };
      },
    };
  }

  private createPodLogsToolHandler(): ToolHandler {
    return {
      name: 'pod_logs',
      description: 'Get logs from a pod',
      inputSchema: {
        type: 'object',
        properties: {
          podName: {
            type: 'string',
            description: 'Name of the pod',
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
          container: {
            type: 'string',
            description: 'Container name (for multi-container pods)',
          },
          lines: {
            type: 'number',
            description: 'Number of lines to retrieve (default: 100)',
          },
          follow: {
            type: 'boolean',
            description: 'Follow logs (stream)',
          },
        },
        required: ['podName'],
      },
      handler: async (args) => {
        const podName = args['podName'] as string;
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();
        const container = args['container'] as string;
        const lines = (args['lines'] as number) || 100;

        const coreApi = this.k8sManager.getCoreV1Api();
        
        try {
          const response = await coreApi.readNamespacedPodLog(
            podName,
            namespace,
            container,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            lines,
            undefined
          );

          return {
            content: [{
              type: 'text',
              text: response.body,
            }],
          };
        } catch (error) {
          throw this.k8sManager.handleKubernetesError(error);
        }
      },
    };
  }

  private createPodExecToolHandler(): ToolHandler {
    return {
      name: 'pod_exec',
      description: 'Execute a command in a pod',
      inputSchema: {
        type: 'object',
        properties: {
          podName: {
            type: 'string',
            description: 'Name of the pod',
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
          container: {
            type: 'string',
            description: 'Container name (for multi-container pods)',
          },
          command: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command to execute',
          },
        },
        required: ['podName', 'command'],
      },
      handler: async () => {
        // Note: This is a simplified implementation
        // Full exec functionality requires WebSocket connection
        return {
          content: [{
            type: 'text',
            text: 'Pod exec functionality not implemented (requires WebSocket connection)',
          }],
          isError: true,
        };
      },
    };
  }

  private createDeletePodToolHandler(): ToolHandler {
    return {
      name: 'delete_pod',
      description: 'Delete a pod',
      inputSchema: {
        type: 'object',
        properties: {
          podName: {
            type: 'string',
            description: 'Name of the pod to delete',
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
        },
        required: ['podName'],
      },
      handler: async (args) => {
        const podName = args['podName'] as string;
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();

        const result = await this.kubectlExecutor.execute('delete', ['pod', podName, '-n', namespace]);

        return {
          content: [{
            type: 'text',
            text: result.success ? result.output : result.error || 'Unknown error',
          }],
          isError: !result.success,
        };
      },
    };
  }

  private createScaleDeploymentToolHandler(): ToolHandler {
    return {
      name: 'scale_deployment',
      description: 'Scale a deployment',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentName: {
            type: 'string',
            description: 'Name of the deployment to scale',
          },
          replicas: {
            type: 'number',
            description: 'Number of replicas',
          },
          namespace: {
            type: 'string',
            description: 'Kubernetes namespace (defaults to current namespace)',
          },
        },
        required: ['deploymentName', 'replicas'],
      },
      handler: async (args) => {
        const deploymentName = args['deploymentName'] as string;
        const replicas = args['replicas'] as number;
        const namespace = (args['namespace'] as string) || this.k8sManager.getCurrentNamespace();

        const result = await this.kubectlExecutor.execute('scale', [
          `deployment/${deploymentName}`,
          `--replicas=${replicas}`,
          '-n',
          namespace,
        ]);

        return {
          content: [{
            type: 'text',
            text: result.success ? result.output : result.error || 'Unknown error',
          }],
          isError: !result.success,
        };
      },
    };
  }

  // Add placeholder implementations for remaining tools to keep the file from getting too long
  private createRestartDeploymentToolHandler(): ToolHandler {
    return this.createPlaceholderTool('restart_deployment', 'Restart a deployment by updating its template');
  }

  private createRolloutStatusToolHandler(): ToolHandler {
    return this.createPlaceholderTool('rollout_status', 'Check rollout status of a deployment');
  }

  private createPortForwardToolHandler(): ToolHandler {
    return this.createPlaceholderTool('port_forward', 'Forward local port to a pod port');
  }

  private createCreateServiceToolHandler(): ToolHandler {
    return this.createPlaceholderTool('create_service', 'Create a Kubernetes service');
  }

  private createGetConfigMapToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_configmaps', 'Get ConfigMaps in a namespace');
  }

  private createGetSecretToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_secrets', 'Get Secrets in a namespace');
  }

  private createApplyManifestToolHandler(): ToolHandler {
    return this.createPlaceholderTool('apply_manifest', 'Apply a Kubernetes manifest');
  }

  private createClusterInfoToolHandler(): ToolHandler {
    return {
      name: 'cluster_info',
      description: 'Get cluster information',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const clusterInfo = await this.k8sManager.getClusterInfo();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(clusterInfo, null, 2),
          }],
        };
      },
    };
  }

  private createNodeMetricsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('node_metrics', 'Get node resource metrics');
  }

  private createPodMetricsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('pod_metrics', 'Get pod resource metrics');
  }

  private createClusterHealthToolHandler(): ToolHandler {
    return {
      name: 'cluster_health',
      description: 'Check cluster health status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const health = await this.k8sManager.healthCheck();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(health, null, 2),
          }],
        };
      },
    };
  }

  private createGetIngressToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_ingress', 'Get Ingress resources');
  }

  private createGetNetworkPoliciesToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_network_policies', 'Get NetworkPolicy resources');
  }

  private createGetRolesToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_roles', 'Get RBAC Roles');
  }

  private createGetRoleBindingsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_role_bindings', 'Get RBAC RoleBindings');
  }

  private createGetServiceAccountsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_service_accounts', 'Get ServiceAccounts');
  }

  private createGetPersistentVolumesToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_persistent_volumes', 'Get PersistentVolumes');
  }

  private createGetPersistentVolumeClaimsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_persistent_volume_claims', 'Get PersistentVolumeClaims');
  }

  private createGetStorageClassesToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_storage_classes', 'Get StorageClasses');
  }

  private createGetCustomResourcesToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_custom_resources', 'Get Custom Resources');
  }

  private createGetCRDsToolHandler(): ToolHandler {
    return this.createPlaceholderTool('get_crds', 'Get CustomResourceDefinitions');
  }

  private createSwitchContextToolHandler(): ToolHandler {
    return {
      name: 'switch_context',
      description: 'Switch Kubernetes context',
      inputSchema: {
        type: 'object',
        properties: {
          contextName: {
            type: 'string',
            description: 'Name of the context to switch to',
          },
        },
        required: ['contextName'],
      },
      handler: async (args) => {
        const contextName = args['contextName'] as string;
        await this.k8sManager.switchContext(contextName);
        
        return {
          content: [{
            type: 'text',
            text: `Switched to context "${contextName}"`,
          }],
        };
      },
    };
  }

  private createSetNamespaceToolHandler(): ToolHandler {
    return {
      name: 'set_namespace',
      description: 'Set current namespace',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Namespace to set as current',
          },
        },
        required: ['namespace'],
      },
      handler: async (args) => {
        const namespace = args['namespace'] as string;
        await this.k8sManager.setCurrentNamespace(namespace);
        
        return {
          content: [{
            type: 'text',
            text: `Set current namespace to "${namespace}"`,
          }],
        };
      },
    };
  }

  private createListContextsToolHandler(): ToolHandler {
    return {
      name: 'list_contexts',
      description: 'List available Kubernetes contexts',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const contexts = await this.k8sManager.listContexts();
        const currentContext = this.k8sManager.getCurrentContext();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ 
              contexts, 
              currentContext 
            }, null, 2),
          }],
        };
      },
    };
  }

  private createHelmListToolHandler(): ToolHandler {
    return this.createPlaceholderTool('helm_list', 'List Helm releases');
  }

  private createHelmInstallToolHandler(): ToolHandler {
    return this.createPlaceholderTool('helm_install', 'Install a Helm chart');
  }

  private createHelmUpgradeToolHandler(): ToolHandler {
    return this.createPlaceholderTool('helm_upgrade', 'Upgrade a Helm release');
  }

  private createHelmUninstallToolHandler(): ToolHandler {
    return this.createPlaceholderTool('helm_uninstall', 'Uninstall a Helm release');
  }

  private createValidateYamlToolHandler(): ToolHandler {
    return this.createPlaceholderTool('validate_yaml', 'Validate Kubernetes YAML manifest');
  }

  private createGenerateManifestToolHandler(): ToolHandler {
    return this.createPlaceholderTool('generate_manifest', 'Generate Kubernetes manifest');
  }

  private createDryRunToolHandler(): ToolHandler {
    return this.createPlaceholderTool('dry_run', 'Perform dry run of kubectl apply');
  }

  // Helper method to create placeholder tools
  private createPlaceholderTool(name: string, description: string): ToolHandler {
    return {
      name,
      description,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => ({
        content: [{
          type: 'text',
          text: `Tool '${name}' not yet implemented`,
        }],
        isError: true,
      }),
    };
  }

  // Utility methods
  private getPodReadyStatus(pod: any): string {
    if (!pod.status?.containerStatuses) return '0/0';
    
    const ready = pod.status.containerStatuses.filter((cs: any) => cs.ready).length;
    const total = pod.status.containerStatuses.length;
    return `${ready}/${total}`;
  }

  private getPodRestarts(pod: any): number {
    if (!pod.status?.containerStatuses) return 0;
    
    return pod.status.containerStatuses.reduce(
      (total: number, cs: any) => total + (cs.restartCount || 0), 0
    );
  }

  private getAge(creationTimestamp?: Date | string): string {
    if (!creationTimestamp) return 'unknown';
    
    const created = typeof creationTimestamp === 'string' ? new Date(creationTimestamp) : creationTimestamp;
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  }

  private getNodeStatus(node: any): string {
    const readyCondition = node.status?.conditions?.find(
      (condition: any) => condition.type === 'Ready'
    );
    return readyCondition?.status === 'True' ? 'Ready' : 'NotReady';
  }

  private getNodeRoles(node: any): string {
    const labels = node.metadata?.labels || {};
    const roles = Object.keys(labels)
      .filter(label => label.startsWith('node-role.kubernetes.io/'))
      .map(label => label.replace('node-role.kubernetes.io/', ''));
    
    return roles.length > 0 ? roles.join(',') : '<none>';
  }
}
