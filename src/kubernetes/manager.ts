import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Config } from '../config/config.js';
import { logger, logError, logOperation } from '../utils/logger.js';

export interface ClusterInfo {
  name: string;
  server: string;
  version?: string;
  nodes?: number;
  namespaces?: string[];
}

export interface HealthStatus {
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export class KubernetesManager {
  private kubeConfig: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;
  private batchV1Api: k8s.BatchV1Api;
  private rbacV1Api: k8s.RbacAuthorizationV1Api;
  private networkingV1Api: k8s.NetworkingV1Api;
  private customObjectsApi: k8s.CustomObjectsApi;
  private apiExtensionsApi: k8s.ApiextensionsV1Api;
  private metricsApi: k8s.Metrics;

  private currentContext?: string;
  private currentNamespace: string;
  private connectionEstablished = false;

  constructor(private config: Config) {
    this.kubeConfig = new k8s.KubeConfig();
    this.currentNamespace = config.kubernetes.namespace;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Kubernetes manager...');

      // Load kubeconfig from various sources
      await this.loadKubeConfig();

      // Initialize API clients
      this.initializeApiClients();

      // Test connection
      await this.testConnection();

      // Set current context and namespace
      this.currentContext = this.kubeConfig.getCurrentContext();
      
      if (this.config.kubernetes.context && this.currentContext !== this.config.kubernetes.context) {
        this.kubeConfig.setCurrentContext(this.config.kubernetes.context);
        this.currentContext = this.config.kubernetes.context;
      }

      this.connectionEstablished = true;
      logger.info('Kubernetes manager initialized successfully', {
        context: this.currentContext,
        namespace: this.currentNamespace,
      });

    } catch (error) {
      logError('Failed to initialize Kubernetes manager', error as Error);
      throw error;
    }
  }

  private async loadKubeConfig(): Promise<void> {
    const authMethods = [
      () => this.loadFromInCluster(),
      () => this.loadFromEnvironmentYaml(),
      () => this.loadFromEnvironmentJson(),
      () => this.loadFromMinimalConfig(),
      () => this.loadFromCustomPath(),
      () => this.loadFromDefaultPath(),
    ];

    let lastError: Error | null = null;

    for (const method of authMethods) {
      try {
        await method();
        logger.info('Kubeconfig loaded successfully');
        return;
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`Failed to load kubeconfig: ${lastError?.message}`);
  }

  private async loadFromInCluster(): Promise<void> {
    if (this.isRunningInCluster()) {
      this.kubeConfig.loadFromCluster();
      logger.info('Loaded kubeconfig from in-cluster service account');
    } else {
      throw new Error('Not running in cluster');
    }
  }

  private async loadFromEnvironmentYaml(): Promise<void> {
    if (!this.config.kubernetes.kubeconfigYaml) {
      throw new Error('KUBECONFIG_YAML not provided');
    }

    this.kubeConfig.loadFromString(this.config.kubernetes.kubeconfigYaml);
    logger.info('Loaded kubeconfig from KUBECONFIG_YAML environment variable');
  }

  private async loadFromEnvironmentJson(): Promise<void> {
    if (!this.config.kubernetes.kubeconfigJson) {
      throw new Error('KUBECONFIG_JSON not provided');
    }

    const _unusedConfigObj = JSON.parse(this.config.kubernetes.kubeconfigJson);
    this.kubeConfig.loadFromString(JSON.stringify(_unusedConfigObj));
    logger.info('Loaded kubeconfig from KUBECONFIG_JSON environment variable');
  }

  private async loadFromMinimalConfig(): Promise<void> {
    if (!this.config.kubernetes.server || !this.config.kubernetes.token) {
      throw new Error('K8S_SERVER and K8S_TOKEN not provided');
    }

    const cluster = {
      name: 'default-cluster',
      server: this.config.kubernetes.server,
      skipTLSVerify: this.config.kubernetes.skipTlsVerify,
    };

    const user = {
      name: 'default-user',
      token: this.config.kubernetes.token,
    };

    const context = {
      name: 'default-context',
      cluster: cluster.name,
      user: user.name,
      namespace: this.config.kubernetes.namespace,
    };

    this.kubeConfig.loadFromOptions({
      clusters: [cluster],
      users: [user],
      contexts: [context],
      currentContext: context.name,
    });

    logger.info('Loaded kubeconfig from minimal environment configuration');
  }

  private async loadFromCustomPath(): Promise<void> {
    if (!this.config.kubernetes.kubeconfigPath) {
      throw new Error('KUBECONFIG_PATH not provided');
    }

    if (!fs.existsSync(this.config.kubernetes.kubeconfigPath)) {
      throw new Error(`Kubeconfig file not found: ${this.config.kubernetes.kubeconfigPath}`);
    }

    this.kubeConfig.loadFromFile(this.config.kubernetes.kubeconfigPath);
    logger.info(`Loaded kubeconfig from custom path: ${this.config.kubernetes.kubeconfigPath}`);
  }

  private async loadFromDefaultPath(): Promise<void> {
    const defaultPath = path.join(os.homedir(), '.kube', 'config');
    
    if (!fs.existsSync(defaultPath)) {
      throw new Error(`Default kubeconfig file not found: ${defaultPath}`);
    }

    this.kubeConfig.loadFromDefault();
    logger.info(`Loaded kubeconfig from default path: ${defaultPath}`);
  }

  private isRunningInCluster(): boolean {
    return fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount');
  }

  private initializeApiClients(): void {
    this.coreV1Api = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.batchV1Api = this.kubeConfig.makeApiClient(k8s.BatchV1Api);
    this.rbacV1Api = this.kubeConfig.makeApiClient(k8s.RbacAuthorizationV1Api);
    this.networkingV1Api = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
    this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);
    this.apiExtensionsApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1Api);
    this.metricsApi = new k8s.Metrics(this.kubeConfig);

    logger.info('Kubernetes API clients initialized');
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection by listing namespaces
      const response = await this.coreV1Api.listNamespace();
      logger.info('Kubernetes connection test successful', {
        namespacesCount: response.body.items.length,
      });
    } catch (error) {
      throw new Error(`Kubernetes connection test failed: ${(error as Error).message}`);
    }
  }

  // API getters
  getCoreV1Api(): k8s.CoreV1Api {
    this.ensureInitialized();
    return this.coreV1Api;
  }

  getAppsV1Api(): k8s.AppsV1Api {
    this.ensureInitialized();
    return this.appsV1Api;
  }

  getBatchV1Api(): k8s.BatchV1Api {
    this.ensureInitialized();
    return this.batchV1Api;
  }

  getRbacV1Api(): k8s.RbacAuthorizationV1Api {
    this.ensureInitialized();
    return this.rbacV1Api;
  }

  getNetworkingV1Api(): k8s.NetworkingV1Api {
    this.ensureInitialized();
    return this.networkingV1Api;
  }

  getCustomObjectsApi(): k8s.CustomObjectsApi {
    this.ensureInitialized();
    return this.customObjectsApi;
  }

  getApiExtensionsApi(): k8s.ApiextensionsV1Api {
    this.ensureInitialized();
    return this.apiExtensionsApi;
  }

  getMetricsApi(): k8s.Metrics {
    this.ensureInitialized();
    return this.metricsApi;
  }

  getKubeConfig(): k8s.KubeConfig {
    return this.kubeConfig;
  }

  getCurrentContext(): string | undefined {
    return this.currentContext;
  }

  getCurrentNamespace(): string {
    return this.currentNamespace;
  }

  // Context management
  async listContexts(): Promise<string[]> {
    this.ensureInitialized();
    const contexts = this.kubeConfig.getContexts();
    return contexts.map(context => context.name);
  }

  async switchContext(contextName: string): Promise<void> {
    this.ensureInitialized();
    
    const contexts = this.kubeConfig.getContexts();
    const targetContext = contexts.find(ctx => ctx.name === contextName);
    
    if (!targetContext) {
      throw new Error(`Context '${contextName}' not found`);
    }

    this.kubeConfig.setCurrentContext(contextName);
    this.currentContext = contextName;
    
    // Reinitialize API clients with new context
    this.initializeApiClients();
    
    // Test new connection
    await this.testConnection();
    
    logOperation('switch_context', contextName);
    logger.info('Switched Kubernetes context', { context: contextName });
  }

  // Namespace management
  async listNamespaces(): Promise<k8s.V1Namespace[]> {
    this.ensureInitialized();
    const response = await this.coreV1Api.listNamespace();
    return response.body.items;
  }

  async setCurrentNamespace(namespace: string): Promise<void> {
    this.ensureInitialized();
    
    // Verify namespace exists
    try {
      await this.coreV1Api.readNamespace(namespace);
      this.currentNamespace = namespace;
      logger.info('Set current namespace', { namespace });
    } catch (error) {
      throw new Error(`Namespace '${namespace}' not found`);
    }
  }

  // Cluster information
  async getClusterInfo(): Promise<ClusterInfo> {
    this.ensureInitialized();

    try {
      const [_unusedVersionResponse, namespacesResponse, nodesResponse] = await Promise.all([
        // @ts-ignore
        this.coreV1Api.readServiceAccount('default', 'default').catch(() => null),
        this.coreV1Api.listNamespace(),
        this.coreV1Api.listNode(),
      ]);

      const cluster = this.kubeConfig.getCurrentCluster();
      
      return {
        name: this.currentContext || 'unknown',
        server: cluster?.server || 'unknown',
        nodes: nodesResponse.body.items.length,
        namespaces: namespacesResponse.body.items.map((ns: any) => ns.metadata?.name || ''),
      };
    } catch (error) {
      throw new Error(`Failed to get cluster info: ${(error as Error).message}`);
    }
  }

  // Health check
  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.connectionEstablished) {
        return {
          healthy: false,
          message: 'Kubernetes connection not established',
        };
      }

      // Test basic connectivity
      const response = await this.coreV1Api.listNamespace();
      
      return {
        healthy: true,
        message: 'Kubernetes connection healthy',
        details: {
          context: this.currentContext,
          namespace: this.currentNamespace,
          namespacesCount: response.body.items.length,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Kubernetes health check failed: ${(error as Error).message}`,
      };
    }
  }

  // Utility methods
  private ensureInitialized(): void {
    if (!this.connectionEstablished) {
      throw new Error('Kubernetes manager not initialized');
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up Kubernetes manager...');
    this.connectionEstablished = false;
  }

  // Error handling helper
  handleKubernetesError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    
    if (typeof error === 'object' && error !== null && 'body' in error) {
      const k8sError = error as { body: { message?: string; reason?: string } };
      return new Error(k8sError.body.message || k8sError.body.reason || 'Unknown Kubernetes error');
    }
    
    return new Error('Unknown error occurred');
  }
}
