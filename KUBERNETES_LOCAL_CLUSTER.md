# AutoOps local Kubernetes setup

This optional setup connects the AutoOps API and worker containers to a local
Kubernetes cluster. Discovery endpoints are read-only. Controlled operations
currently support deployment restart and server-side apply with guardrails.

AutoOps still does not delete resources, scale workloads, exec into pods,
port-forward, shell out to kubectl, or list Secret resources.

## 1. Verify a local cluster on the host

Docker Desktop Kubernetes, kind, and minikube are supported through the current
context in your kubeconfig. AutoOps uses the current context and does not switch
contexts automatically.

```powershell
kubectl config current-context
kubectl get nodes
kubectl get ns
```

## 2. Windows Docker Desktop / local cluster env

Docker Desktop and local Kubernetes kubeconfigs often point at
`https://127.0.0.1:<port>`. From inside the API container, AutoOps must connect
through `host.docker.internal`, while TLS may still need to validate the
certificate against `127.0.0.1`.

```powershell
$KUBE_SERVER = kubectl config view --minify -o jsonpath="{.clusters[0].cluster.server}"
$PORT = ($KUBE_SERVER -replace "https://127.0.0.1:", "" -replace "https://localhost:", "")

$env:KUBECONFIG_HOST_PATH="$env:USERPROFILE\.kube\config"
$env:KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:$PORT"
$env:KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build api worker web
```

Linux/macOS shell:

```bash
export KUBECONFIG_HOST_PATH="$HOME/.kube/config"
export KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:<port>"
export KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"
docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build api worker web
```

## 3. What the override mounts

The override mounts only the kubeconfig file into the API and worker containers at:

```text
/app/.kube/config
```

The API and worker containers use:

```text
KUBECONFIG=/app/.kube/config
KUBERNETES_API_SERVER_OVERRIDE=https://host.docker.internal:<port>
KUBERNETES_TLS_SERVER_NAME_OVERRIDE=127.0.0.1
```

The server and TLS name overrides are applied in memory only. AutoOps does not
write back to the kubeconfig file and does not expose kubeconfig content.

## 4. Verify inside the API container

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml exec api sh -lc 'echo KUBECONFIG=$KUBECONFIG && echo KUBERNETES_API_SERVER_OVERRIDE=$KUBERNETES_API_SERVER_OVERRIDE && echo KUBERNETES_TLS_SERVER_NAME_OVERRIDE=$KUBERNETES_TLS_SERVER_NAME_OVERRIDE'
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml exec api sh -lc 'grep -R "KUBERNETES_API_SERVER_OVERRIDE" -n /app/apps/api/dist 2>/dev/null | head -20'
```

## 5. Verify through AutoOps

After login, open:

```text
http://localhost:3000/dashboard/integrations/kubernetes
```

Expected API checks:

```text
GET /api/v1/integrations/kubernetes/status
GET /api/v1/integrations/kubernetes/summary
GET /api/v1/integrations/kubernetes/namespaces
GET /api/v1/integrations/kubernetes/pods
GET /api/v1/integrations/kubernetes/workloads
GET /api/v1/integrations/kubernetes/services
GET /api/v1/integrations/kubernetes/nodes
GET /api/v1/integrations/kubernetes/deployments/:namespace/:name/rollout-status
```

If the kubeconfig is not mounted, AutoOps returns `NOT_CONFIGURED`. If the file
is mounted but the cluster cannot be reached, AutoOps returns `UNREACHABLE`.
If credentials or RBAC reject the request, AutoOps returns `AUTH_FAILED`.

## 6. Controlled operations

Deployment restart:

```text
POST /api/v1/integrations/kubernetes/deployments/:namespace/:name/restart
```

Body:

```json
{
  "confirmationToken": "RESTART",
  "environmentId": "optional-environment-id",
  "idempotencyKey": "optional-safe-key"
}
```

Manifest dry-run/apply:

```text
POST /api/v1/integrations/kubernetes/apply
```

Dry-run is the default and uses Kubernetes server-side dry-run:

```json
{
  "manifest": "apiVersion: apps/v1\nkind: Deployment\n...",
  "dryRun": true
}
```

Real apply requires:

- authenticated user
- organization OWNER or ADMIN role
- `confirmationToken: "APPLY"`
- audit log creation
- queued worker execution
- approval first when a production environment is attached

Secret, Namespace, ClusterRole, and ClusterRoleBinding manifests are rejected in
this foundation milestone.

## Troubleshooting

- `NOT_CONFIGURED`: kubeconfig is missing inside the container or env vars are not set.
- `UNREACHABLE`: kubeconfig exists, but Docker cannot reach the API server.
- `AUTH_FAILED`: kubeconfig credentials or RBAC do not allow the requested read.
- TLS hostname mismatch: set `KUBERNETES_TLS_SERVER_NAME_OVERRIDE=127.0.0.1`.
- Connected but no pods: the cluster may be empty, or RBAC may limit namespace visibility.
