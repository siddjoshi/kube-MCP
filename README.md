# MCP Kubernetes Server

A Model Context Protocol (MCP) server for Kubernetes, supporting chunked HTTP streaming, advanced troubleshooting prompts, and full Kubernetes resource/tool coverage.

---

## Prerequisites
- Node.js v18+ (for local dev/build)
- Docker (for containerization)
- Access to a Kubernetes cluster (AKS, EKS, GKE, or local)
- `kubectl` configured (for testing and kubeconfig management)

---

## 1. Build and Run Locally

```sh
npm install
npm run build
MCP_TRANSPORT=http-chunked npm start
```

- By default, the server uses your local kubeconfig (`~/.kube/config` or `C:\Users\<username>\.kube\config`).
- To use a custom kubeconfig, set the `KUBECONFIG` environment variable:
  ```sh
  export KUBECONFIG=/path/to/your/kubeconfig
  npm start
  ```

---

## 2. Dockerize the MCP Server

### Build the Docker image
```sh
docker build -t yourrepo/mcp-server:latest .
```

### Push to your registry
```sh
docker push yourrepo/mcp-server:latest
```

---

## 3. Deploy on Kubernetes (AKS, EKS, GKE)

### Edit the image name in `k8s-mcp-server.yaml`:
Replace `yourrepo/mcp-server:latest` with your image name.

### Apply the manifest
```sh
kubectl apply -f k8s-mcp-server.yaml
```

- This creates a namespace, ServiceAccount, RBAC, Deployment, and Service.
- By default, the Service is `ClusterIP` (internal). Change to `LoadBalancer` or `NodePort` for external access.

---

## 4. Using the MCP Server

### HTTP Chunked Endpoint
- The server exposes `/call-tool-chunked` on port 3000.
- Example (using `curl`):
  ```sh
  curl -X POST http://<server-ip>:3000/call-tool-chunked \
    -H "Content-Type: application/json" \
    -d '{"name": "get_pods", "args": {"namespace": "default"}}'
  ```
- The response will stream progress and results as JSON lines.

### Using Prompts
- To use a prompt, POST to `/call-tool-chunked` with the prompt name, e.g.:
  ```sh
  curl -X POST http://<server-ip>:3000/call-tool-chunked \
    -H "Content-Type: application/json" \
    -d '{"name": "k8s-pod-crashloop-diagnose", "args": {"podName": "my-pod", "namespace": "default"}}'
  ```

---

## 5. Kubeconfig and Permissions
- The MCP server uses the kubeconfig available in the container (default: `/root/.kube/config`).
- For in-cluster deployments, it uses the ServiceAccount and RBAC provided in the manifest.
- To use a custom kubeconfig, mount it as a secret and update the Deployment (see commented lines in the manifest).

---

## 6. Security Notes
- **Do not expose the MCP server to the public internet without authentication and TLS.**
- Use network policies, firewalls, or VPNs to restrict access.
- Use least-privilege RBAC for the ServiceAccount.

---

## 7. Extending and Customizing
- Add new tools, resources, or prompts in the `src/` directory.
- Rebuild and redeploy the Docker image after making changes.

---

## 8. Troubleshooting
- Check logs with `kubectl logs -n mcp-server deploy/mcp-server`.
- Ensure the ServiceAccount has the required permissions for your use case.
- For local testing, ensure your kubeconfig is valid and has cluster access.

---

## License
MIT
