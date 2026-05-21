# Limitations and Roadmap

## Current Limitations

- AutoOps is local-first by default.
- It is not enterprise-certified or SOC2 compliant.
- It is not a managed SaaS.
- It does not replace Jenkins, Docker, Kubernetes, AWS, or an incident management suite.
- Notification integrations are not implemented yet.

## Local-First Limitations

- Demo flows assume local Docker Compose.
- Jenkins, Docker, and Kubernetes availability depends on local setup.
- Kubernetes Metrics API may be unavailable depending on cluster configuration.

## Production Hardening Still Needed

- External identity provider integration.
- HTTPS reverse proxy hardening.
- More granular Kubernetes RBAC profiles.
- Audit export and retention policies.
- Centralized log shipping.
- More automated end-to-end tests.

## Cloud Deployment Future Work

- Cloud-hosted deployment guide.
- Managed Postgres and Redis examples.
- Reverse proxy and TLS examples.
- Kubernetes deployment manifests or Helm chart.

## Multi-Org SaaS Future Work

- Invite flow.
- Organization switching improvements.
- Billing/account ownership is out of scope.
- Advanced tenant administration.

## Advanced Audit Future Work

- Exportable audit reports.
- Retention configuration.
- Evidence bundles for change reviews.
- Signed approval records.

## More Test Coverage Future Work

- Controller tests.
- Worker operation tests with mocked providers.
- Frontend interaction tests.
- API integration tests with disposable Postgres/Redis.
- Playwright smoke suite.

## Real Notification/Alerting Future Work

- Slack notifications.
- Email notifications.
- PagerDuty or Opsgenie integration.
- Webhook subscriptions.

## AI Assistant Future Work

AI assistance is intentionally future scope. If added, it should be read-only by default, never expose secrets, never bypass policy/RBAC, and never auto-remediate without explicit governed approval.

## AWS/GitHub Integration Future Work

AWS and GitHub connectors are future work. They should follow the same pattern: real status, safe read models, explicit allowlists, confirmation tokens, RBAC, policy gates, and worker-backed execution.

## Why These Are Intentionally Future Scope

The current project focuses on a strong governed operations foundation. Adding more connectors before the safety model is understood would make the project less trustworthy, not more impressive.
