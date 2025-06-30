import { Config } from '../config/config.js';
import { logger, logError } from '../utils/logger.js';

export interface SecurityContext {
  userId?: string;
  groups?: string[];
  permissions?: string[];
  source?: string;
}

export interface SecurityPolicy {
  name: string;
  rules: SecurityRule[];
}

export interface SecurityRule {
  action: 'allow' | 'deny';
  resource: string;
  operations?: string[];
  conditions?: Record<string, any>;
}

export class SecurityManager {
  private policies: Map<string, SecurityPolicy> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();

  constructor(private config: Config) {
    this.initializeDefaultPolicies();
  }

  private initializeDefaultPolicies(): void {
    // Default security policies
    const defaultPolicy: SecurityPolicy = {
      name: 'default',
      rules: [
        {
          action: 'allow',
          resource: 'tools/*',
          operations: ['execute'],
        },
        {
          action: 'allow',
          resource: 'resources/*',
          operations: ['read'],
        },
        {
          action: 'allow',
          resource: 'prompts/*',
          operations: ['generate'],
        },
      ],
    };

    // Strict policy for production
    const strictPolicy: SecurityPolicy = {
      name: 'strict',
      rules: [
        {
          action: 'deny',
          resource: 'tools/kubectl',
          operations: ['execute'],
          conditions: {
            command: ['delete', 'apply', 'create'],
          },
        },
        {
          action: 'deny',
          resource: 'resources/k8s-secret',
          operations: ['read'],
        },
        {
          action: 'allow',
          resource: 'tools/get_*',
          operations: ['execute'],
        },
        {
          action: 'allow',
          resource: 'resources/k8s-pod',
          operations: ['read'],
        },
      ],
    };

    this.policies.set('default', defaultPolicy);
    this.policies.set('strict', strictPolicy);

    logger.info('Security policies initialized', {
      policies: Array.from(this.policies.keys()),
    });
  }

  async validateAccess(
    _context: SecurityContext,
    resource: string,
    operation: string,
    params?: Record<string, any>
  ): Promise<boolean> {
    try {
      // Check rate limits first
      if (!this.checkRateLimit(_context.userId || 'anonymous')) {
        logger.warn('Rate limit exceeded', {
          userId: _context.userId,
          resource,
          operation,
        });
        return false;
      }

      // Apply security policies
      const policy = this.getApplicablePolicy(_context);
      const allowed = this.evaluatePolicy(policy, resource, operation, params);

      if (!allowed) {
        logger.warn('Access denied by policy', {
          userId: _context.userId,
          resource,
          operation,
          policy: policy.name,
        });
      }

      return allowed;
    } catch (error) {
      logError('Security validation failed', error as Error);
      return false; // Fail closed
    }
  }

  private getApplicablePolicy(_context: SecurityContext): SecurityPolicy {
    // For now, use default policy
    // In practice, you'd determine policy based on user/groups
    const policyName = 'default'; // Use fixed default since defaultPolicy doesn't exist in config
    return this.policies.get(policyName) || this.policies.get('default')!;
  }

  private evaluatePolicy(
    policy: SecurityPolicy,
    resource: string,
    operation: string,
    params?: Record<string, any>
  ): boolean {
    // Default to deny
    let allowed = false;

    // Evaluate rules in order
    for (const rule of policy.rules) {
      if (this.matchesRule(rule, resource, operation, params)) {
        allowed = rule.action === 'allow';
        // Last matching rule wins
      }
    }

    return allowed;
  }

  private matchesRule(
    rule: SecurityRule,
    resource: string,
    operation: string,
    params?: Record<string, any>
  ): boolean {
    // Check resource pattern
    if (!this.matchesPattern(rule.resource, resource)) {
      return false;
    }

    // Check operations
    if (rule.operations && !rule.operations.includes(operation)) {
      return false;
    }

    // Check conditions
    if (rule.conditions && params) {
      for (const [key, value] of Object.entries(rule.conditions)) {
        const paramValue = params[key];
        
        if (Array.isArray(value)) {
          if (!value.includes(paramValue)) {
            return false;
          }
        } else if (value !== paramValue) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesPattern(pattern: string, resource: string): boolean {
    // Simple wildcard matching
    if (pattern === '*') return true;
    
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return resource.startsWith(prefix);
    }
    
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return resource.endsWith(suffix);
    }
    
    return pattern === resource;
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowSize = this.config.security.rateLimitWindowMs; // Use existing property
    const maxRequests = this.config.security.rateLimitMaxRequests; // Use existing property

    const state = this.rateLimits.get(userId) || {
      requests: [],
      lastCleanup: now,
    };

    // Clean up old requests
    state.requests = state.requests.filter(timestamp => now - timestamp < windowSize);
    state.lastCleanup = now;

    // Check if under limit
    if (state.requests.length >= maxRequests) {
      return false;
    }

    // Add current request
    state.requests.push(now);
    this.rateLimits.set(userId, state);

    return true;
  }

  // Authentication helpers
  authenticateApiKey(apiKey: string): SecurityContext | null {
    // Simple API key authentication - in production you'd have a configured list
    if (!apiKey || apiKey.length < 10) {
      return null;
    }

    return {
      userId: `api_${apiKey.slice(-6)}`,
      source: 'api_key',
      permissions: ['read', 'execute'],
    };
  }

  authenticateJWT(token: string): SecurityContext | null {
    // JWT authentication would go here
    // For now, just validate format
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // In practice, you'd verify the JWT signature and extract claims
      return {
        userId: 'jwt_user',
        source: 'jwt',
        permissions: ['read', 'execute', 'admin'],
      };
    } catch (error) {
      return null;
    }
  }

  // Security utilities
  sanitizeInput(input: string): string {
    // Basic input sanitization
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  validateKubernetesResourceName(name: string): boolean {
    // Kubernetes resource name validation
    const pattern = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    return pattern.test(name) && name.length <= 253;
  }

  validateNamespace(namespace: string): boolean {
    // Kubernetes namespace validation
    return this.validateKubernetesResourceName(namespace);
  }

  // Audit logging
  logSecurityEvent(
    event: string,
    _context: SecurityContext,
    resource?: string,
    details?: Record<string, any>
  ): void {
    logger.info('Security event', {
      event,
      userId: _context.userId,
      source: _context.source,
      resource,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  // Policy management
  addPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.name, policy);
    logger.info('Security policy added', { name: policy.name });
  }

  removePolicy(name: string): boolean {
    const removed = this.policies.delete(name);
    if (removed) {
      logger.info('Security policy removed', { name });
    }
    return removed;
  }

  listPolicies(): string[] {
    return Array.from(this.policies.keys());
  }

  getPolicy(name: string): SecurityPolicy | undefined {
    return this.policies.get(name);
  }

  // Security headers for HTTP responses
  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
  }

  // Encryption helpers
  maskSensitiveData(data: any): any {
    if (typeof data === 'string') {
      // Mask sensitive patterns
      return data
        .replace(/password["\s]*[:=]["\s]*[^"\s,}]+/gi, 'password="***"')
        .replace(/token["\s]*[:=]["\s]*[^"\s,}]+/gi, 'token="***"')
        .replace(/secret["\s]*[:=]["\s]*[^"\s,}]+/gi, 'secret="***"')
        .replace(/key["\s]*[:=]["\s]*[^"\s,}]+/gi, 'key="***"');
    }

    if (typeof data === 'object' && data !== null) {
      const masked = { ...data };
      
      for (const [key, value] of Object.entries(masked)) {
        if (/password|token|secret|key/i.test(key)) {
          masked[key] = '***';
        } else if (typeof value === 'object') {
          masked[key] = this.maskSensitiveData(value);
        }
      }
      
      return masked;
    }

    return data;
  }

  // Health check
  isHealthy(): boolean {
    return this.policies.size > 0;
  }

  getStats(): Record<string, any> {
    return {
      policies: this.policies.size,
      activeRateLimits: this.rateLimits.size,
      securityEnabled: true, // Default to enabled since config doesn't have this property
    };
  }

  // Cleanup old rate limit data
  cleanup(): void {
    const now = Date.now();
    const windowSize = this.config.security.rateLimitWindowMs; // Use existing property

    for (const [userId, state] of this.rateLimits.entries()) {
      state.requests = state.requests.filter(timestamp => now - timestamp < windowSize);
      
      if (state.requests.length === 0) {
        this.rateLimits.delete(userId);
      }
    }
  }
}

interface RateLimitState {
  requests: number[];
  lastCleanup: number;
}
