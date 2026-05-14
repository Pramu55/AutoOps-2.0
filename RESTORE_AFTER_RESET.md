# Restore AutoOps after Windows reset

Current milestone to continue: `JENKINS_LOCAL_RUNTIME_GREEN`.

## Install after reset

- Git
- Node.js LTS
- Docker Desktop
- Docker Desktop Kubernetes
- kubectl
- VS Code
- Optional: GitHub CLI
- Optional: Jenkins local Docker container
- Optional: LM Studio

PostgreSQL and Redis do not need separate local installs when using Docker Compose.

## Clone

```powershell
git clone https://github.com/Pramu55/AutoOps-2.0.git
cd "AutoOps-2.0"
```

If you choose a different local folder name:

```powershell
cd "C:\AutoOps 2.0"
```

## Install dependencies

```powershell
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
```

## Start the default stack

```powershell
docker compose up -d --build
```

## Restore Kubernetes local visibility

Enable Kubernetes in Docker Desktop first.

```powershell
$KUBE_SERVER = kubectl config view --minify -o jsonpath="{.clusters[0].cluster.server}"
$PORT = ($KUBE_SERVER -replace "https://127.0.0.1:", "" -replace "https://localhost:", "")

$env:KUBECONFIG_HOST_PATH="$env:USERPROFILE\.kube\config"
$env:KUBERNETES_API_SERVER_OVERRIDE="https://host.docker.internal:$PORT"
$env:KUBERNETES_TLS_SERVER_NAME_OVERRIDE="127.0.0.1"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build api web worker
```

Kubeconfig is intentionally not committed.

## Restore Jenkins local runtime

```powershell
docker run -d --name autoops-jenkins `
  -p 8080:8080 -p 50000:50000 `
  jenkins/jenkins:lts

docker exec autoops-jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Complete Jenkins setup in the browser, create a user/API token, and create one safe job:

`autoops-smoke-build`

Example safe job commands:

```sh
echo "AutoOps Jenkins smoke build"
echo "Triggered by AutoOps"
```

Set Jenkins env vars in PowerShell before recreating AutoOps services:

```powershell
$env:JENKINS_URL="http://host.docker.internal:8080"
$env:JENKINS_USERNAME="<username>"
$env:JENKINS_API_TOKEN="<token>"
$env:JENKINS_ALLOWED_JOBS="autoops-smoke-build"

docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build api worker web
```

The Jenkins API token is intentionally not committed and must be recreated after reset.

## Verification URLs

- http://localhost:3000
- http://localhost:3000/dashboard
- http://localhost:3000/dashboard/operations
- http://localhost:3000/dashboard/integrations/kubernetes
- http://localhost:3000/dashboard/integrations/jenkins
- http://localhost:4000/health
- http://localhost:4000/ready
- http://localhost:4001/healthz
- http://localhost:4001/readyz

## Important notes

- `.env` files are intentionally not committed. Recreate them from `.env.example`.
- Kubeconfig is intentionally not committed.
- Jenkins API tokens are intentionally not committed.
- Docker volumes, PostgreSQL data, Redis data, `node_modules`, `.next`, `dist`, and build caches are intentionally not committed.
