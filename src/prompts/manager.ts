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

    this.handlers.set('k8s-pod-crashloop-diagnose', {
      name: 'k8s-pod-crashloop-diagnose',
      description: 'Diagnose why a pod is in a CrashLoopBackOff state and provide step-by-step remediation guidance.',
      arguments: {
        podName: { type: 'string', description: 'Pod name to diagnose' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `CrashLoopBackOff diagnosis for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyze the pod ${args['podName']} in namespace ${args['namespace'] || 'current'} for CrashLoopBackOff issues.\n\nChecklist:\n- Check recent events for the pod (image pull errors, OOM, etc.)\n- Inspect container logs for stack traces or errors\n- Review resource requests/limits\n- Examine readiness/liveness probes\n- Suggest specific fixes for the root cause.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-image-pull-failure', {
      name: 'k8s-image-pull-failure',
      description: 'Investigate and resolve image pull errors for a deployment or pod.',
      arguments: {
        resourceName: { type: 'string', description: 'Deployment or pod name' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Image pull failure investigation for ${args['resourceName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Investigate why the image for ${args['resourceName']} in namespace ${args['namespace'] || 'current'} failed to pull.\n\nChecklist:\n- Verify image name and tag\n- Check registry credentials and access\n- Confirm network connectivity to registry\n- Review events for authentication or DNS errors\n- Provide actionable steps to resolve the issue.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-pod-network-diagnose', {
      name: 'k8s-pod-network-diagnose',
      description: 'Diagnose networking issues for a pod, such as connectivity or DNS failures.',
      arguments: {
        podName: { type: 'string', description: 'Pod name to diagnose' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Network diagnosis for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Diagnose networking issues for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}.\n\nChecklist:\n- Check pod IP and status\n- Test DNS resolution from within the pod\n- Verify service endpoints and selectors\n- Inspect network policies\n- Suggest troubleshooting steps and possible fixes.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-pv-mount-failure', {
      name: 'k8s-pv-mount-failure',
      description: 'Troubleshoot why a pod\'s persistent volume failed to mount.',
      arguments: {
        podName: { type: 'string', description: 'Pod name to diagnose' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Persistent volume mount failure for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyze why the persistent volume for pod ${args['podName']} in namespace ${args['namespace'] || 'current'} failed to mount.\n\nChecklist:\n- Check PVC status and events\n- Review storage class and access modes\n- Inspect node and pod events for mount errors\n- Recommend steps to resolve the mount issue.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-cluster-resource-pressure', {
      name: 'k8s-cluster-resource-pressure',
      description: 'Identify and address resource pressure (CPU, memory) in the cluster.',
      arguments: {},
      handler: async () => ({
        description: 'Cluster resource pressure assessment',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Assess the cluster for resource pressure.\n\nChecklist:\n- Identify nodes or namespaces with high CPU/memory usage\n- Review pod eviction events\n- Recommend actions to rebalance workloads or increase resources.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-service-unreachable', {
      name: 'k8s-service-unreachable',
      description: 'Diagnose why a Kubernetes service is not reachable from within or outside the cluster.',
      arguments: {
        serviceName: { type: 'string', description: 'Service name' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Service unreachable diagnosis for ${args['serviceName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Diagnose why service ${args['serviceName']} in namespace ${args['namespace'] || 'current'} is unreachable.\n\nChecklist:\n- Check endpoints and selectors\n- Review service type and ports\n- Inspect network policies\n- Suggest steps to restore connectivity.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-rbac-access-denied', {
      name: 'k8s-rbac-access-denied',
      description: 'Help users resolve RBAC "access denied" errors.',
      arguments: {
        subject: { type: 'string', description: 'User, group, or service account' },
        verb: { type: 'string', description: 'Action (e.g., get, list, create)' },
        resource: { type: 'string', description: 'Resource type (e.g., pods, deployments)' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `RBAC access denied troubleshooting for ${args['subject']} on ${args['resource']} (${args['verb']}) in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `User or service account ${args['subject']} was denied permission to ${args['verb']} ${args['resource']} in namespace ${args['namespace'] || 'current'}.\n\nChecklist:\n- Analyze RBAC roles and bindings\n- Check for missing or misconfigured role bindings\n- Provide steps to grant the necessary access.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-pod-resource-usage', {
      name: 'k8s-pod-resource-usage',
      description: 'Analyze resource usage (CPU, memory) for a specific pod and provide optimization tips.',
      arguments: {
        podName: { type: 'string', description: 'Pod name' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Resource usage analysis for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyze CPU and memory usage for pod ${args['podName']} in namespace ${args['namespace'] || 'current'}.\n\nChecklist:\n- Compare requests/limits to actual usage\n- Identify over/under-provisioned resources\n- Suggest optimizations for resource allocation.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-deployment-rollout-troubleshoot', {
      name: 'k8s-deployment-rollout-troubleshoot',
      description: 'Troubleshoot a stuck or failed deployment rollout.',
      arguments: {
        deploymentName: { type: 'string', description: 'Deployment name' },
        namespace: { type: 'string', description: 'Namespace (optional)' }
      },
      handler: async (args) => ({
        description: `Deployment rollout troubleshooting for ${args['deploymentName']} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Troubleshoot the rollout of deployment ${args['deploymentName']} in namespace ${args['namespace'] || 'current'}.\n\nChecklist:\n- Check for unavailable replicas\n- Review failed pods and events\n- Suggest steps to resolve rollout issues.`
            }
          }
        ]
      })
    });

    this.handlers.set('k8s-best-practices-audit', {
      name: 'k8s-best-practices-audit',
      description: 'Audit a namespace or deployment for Kubernetes best practices.',
      arguments: {
        namespace: { type: 'string', description: 'Namespace (optional)' },
        deploymentName: { type: 'string', description: 'Deployment name (optional)' }
      },
      handler: async (args) => ({
        description: `Best practices audit for ${args['deploymentName'] ? `deployment ${args['deploymentName']}` : 'namespace'} in namespace ${args['namespace'] || 'current'}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Audit the configuration of ${args['deploymentName'] ? `deployment ${args['deploymentName']}` : 'the namespace'} in namespace ${args['namespace'] || 'current'} for Kubernetes best practices.\n\nChecklist:\n- Check for resource requests/limits\n- Liveness/readiness probes\n- Use of latest image tags\n- Security context and RBAC\n- Provide a summary and recommendations.`
            }
          }
        ]
      })
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
