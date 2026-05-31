# Argo CD GitOps Connector

AutoOps includes a read-only Argo CD connector foundation for GitOps visibility. It reports application sync status, health status, repository and destination metadata, and drift indicators without mutating Argo CD or Kubernetes resources.

## Configuration

Set the API service environment:

```text
ARGOCD_URL=https://argocd.example.com
ARGOCD_AUTH_TOKEN=
ARGOCD_USERNAME=
ARGOCD_PASSWORD=
ARGOCD_SKIP_TLS_VERIFY=false
ARGOCD_REQUEST_TIMEOUT_MS=5000
```

Authentication supports either:

- `ARGOCD_AUTH_TOKEN`
- `ARGOCD_USERNAME` plus `ARGOCD_PASSWORD`

If no usable Argo CD environment is configured, the connector returns `NOT_CONFIGURED`. If Argo CD is unreachable it returns `UNREACHABLE`. If credentials are rejected it returns `AUTH_FAILED`. A successful read-only application request returns `CONNECTED`.

## API

All routes require authentication. Inventory routes also require provider inventory access.

```text
GET /api/v1/integrations/argocd/status
GET /api/v1/integrations/argocd/applications
GET /api/v1/integrations/argocd/summary
```

The status response is secret-free. It may include the configured server URL, auth mode, TLS setting, status, checked time, and setup message. It never includes the auth token, username password, or session token.

## Read-Only Boundary

This milestone intentionally does not implement:

- sync trigger
- rollback
- app delete
- app create or update
- Kubernetes mutation
- Argo CD mutation
- autonomous remediation
- fake GitOps data

Application data comes only from the configured Argo CD API. If Argo CD is not configured or reachable, the API returns empty inventory with the relevant connection status.

## UI

The dashboard page is available at:

```text
/dashboard/integrations/argocd
```

It shows connection state, server URL, application count, sync counts, health counts, application repository and destination metadata, sync and health state, and last observed time.

## Secret Handling

AutoOps must never expose:

- `ARGOCD_AUTH_TOKEN`
- `ARGOCD_PASSWORD`
- Argo CD session tokens

Do not commit `.env` files. Prefer short-lived or read-only Argo CD credentials with the minimum permissions needed to list applications.
