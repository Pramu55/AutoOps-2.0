# AutoOps Docker Compose Install Guide

This guide explains the Docker Compose runtime used by AutoOps for local installation, evaluation, and demo usage.

AutoOps runs locally through Docker Compose so evaluators can start the full platform without manually installing PostgreSQL, Redis, Grafana, Prometheus, API services, or workers.

## Required command

From the project root:

```powershell
copy .env.example .env
docker compose -f docker-compose.yml -f docker-compose.k8s.yml up -d --build