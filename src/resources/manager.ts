import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { KubernetesManager } from '../kubernetes/manager.js';
import { logger, logError } from '../utils/logger.js';

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface ResourceHandler {
  scheme: string;
  description: string;
  handler: (uri: string) => Promise<ResourceContent>;
}

export class ResourceManager {
  private handlers = new Map<string, ResourceHandler>();

  constructor(
    private k8sManager: KubernetesManager
  ) {
    this.registerResources();
  }

  private registerResources(): void {
    // Register Kubernetes resource handlers
    this.register({
      scheme: 'k8s-pod',
      description: 'Kubernetes Pod resource',
      handler: async (uri) => this.handlePodResource(uri),
    });

    this.register({
      scheme: 'k8s-deployment',
      description: 'Kubernetes Deployment resource',
      handler: async (uri) => this.handleDeploymentResource(uri),
    });

    this.register({
      scheme: 'k8s-service',
      description: 'Kubernetes Service resource',
      handler: async (uri) => this.handleServiceResource(uri),
    });

    this.register({
      scheme: 'k8s-configmap',
      description: 'Kubernetes ConfigMap resource',
      handler: async (uri) => this.handleConfigMapResource(uri),
    });

    this.register({
      scheme: 'k8s-secret',
      description: 'Kubernetes Secret resource',
      handler: async (uri) => this.handleSecretResource(uri),
    });

    this.register({
      scheme: 'k8s-namespace',
      description: 'Kubernetes Namespace resource',
      handler: async (uri) => this.handleNamespaceResource(uri),
    });

    this.register({
      scheme: 'k8s-node',
      description: 'Kubernetes Node resource',
      handler: async (uri) => this.handleNodeResource(uri),
    });

    this.register({
      scheme: 'k8s-logs',
      description: 'Pod logs resource',
      handler: async (uri) => this.handleLogsResource(uri),
    });

    this.register({
      scheme: 'k8s-events',
      description: 'Kubernetes Events resource',
      handler: async (uri) => this.handleEventsResource(uri),
    });

    this.register({
      scheme: 'k8s-manifest',
      description: 'Kubernetes YAML manifest resource',
      handler: async (uri) => this.handleManifestResource(uri),
    });

    logger.info('Registered resource handlers', { count: this.handlers.size });
  }

  register(handler: ResourceHandler): void {
    this.handlers.set(handler.scheme, handler);
  }

  async readResource(uri: string): Promise<ResourceContent> {
    try {
      const url = new URL(uri);
      const handler = this.handlers.get(url.protocol.slice(0, -1)); // Remove trailing ':'

      if (!handler) {
        throw new Error(`No handler found for scheme: ${url.protocol}`);
      }

      logger.info('Reading resource', { uri, scheme: url.protocol });
      const content = await handler.handler(uri);
      
      return content;
    } catch (error) {
      logError(`Failed to read resource: ${uri}`, error as Error);
      throw error;
    }
  }

  listResources(): Resource[] {
    return Array.from(this.handlers.values()).map(handler => ({
      uri: `${handler.scheme}://`,
      name: handler.scheme,
      description: handler.description,
      mimeType: 'application/json',
    }));
  }

  // Resource handler implementations

  private async handlePodResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('Pod resource URI must include namespace and pod name: k8s-pod://namespace/podname');
    }

    const namespace = pathParts[0];
    const podName = pathParts[1];
    
    if (!namespace || !podName) {
      throw new Error('Invalid pod resource URI: missing namespace or pod name');
    }
    
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespacedPod(podName!, namespace!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleDeploymentResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('Deployment resource URI must include namespace and deployment name: k8s-deployment://namespace/deploymentname');
    }

    const [namespace, deploymentName] = pathParts;
    const appsApi = this.k8sManager.getAppsV1Api();
    
    try {
      const response = await appsApi.readNamespacedDeployment(deploymentName!, namespace!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleServiceResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('Service resource URI must include namespace and service name: k8s-service://namespace/servicename');
    }

    const [namespace, serviceName] = pathParts;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespacedService(serviceName!, namespace!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleConfigMapResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('ConfigMap resource URI must include namespace and configmap name: k8s-configmap://namespace/configmapname');
    }

    const [namespace, configMapName] = pathParts;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespacedConfigMap(configMapName!, namespace!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleSecretResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('Secret resource URI must include namespace and secret name: k8s-secret://namespace/secretname');
    }

    const [namespace, secretName] = pathParts;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespacedSecret(secretName!, namespace!);
      
      // Note: In production, you might want to mask secret values
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleNamespaceResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 1) {
      throw new Error('Namespace resource URI must include namespace name: k8s-namespace://namespacename');
    }

    const [namespaceName] = pathParts;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespace(namespaceName!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2!),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleNodeResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 1) {
      throw new Error('Node resource URI must include node name: k8s-node://nodename');
    }

    const [nodeName] = pathParts;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNode(nodeName!);
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2!),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleLogsResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 2) {
      throw new Error('Logs resource URI must include namespace and pod name: k8s-logs://namespace/podname');
    }

    const [namespace, podName] = pathParts;
    const searchParams = new URLSearchParams(url.search);
    const container = searchParams.get('container') || undefined;
    const lines = searchParams.get('lines') ? parseInt(searchParams.get('lines')!) : 100;
    
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      const response = await coreApi.readNamespacedPodLog(podName!,
        (namespace || this.k8sManager.getCurrentNamespace()),
        container,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        lines,
        undefined!);
      
      return {
        uri,
        mimeType: 'text/plain',
        text: response.body,
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleEventsResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    // Events can be namespace-scoped or cluster-wide
    const namespace = pathParts.length > 0 ? pathParts[0] : undefined;
    const coreApi = this.k8sManager.getCoreV1Api();
    
    try {
      let response;
      if (namespace) {
        response = await coreApi.listNamespacedEvent(namespace);
      } else {
        response = await coreApi.listEventForAllNamespaces();
      }
      
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(response.body, null, 2),
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  private async handleManifestResource(uri: string): Promise<ResourceContent> {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length < 3) {
      throw new Error('Manifest resource URI must include resource type, namespace, and name: k8s-manifest://type/namespace/name');
    }

    const [resourceType, namespace, resourceName] = pathParts;
    
    // This is a simplified implementation - in practice, you'd need to handle different API versions
    try {
      let response;
      const coreApi = this.k8sManager.getCoreV1Api();
      const appsApi = this.k8sManager.getAppsV1Api();

      switch (resourceType?.toLowerCase()) {
        case 'pod':
          response = await coreApi.readNamespacedPod(resourceName!, namespace!);
          break;
        case 'service':
          response = await coreApi.readNamespacedService(resourceName!, namespace!);
          break;
        case 'deployment':
          response = await appsApi.readNamespacedDeployment(resourceName!, namespace!);
          break;
        case 'configmap':
          response = await coreApi.readNamespacedConfigMap(resourceName!, namespace!);
          break;
        case 'secret':
          response = await coreApi.readNamespacedSecret(resourceName!, namespace!);
          break;
        default:
          throw new Error(`Resource type '${resourceType}' not supported for manifest generation`);
      }

      // Convert to YAML-like representation
      const yamlContent = this.objectToYaml(response.body);
      
      return {
        uri,
        mimeType: 'application/x-yaml',
        text: yamlContent,
      };
    } catch (error) {
      throw this.k8sManager.handleKubernetesError(error);
    }
  }

  // Utility method to convert object to YAML-like string
  private objectToYaml(obj: any): string {
    // This is a simplified YAML conversion
    // In practice, you'd use a proper YAML library
    return JSON.stringify(obj, null, 2);
  }
}
