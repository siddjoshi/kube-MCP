# Requirements for MCP Kubernetes Server

## Node.js
- Node.js v18 or later (recommended v20+)
- npm v8 or later

## System Dependencies
- Access to a Kubernetes cluster (local or remote)
- `kubectl` CLI installed and configured (optional, for some features)
- Network access to the Kubernetes API server

## NPM Packages (from package.json)

```
# Core dependencies
@kubernetes/client-node
@modelcontextprotocol/sdk
js-yaml

# Logging and utilities
winston

# Development dependencies
typescript
ts-node
rimraf
@types/node
@types/js-yaml
@types/winston
```

## Kubernetes Cluster Requirements
- Kubernetes v1.21 or later (tested on v1.24+)
- Sufficient RBAC permissions for the service account or kubeconfig used
- Network access from the server to the cluster API

## Environment Variables
- `KUBECONFIG` (optional): Path to kubeconfig file
- `KUBECONFIG_YAML` (optional): Raw kubeconfig YAML string
- `NODE_ENV`: Set to `production` or `development`
- `PORT`: Port for the server (default: 3000)

## Optional Tools
- `kubectl` (for CLI passthrough)
- `helm` (for Helm-related features)

## Setup Steps
1. Install Node.js and npm
2. Clone the repository
3. Run `npm install`
4. Configure your kubeconfig or environment variables
5. Run `npm run build` and `npm start`

## Troubleshooting
- Ensure your kubeconfig points to a reachable cluster
- Check network/firewall settings
- Review logs for errors

---

For more details, see the README.md and DEPLOYMENT_GUIDE.md (if available). 