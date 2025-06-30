import { z } from 'zod';

// Environment configuration schema
export const ConfigSchema = z.object({
  // Server configuration
  server: z.object({
    name: z.string().default('mcp-kubernetes-server'),
    version: z.string().default('1.0.0'),
    transport: z.enum(['stdio', 'sse']).default('stdio'),
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('localhost'),
    enableMetrics: z.boolean().default(true),
    metricsPort: z.number().min(1).max(65535).default(3001),
  }),

  // Kubernetes configuration
  kubernetes: z.object({
    kubeconfigPath: z.string().optional(),
    kubeconfigYaml: z.string().optional(),
    kubeconfigJson: z.string().optional(),
    context: z.string().optional(),
    namespace: z.string().default('default'),
    server: z.string().optional(),
    token: z.string().optional(),
    skipTlsVerify: z.boolean().default(false),
    requestTimeout: z.number().min(1000).default(30000),
    retryAttempts: z.number().min(0).default(3),
    retryDelay: z.number().min(100).default(1000),
  }),

  // Security configuration
  security: z.object({
    allowOnlyNonDestructiveTools: z.boolean().default(false),
    enableRbacValidation: z.boolean().default(true),
    enableAuditLogging: z.boolean().default(true),
    maxConcurrentRequests: z.number().min(1).default(100),
    rateLimitWindowMs: z.number().min(1000).default(60000),
    rateLimitMaxRequests: z.number().min(1).default(1000),
  }),

  // Cache configuration
  cache: z.object({
    enableResourceCache: z.boolean().default(true),
    resourceCacheTtlMs: z.number().min(1000).default(30000),
    enablePermissionCache: z.boolean().default(true),
    permissionCacheTtlMs: z.number().min(1000).default(300000),
    maxCacheSize: z.number().min(100).default(10000),
  }),

  // Logging configuration
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
    enableFileLogging: z.boolean().default(false),
    logFilePath: z.string().optional(),
    maxFileSize: z.string().default('10m'),
    maxFiles: z.number().min(1).default(5),
  }),

  // Monitoring configuration
  monitoring: z.object({
    enableOpenTelemetry: z.boolean().default(false),
    jaegerEndpoint: z.string().optional(),
    prometheusMetrics: z.boolean().default(true),
    healthCheckInterval: z.number().min(1000).default(30000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// Load configuration from environment variables
export function loadConfig(): Config {
  const rawConfig = {
    server: {
      name: process.env['SERVER_NAME'],
      version: process.env['npm_package_version'],
      transport: process.env['MCP_TRANSPORT'],
      port: process.env['PORT'] ? parseInt(process.env['PORT'], 10) : undefined,
      host: process.env['HOST'],
      enableMetrics: process.env['ENABLE_METRICS'] === 'true',
      metricsPort: process.env['METRICS_PORT'] ? parseInt(process.env['METRICS_PORT'], 10) : undefined,
    },

    kubernetes: {
      kubeconfigPath: process.env['KUBECONFIG_PATH'] || process.env['KUBECONFIG'],
      kubeconfigYaml: process.env['KUBECONFIG_YAML'],
      kubeconfigJson: process.env['KUBECONFIG_JSON'],
      context: process.env['K8S_CONTEXT'],
      namespace: process.env['K8S_NAMESPACE'],
      server: process.env['K8S_SERVER'],
      token: process.env['K8S_TOKEN'],
      skipTlsVerify: process.env['K8S_SKIP_TLS_VERIFY'] === 'true',
      requestTimeout: process.env['K8S_REQUEST_TIMEOUT'] ? parseInt(process.env['K8S_REQUEST_TIMEOUT'], 10) : undefined,
      retryAttempts: process.env['K8S_RETRY_ATTEMPTS'] ? parseInt(process.env['K8S_RETRY_ATTEMPTS'], 10) : undefined,
      retryDelay: process.env['K8S_RETRY_DELAY'] ? parseInt(process.env['K8S_RETRY_DELAY'], 10) : undefined,
    },

    security: {
      allowOnlyNonDestructiveTools: process.env['ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS'] === 'true',
      enableRbacValidation: process.env['ENABLE_RBAC_VALIDATION'] !== 'false',
      enableAuditLogging: process.env['ENABLE_AUDIT_LOGGING'] !== 'false',
      maxConcurrentRequests: process.env['MAX_CONCURRENT_REQUESTS'] ? parseInt(process.env['MAX_CONCURRENT_REQUESTS'], 10) : undefined,
      rateLimitWindowMs: process.env['RATE_LIMIT_WINDOW_MS'] ? parseInt(process.env['RATE_LIMIT_WINDOW_MS'], 10) : undefined,
      rateLimitMaxRequests: process.env['RATE_LIMIT_MAX_REQUESTS'] ? parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'], 10) : undefined,
    },

    cache: {
      enableResourceCache: process.env['ENABLE_RESOURCE_CACHE'] !== 'false',
      resourceCacheTtlMs: process.env['RESOURCE_CACHE_TTL_MS'] ? parseInt(process.env['RESOURCE_CACHE_TTL_MS'], 10) : undefined,
      enablePermissionCache: process.env['ENABLE_PERMISSION_CACHE'] !== 'false',
      permissionCacheTtlMs: process.env['PERMISSION_CACHE_TTL_MS'] ? parseInt(process.env['PERMISSION_CACHE_TTL_MS'], 10) : undefined,
      maxCacheSize: process.env['MAX_CACHE_SIZE'] ? parseInt(process.env['MAX_CACHE_SIZE'], 10) : undefined,
    },

    logging: {
      level: process.env['LOG_LEVEL'],
      format: process.env['LOG_FORMAT'],
      enableFileLogging: process.env['ENABLE_FILE_LOGGING'] === 'true',
      logFilePath: process.env['LOG_FILE_PATH'],
      maxFileSize: process.env['LOG_MAX_FILE_SIZE'],
      maxFiles: process.env['LOG_MAX_FILES'] ? parseInt(process.env['LOG_MAX_FILES'], 10) : undefined,
    },

    monitoring: {
      enableOpenTelemetry: process.env['ENABLE_OPENTELEMETRY'] === 'true',
      jaegerEndpoint: process.env['JAEGER_ENDPOINT'],
      prometheusMetrics: process.env['PROMETHEUS_METRICS'] !== 'false',
      healthCheckInterval: process.env['HEALTH_CHECK_INTERVAL'] ? parseInt(process.env['HEALTH_CHECK_INTERVAL'], 10) : undefined,
    },
  };

  // Remove undefined values to let defaults apply
  const cleanConfig = JSON.parse(JSON.stringify(rawConfig, (_key, value) => value === undefined ? undefined : value));
  
  return ConfigSchema.parse(cleanConfig);
}
