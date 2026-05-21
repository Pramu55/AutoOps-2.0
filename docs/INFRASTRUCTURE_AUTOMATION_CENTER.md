# Infrastructure Automation Center

## Purpose

The Infrastructure Automation Center adds local-first, controlled infrastructure automation to AutoOps. It lets operators discover allowlisted Terraform/OpenTofu workspaces and Ansible playbooks, request safe read/change workflows, and keep the same confirmation, approval, worker execution, incident, and governance evidence model used by Jenkins, Docker, and Kubernetes.

## Supported Tools

- Terraform or OpenTofu for validate, plan, and approval-gated apply.
- Ansible for syntax-check, check mode, and approval-gated run.

The local Docker API and worker images install pinned OpenTofu plus package-managed Ansible for live local execution. The connector still reports `NOT_INSTALLED` honestly if a custom runtime omits the required binaries.

## Terraform/OpenTofu Workflow

1. AutoOps discovers directories under `INFRA_TERRAFORM_ROOT` that contain `main.tf`.
2. The user selects an allowlisted workspace slug.
3. `VALIDATE` and `PLAN` create worker-backed operations without approval.
4. `APPLY` requires exact confirmation and a separate approver before execution.
5. The worker copies the workspace to a temporary directory, runs fixed Terraform/OpenTofu arguments, summarizes output, and removes the temporary directory.

## Ansible Workflow

1. AutoOps discovers playbooks under `INFRA_ANSIBLE_ROOT/playbooks`.
2. The playbook must use the allowlisted local inventory at `INFRA_ANSIBLE_ROOT/inventory/local.ini`.
3. `SYNTAX` and `CHECK` create worker-backed operations without approval.
4. `RUN` requires exact confirmation and a separate approver before execution.
5. The worker runs `ansible-playbook` with fixed arguments only.

## Safety Model

- No arbitrary shell command input.
- No terminal UI.
- No arbitrary path execution.
- Slugs must map to allowlisted files.
- Output is size-limited, ANSI-stripped, and secret-like lines are redacted.
- Terraform state, provider caches, Ansible vault files, SSH keys, and cloud credentials must never be committed.

## Approval Model

| Action | Approval |
| --- | --- |
| Terraform/OpenTofu validate | Not required |
| Terraform/OpenTofu plan | Not required |
| Terraform/OpenTofu apply | Required |
| Ansible syntax-check | Not required |
| Ansible check mode | Not required |
| Ansible run | Required |

Requester self-approval remains blocked by the existing AutoOps approval workflow.

## Worker Execution Model

The API creates operation records and applies policy. The worker owns execution. Terraform/OpenTofu and Ansible commands are executed with `execFile` and fixed argument lists, not shell command strings.

## Allowlisted Directory Model

Default local roots:

```text
infra/terraform
infra/ansible
```

Container defaults:

```text
INFRA_TERRAFORM_ROOT=/app/infra/terraform
INFRA_ANSIBLE_ROOT=/app/infra/ansible
```

Only discovered workspace/playbook slugs are accepted by the API.

## Sample Local Terraform Workspace

`infra/terraform/local-smoke` is credential-free and uses the built-in `terraform_data` resource. It is meant for local validate/plan demos and safe approval-gated apply testing.

## Sample Local Ansible Playbook

`infra/ansible/playbooks/local-smoke.yml` targets localhost only and uses safe `assert`, `stat`, and `debug` tasks. It does not use sudo, SSH, package installation, or service mutation.

## Governance Evidence

Infrastructure operations appear in Operations Hub, Operation Detail, and Governance Center with:

- provider `INFRASTRUCTURE`
- operation type
- workspace or playbook target
- risk level
- confirmation and approval requirement
- lifecycle status
- safe output summary
- incident link when failed

## Incident Behavior

Failed Terraform/OpenTofu and Ansible operations create safe incidents through the existing incident flow. Runbooks focus on tool installation, allowlisted paths, syntax, state locks, inventory, permissions, and credentials without exposing secrets.

## Setup Requirements

The included local Docker images install OpenTofu and Ansible in the API and worker runtimes. Verify with:

```powershell
docker exec autoops-worker sh -lc "tofu version || terraform version"
docker exec autoops-worker sh -lc "ansible-playbook --version"
docker exec autoops-api sh -lc "tofu version || terraform version"
docker exec autoops-api sh -lc "ansible-playbook --version"
```

The repo `infra` mount remains read-only. Terraform/OpenTofu execution copies the allowlisted workspace to a runtime temp directory before `init`, `validate`, `plan`, or approval-gated `apply`, so provider caches and state are not written back to the repository.

## Limitations

- No cloud credentials are included.
- No arbitrary variables or command arguments are accepted.
- No Terraform Cloud, Ansible Tower, or AWS integration is included in this milestone.
- Production teams should mount only approved workspaces and manage credentials through a secret manager.

## Future Cloud Extensions

Future work can add AWS/cloud workspaces, remote state, drift detection, signed plan evidence, richer approval policies, and cloud credential broker integrations. Those are intentionally outside Day 19.
