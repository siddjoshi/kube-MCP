import { Config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface MetricsSnapshot {
  timestamp: Date;
  metrics: Metric[];
}

export class MetricsManager {
  private metrics: Map<string, Metric> = new Map();
  private enabled: boolean;
  private intervalId?: NodeJS.Timeout | null = null;

  constructor(private config: Config) {
    this.enabled = config.monitoring.prometheusMetrics;
    if (this.enabled) {
      this.startMetricsCollection();
    }
  }

  private startMetricsCollection(): void {
    // Start collecting basic metrics
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.monitoring.healthCheckInterval * 1000);

    logger.info('Metrics collection started', {
      interval: this.config.monitoring.healthCheckInterval,
    });
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.enabled) return;

    this.metrics.set(`${name}_${Date.now()}`, {
      name,
      value,
      timestamp: new Date(),
      labels: labels || {},
    });
    
    // Keep only recent metrics (last hour)
    this.cleanupOldMetrics();
  }

  recordOperation(operation: string, duration: number): void {
    this.recordMetric('mcp_operation_duration_ms', duration, { operation });
    this.recordMetric('mcp_operation_total', 1, { operation });
  }

  recordError(operation: string): void {
    this.recordMetric('mcp_operation_errors_total', 1, { operation });
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      logger.info('Metrics collection disabled');
      return;
    }

    this.startMetricsCollection();
    logger.info('Metrics manager started');
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.metrics.clear();
    logger.info('Metrics manager stopped');
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.metrics.get(key);
    
    if (existing) {
      existing.value += 1;
      existing.timestamp = new Date();
    } else {
      this.recordMetric(name, 1, labels);
    }
  }

  recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    this.metrics.set(key, {
      name,
      value,
      timestamp: new Date(),
      labels: labels || {},
    });
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    // Simplified histogram implementation
    this.recordMetric(`${name}_bucket`, value, labels);
    this.incrementCounter(`${name}_count`, labels);
    this.recordGauge(`${name}_sum`, value, labels);
  }

  getMetrics(): MetricsSnapshot {
    return {
      timestamp: new Date(),
      metrics: Array.from(this.metrics.values()),
    };
  }

  getMetric(name: string, labels?: Record<string, string>): Metric | undefined {
    const key = this.getMetricKey(name, labels);
    return this.metrics.get(key);
  }

  clearMetrics(): void {
    this.metrics.clear();
  }

  private collectSystemMetrics(): void {
    try {
      // Record system uptime
      this.recordGauge('mcp_server_uptime_seconds', process.uptime());
      
      // Record memory usage
      const memUsage = process.memoryUsage();
      this.recordGauge('mcp_server_memory_usage_bytes', memUsage.rss, { type: 'rss' });
      this.recordGauge('mcp_server_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
      this.recordGauge('mcp_server_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
      this.recordGauge('mcp_server_memory_usage_bytes', memUsage.external, { type: 'external' });

      // Record CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      this.recordGauge('mcp_server_cpu_usage_microseconds', cpuUsage.user, { type: 'user' });
      this.recordGauge('mcp_server_cpu_usage_microseconds', cpuUsage.system, { type: 'system' });

      // Record active handles and requests
      this.recordGauge('mcp_server_active_handles', (process as any)._getActiveHandles().length);
      this.recordGauge('mcp_server_active_requests', (process as any)._getActiveRequests().length);

    } catch (error) {
      logger.error('Error collecting system metrics', { error: (error as Error).message });
    }
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return `${name}{${labelString}}`;
  }

  private cleanupOldMetrics(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.timestamp < oneHourAgo) {
        this.metrics.delete(key);
      }
    }
  }

  // MCP-specific metrics
  recordToolExecution(toolName: string, success: boolean, duration: number): void {
    this.incrementCounter('mcp_tool_executions_total', {
      tool: toolName,
      status: success ? 'success' : 'error',
    });
    
    this.recordHistogram('mcp_tool_duration_seconds', duration / 1000, {
      tool: toolName,
    });
  }

  recordResourceAccess(resourceUri: string, success: boolean): void {
    this.incrementCounter('mcp_resource_accesses_total', {
      resource: resourceUri,
      status: success ? 'success' : 'error',
    });
  }

  recordPromptGeneration(promptName: string, success: boolean, duration: number): void {
    this.incrementCounter('mcp_prompt_generations_total', {
      prompt: promptName,
      status: success ? 'success' : 'error',
    });
    
    this.recordHistogram('mcp_prompt_duration_seconds', duration / 1000, {
      prompt: promptName,
    });
  }

  recordKubernetesApiCall(apiGroup: string, resource: string, verb: string, success: boolean): void {
    this.incrementCounter('mcp_kubernetes_api_calls_total', {
      api_group: apiGroup,
      resource,
      verb,
      status: success ? 'success' : 'error',
    });
  }

  recordClientConnection(transport: string): void {
    this.incrementCounter('mcp_client_connections_total', {
      transport,
    });
    
    this.recordGauge('mcp_active_connections', this.getActiveConnectionsCount());
  }

  recordClientDisconnection(transport: string): void {
    this.incrementCounter('mcp_client_disconnections_total', {
      transport,
    });
    
    this.recordGauge('mcp_active_connections', this.getActiveConnectionsCount());
  }

  private getActiveConnectionsCount(): number {
    // This would need to be tracked by the server
    // For now, return a placeholder
    return 1;
  }

  // Export metrics in Prometheus format
  exportPrometheusMetrics(): string {
    const lines: string[] = [];
    const metricGroups = new Map<string, Metric[]>();

    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }

    // Format each metric group
    for (const [name, metrics] of metricGroups.entries()) {
      lines.push(`# TYPE ${name} gauge`);
      
      for (const metric of metrics) {
        let line = name;
        
        if (metric.labels && Object.keys(metric.labels).length > 0) {
          const labelString = Object.entries(metric.labels)
            .map(([key, value]) => `${key}="${value}"`)
            .join(',');
          line += `{${labelString}}`;
        }
        
        line += ` ${metric.value} ${metric.timestamp.getTime()}`;
        lines.push(line);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  }

  // Health check for metrics system
  isHealthy(): boolean {
    return this.enabled;
  }

  getStats(): Record<string, any> {
    return {
      enabled: this.enabled,
      totalMetrics: this.metrics.size,
      oldestMetric: this.getOldestMetricTimestamp(),
      newestMetric: this.getNewestMetricTimestamp(),
    };
  }

  getHealthMetrics(): Record<string, any> {
    const memoryUsage = process.memoryUsage();
    return {
      uptime: process.uptime(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
      },
      metricsCount: this.metrics.size,
      enabled: this.enabled,
    };
  }

  private getOldestMetricTimestamp(): Date | null {
    let oldest: Date | null = null;
    
    for (const metric of this.metrics.values()) {
      if (!oldest || metric.timestamp < oldest) {
        oldest = metric.timestamp;
      }
    }
    
    return oldest;
  }

  private getNewestMetricTimestamp(): Date | null {
    let newest: Date | null = null;
    
    for (const metric of this.metrics.values()) {
      if (!newest || metric.timestamp > newest) {
        newest = metric.timestamp;
      }
    }
    
    return newest;
  }
}
