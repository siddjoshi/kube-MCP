#!/usr/bin/env node

import { MCPKubernetesServer } from './server.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';

async function main() {
  try {
    logger.info('Starting MCP Kubernetes Server', {
      version: process.env['npm_package_version'] || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
    });

    const server = new MCPKubernetesServer(config);
    
    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      try {
        await server.stop();
        logger.info('Server stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

    await server.start();
    logger.info('MCP Kubernetes Server started successfully');

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unexpected error in main', { error });
  process.exit(1);
});
