import winston from 'winston';
import { config } from '../config/index.js';

// Create Winston logger instance
const createWinstonLogger = () => {
  const transports: winston.transport[] = [];

  // Console transport
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        config.logging.format === 'json'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
      ),
    })
  );

  // File transport (if enabled)
  if (config.logging.enableFileLogging && config.logging.logFilePath) {
    transports.push(
      new winston.transports.File({
        filename: config.logging.logFilePath,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        maxsize: parseInt(config.logging.maxFileSize.replace(/[^0-9]/g, '')) * 1024 * 1024,
        maxFiles: config.logging.maxFiles,
        tailable: true,
      })
    );
  }

  return winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
    transports,
    defaultMeta: {
      service: 'mcp-kubernetes-server',
      version: config.server.version,
    },
    exceptionHandlers: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      }),
    ],
    exitOnError: false,
  });
};

export const logger = createWinstonLogger();

// Utility functions for structured logging
export const createChildLogger = (meta: Record<string, unknown> = {}) => {
  return logger.child(meta);
};

export const logError = (message: string, error: Error, meta: Record<string, unknown> = {}) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  });
};

export const logOperation = (
  operation: string,
  resource: string,
  meta: Record<string, unknown> = {}
) => {
  logger.info('Kubernetes operation', {
    operation,
    resource,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

export const logAudit = (
  action: string,
  resource: string,
  user?: string,
  meta: Record<string, unknown> = {}
) => {
  logger.info('Audit log', {
    action,
    resource,
    user,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};
