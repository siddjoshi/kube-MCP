# MCP Server for Kubernetes

A comprehensive Model Context Protocol (MCP) server that provides seamless integration between AI assistants and Kubernetes clusters.

## Quick Start

### Prerequisites

- Node.js 18+
- Kubernetes cluster access
- kubectl configured
- (Optional) Helm 3.x for chart operations

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp-server-kubernetes

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

### Configuration

The server supports multiple configuration methods:

#### Environment Variables

```bash
# Kubernetes authentication
export KUBECONFIG_PATH="/path/to/kubeconfig"
export K8S_CONTEXT="my-cluster"
export K8S_NAMESPACE="default"

# Security settings
export ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS="false"
export ENABLE_RBAC_VALIDATION="true"

# Server settings
export MCP_TRANSPORT="stdio"  # or "sse"
export LOG_LEVEL="info"
export METRICS_PORT="3001"
```

#### Using with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "kubernetes": {
      "command": "node",
      "args": ["/path/to/mcp-server-kubernetes/dist/index.js"],
      "env": {
        "KUBECONFIG_PATH": "/path/to/your/kubeconfig",
        "K8S_CONTEXT": "your-cluster-context"
      }
    }
  }
}
```

## Features

### Core Kubernetes Operations
- **Resource Management**: Complete CRUD operations for all Kubernetes resources
- **Multi-cluster Support**: Manage multiple clusters with context switching
- **Helm Integration**: Chart installation, upgrades, and management
- **Real-time Monitoring**: Live resource status and metrics
- **Security**: RBAC integration and audit logging

### Advanced Features
- **Intelligent Diagnostics**: AI-powered troubleshooting workflows
- **Performance Analysis**: Resource utilization and capacity planning
- **Security Scanning**: Vulnerability assessment and compliance checking
- **Batch Operations**: Efficient bulk resource operations
- **Safe Mode**: Read-only and non-destructive operation modes

### MCP Integration
- **Tools**: 50+ Kubernetes operations exposed as MCP tools
- **Resources**: Dynamic resource discovery and hierarchical organization
- **Prompts**: Guided troubleshooting and best practice workflows
- **Streaming**: Real-time log streaming and event monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                           │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐               │
│  │   MCP Handler   │ │  Auth Manager   │               │
│  └─────────────────┘ └─────────────────┘               │
│  ┌─────────────────┐ ┌─────────────────┐               │
│  │ Kubernetes API  │ │  Cache Layer    │               │
│  │    Manager      │ │                 │               │
│  └─────────────────┘ └─────────────────┘               │
│  ┌─────────────────┐ ┌─────────────────┐               │
│  │ Security Layer  │ │ Metrics & Logs  │               │
│  └─────────────────┘ └─────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
# Start development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Security

This server implements enterprise-grade security features:

- **Authentication**: Multiple authentication methods (kubeconfig, service accounts, OIDC)
- **Authorization**: RBAC integration with permission validation
- **Encryption**: TLS for all communications
- **Audit**: Comprehensive operation logging
- **Compliance**: SOC2, GDPR, ISO 27001 considerations

## License

MIT License - see LICENSE file for details.

## Contributing

See CONTRIBUTING.md for development guidelines and contribution process.
