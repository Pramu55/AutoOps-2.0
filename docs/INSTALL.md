# AutoOps Local Installation Guide

This guide explains how to install, run, verify, and stop the AutoOps DevOps Control Plane locally on your development system.

## Prerequisites

Before starting, ensure you have the following installed and configured:

- **Git**: For cloning the repository.
- **Docker Desktop**: The recommended local container runtime.
- **Docker Compose**: Installed automatically with modern Docker Desktop.
- **Windows PowerShell**: Used for running the setup and control commands (requires execution policy setup if running script files).

## 1. Clone the Repository

Clone the public repository to your local system and navigate to the project directory:

```powershell
git clone https://github.com/Pramu55/AutoOps-2.0.git
cd AutoOps-2.0
```

## 2. Configure Environment Variables

Create your local environment file `.env` by copying the provided example file:

```powershell
copy .env.example .env
```

> [!WARNING]
> **Do not commit `.env`!**
> Never commit your `.env` file or expose secrets in public source control. The `.gitignore` is pre-configured to block `.env`, but always check your git changes before committing.

## 3. Start AutoOps

Use Docker Compose to build and start the entire AutoOps stack in the background:

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build
```

This starts all control plane services, including the web dashboard, api server, worker, database, cache, proxy, and monitoring tools.

## 4. Verify System Health

After the containers start, verify the health of the API server and web dashboard:

### Web Dashboard
Open [http://localhost:3000](http://localhost:3000) in your web browser. You should see the login screen. You can log in using the demo credentials provided in the login page helper (e.g., `pramod.local@autoops.dev` / `StrongPass123`).

### Health Checks
To programmatically check the API and monitoring components, run the following commands or visit the URLs:

```powershell
# API Health Endpoint
Invoke-RestMethod -Uri http://localhost:4000/health

# API Readiness Endpoint
Invoke-RestMethod -Uri http://localhost:4000/ready
```

Expected URLs:
- **API Health**: [http://localhost:4000/health](http://localhost:4000/health)
- **API Readiness**: [http://localhost:4000/ready](http://localhost:4000/ready)
- **Grafana**: [http://localhost:3001](http://localhost:3001)
- **Prometheus**: [http://localhost:9090](http://localhost:9090)

## 5. Stop the Application

To stop all running services and clean up network resources without losing database volumes, run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml down
```

To stop services and completely remove volumes (resetting database state), run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.k8s.yml down -v
```

---

## Troubleshooting

### ".env not found" Error
If the containers fail to start or report configuration errors due to missing environment variables:
1. Double-check that you copied the file using `copy .env.example .env` in the root of the project directory.
2. Ensure you run commands from the project root (`AutoOps-2.0`), not from subdirectories.
3. Open the `.env` file in an editor (like Notepad or VS Code) to verify it contains valid environment keys.

### Port Conflicts
AutoOps utilizes several host ports to expose its dashboard and integration backends:
- **Port 3000**: Next.js Web Dashboard
- **Port 4000 & 4001**: API Endpoint & WebSockets
- **Port 3001**: Grafana
- **Port 9090**: Prometheus
- **Port 5432**: PostgreSQL
- **Port 6379**: Redis

If you encounter port conflicts (e.g., `port is already allocated` or `bind: address already in use`):
1. Identify the blocking process by running:
   ```powershell
   Get-NetTCPConnection -LocalPort <PortNumber> | Select-Object OwningProcess
   ```
2. Stop the conflicting service, or edit the ports mapping in [docker-compose.yml](../docker-compose.yml) and your local `.env` file to map the host ports to free local ports.
