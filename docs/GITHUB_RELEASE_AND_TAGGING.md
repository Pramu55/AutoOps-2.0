# GitHub Release And Tagging Guide

Suggested final tag:

```powershell
git tag v1.0.0-company-demo
git push origin v1.0.0-company-demo
```

Suggested release title:

`AutoOps v1.0.0 Company Demo Release`

Suggested release notes:

- Production-style DevOps Control Plane.
- Real Jenkins, Docker, Kubernetes, Terraform/OpenTofu, and Ansible workflows.
- GitHub Actions, Prometheus/Grafana, DevOps tools, and cloud-provider readiness.
- RBAC, requester/approver separation, confirmation tokens, approval policy, governance evidence, incidents, runbooks, and CI release gates.
- Final company handoff, evaluator, screenshot, demo, and route/API verification docs.

Do not tag or create a GitHub release until release checks, secret scan, runtime verification, and CI pass.
