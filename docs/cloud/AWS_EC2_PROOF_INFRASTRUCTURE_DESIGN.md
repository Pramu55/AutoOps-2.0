# AWS EC2 Proof Infrastructure Design

## 1. Purpose

This document records the Gate 3 Slice 4 design for a disposable AutoOps EC2 Docker Compose proof in `ap-south-1`.

The proof is intended to validate a short-lived cloud deployment path for the existing hardened AutoOps Compose runtime before any long-term ECS, RDS, ElastiCache, ALB, ACM, or Route 53 architecture is created. It is an implementation-independent design and approval record. It does not create infrastructure, authorize AWS credential use, or approve deployment.

## 2. Status and Authorization Boundary

Status: accepted for design documentation only.

Approval of this Slice 4 documentation does not authorize:

- AWS identity lookup
- credential use
- Terraform init
- Terraform plan
- Terraform apply
- resource creation
- Terraform destroy
- AWS API access

Any future AWS action requires the approval gates in this document. No AWS resources are approved by this document alone.

## 3. Proof Objectives

- Prove a disposable EC2 Docker Compose deployment model in `ap-south-1`.
- Preserve Gate 2 production container hardening.
- Use `docker-compose.prod.yml` as the hardened runtime base.
- Validate SSM-only administration with no inbound SSH.
- Validate trusted HTTPS through an approved user-owned domain and Let's Encrypt DNS-01 certificate.
- Validate private Postgres, Redis, Prometheus, and Grafana exposure boundaries.
- Validate one-off `prisma migrate deploy`.
- Validate health checks, smoke checks, backup, restore, rollback, observability, and teardown evidence.
- Keep the normal proof window to 4 hours and the hard runtime boundary to 8 hours.
- Keep expected direct infrastructure spend within USD 2 per proof run.

## 4. Explicit Non-Goals

- No production deployment.
- No always-running cloud architecture.
- No Terraform implementation in Slice 4.
- No Terraform backend configuration.
- No AWS identity lookup from this document.
- No AWS credentials.
- No EC2, VPC, IAM, DNS, certificate, budget, or monitoring resource creation.
- No ECS, RDS, ElastiCache, ECR, ALB, Route 53, ACM, NAT Gateway, or interface endpoints.
- No Docker runtime file changes.
- No Compose, Dockerfile, application code, package, workflow, or environment-file changes.
- No public SSH.
- No public Grafana or Prometheus.
- No production data.

## 5. Final Architecture

Region: `ap-south-1`

```text
Internet
  |
  v
TCP 443 from approved tester /32
  |
  v
Temporary public IPv4
  |
  v
Disposable EC2 instance
  |
  v
Nginx reverse proxy
  |----------------|
  v                v
Web               API
                    |
                    |----------------|
                    v                v
                  Worker         PostgreSQL
                    |
                    v
                  Redis

Private observability:

Prometheus <---- AutoOps metrics/log evidence
Grafana    <---- accessed only through SSM port forwarding
```

The proof uses one disposable EC2 instance, one dedicated proof VPC, one public subnet, one internet gateway, and one public route table. It uses auto-assigned public IPv4, no Elastic IP, no NAT Gateway, no interface endpoints, no load balancer, no RDS, and no ElastiCache.

## 6. Service Inventory

All eight services run during the proof.

| Service    | Required     | Host exposure                       | Internal port              | Health check                           | Estimated memory | Persistence                      | Startup dependency |
| ---------- | ------------ | ----------------------------------- | -------------------------- | -------------------------------------- | ---------------- | -------------------------------- | ------------------ |
| nginx      | Yes          | TCP 443 only through security group | 80/443 inside host runtime | HTTPS response through approved domain | 50-100 MiB       | None                             | web, api           |
| web        | Yes          | None direct                         | 3000                       | Web root                               | 400-700 MiB      | None                             | api                |
| api        | Yes          | None direct                         | 4000                       | `/health`, `/ready`                    | 400-700 MiB      | None                             | postgres, redis    |
| worker     | Yes          | None                                | 4001                       | `/healthz`                             | 300-600 MiB      | None                             | postgres, redis    |
| postgres   | Yes          | None                                | 5432                       | `pg_isready`                           | 400-800 MiB      | Docker named volume on root disk | None               |
| redis      | Yes          | None                                | 6379                       | `redis-cli ping`                       | 100-256 MiB      | Docker named volume on root disk | None               |
| prometheus | Yes, private | None                                | 9090                       | readiness endpoint or root response    | 200-400 MiB      | Docker named volume on root disk | services           |
| grafana    | Yes, private | None                                | 3000 in container          | `/api/health`                          | 200-400 MiB      | Docker named volume on root disk | prometheus         |

Prometheus and Grafana are deployed privately. They have no public ingress and are accessed only through SSM port forwarding. Grafana is never publicly exposed during this proof.

The Compose hardened base is `docker-compose.prod.yml`. It currently defines only `postgres`, `redis`, `api`, `worker`, and `web`, so it cannot alone start the required eight-service EC2 proof. A future Slice 5 production-safe overlay named `docker-compose.ec2-proof.yml` is mandatory and must add `nginx`, `prometheus`, and `grafana` while preserving private-only observability and hardened service settings.

`docker-compose.yml` is explicitly rejected for this proof because it exposes development ports and mounts development-sensitive resources, including public database and Redis ports and Docker socket access.

## 7. EC2 Instance Decision

Selected instance type: `t3.large`

- vCPU: 2
- Memory: 8 GiB RAM
- CPU architecture: x86_64
- CPU model: burstable CPU
- Maximum runtime: 8 hours
- Normal proof window: 4 hours
- Swap: 2 GiB swap permitted only as an emergency safety valve

Confirmed repository limits:

- `docker-compose.prod.yml` sets CPU, memory, PID, bounded logging, read-only app root filesystem, no-new-privileges, dropped Linux capabilities, private Postgres and Redis, no Docker socket, and no kubeconfig.
- The production Compose baseline does not expose Postgres or Redis host ports.
- `docker-compose.prod.yml` currently includes only `postgres`, `redis`, `api`, `worker`, and `web`; the required `nginx`, `prometheus`, and `grafana` services must be added later through the mandatory `docker-compose.ec2-proof.yml` overlay.

Estimated memory model:

| Component       | Normal estimate | Peak estimate |
| --------------- | --------------: | ------------: |
| Ubuntu + Docker |         600 MiB |       800 MiB |
| nginx           |          50 MiB |       100 MiB |
| web             |         400 MiB |       700 MiB |
| api             |         400 MiB |       700 MiB |
| worker          |         300 MiB |       600 MiB |
| postgres        |         400 MiB |       800 MiB |
| redis           |         100 MiB |       256 MiB |
| prometheus      |         200 MiB |       400 MiB |
| grafana         |         200 MiB |       400 MiB |

Expected normal memory use is approximately 2.7-3.5 GiB. The full eight-service peak estimate is approximately 4.8-5.8 GiB before Docker build cache, image build, migration, package installation, and simultaneous verification overhead. That peak exceeds a 4 GiB `t3.medium` before the riskiest operational overhead is included.

The 2 GiB swap file is allowed only to avoid an emergency out-of-memory failure. Swap cannot justify undersized memory for the approved proof host because sustained swap use would distort runtime evidence and can mask a design that is too small for the eight-service stack.

`t3.small` is rejected because 2 GiB RAM is too tight for the full proof stack plus Docker build cache, migration, Postgres, Redis, Prometheus, and Grafana. `t3.medium` is also rejected for the first proof because 4 GiB RAM is below the estimated peak eight-service need before build and migration overhead. `t3.medium` remains only a future optimization candidate after measured memory evidence, prebuilt images, and tuned container limits show that the proof can run safely without relying on swap. Building images on-instance is feasible on `t3.large`, but build time and T3 CPU burst credits must still be treated as proof risks. CPU credit depletion can slow builds and health checks; the hard 8-hour runtime boundary limits exposure.

## 8. OS and Architecture

Selected OS: Ubuntu Server 24.04 LTS

- Architecture: x86_64
- Package manager: `apt`
- Docker installation: official Docker apt repository
- Docker Compose: Docker Compose v2 plugin
- SSM Agent: installed and verified during bootstrap if not already available
- Security updates: `apt update` and approved package updates during bootstrap

ARM is rejected for the first proof. x86_64 is selected to reduce architecture mismatch risk across Docker images, existing toolchain evidence, Terraform lock platforms, and common EC2 operational expectations.

## 9. Network Design

Network decisions:

- Dedicated proof VPC
- One public subnet
- One internet gateway
- One public route table
- One disposable EC2 instance
- Auto-assigned public IPv4
- IPv6 disabled
- No Elastic IP
- No NAT Gateway
- No interface endpoints
- No load balancer
- No RDS
- No ElastiCache
- No inbound SSH
- No EC2 key pair
- SSM over outbound internet connectivity

Destination-level egress restriction for HTTPS is not practical in this minimal proof without proxy infrastructure, managed endpoints, or additional network controls. The proof avoids NAT Gateway and interface endpoints to control cost and complexity.

## 10. Security-Group Policy

Inbound:

| Protocol          | Port | Source                                | Decision |
| ----------------- | ---- | ------------------------------------- | -------- |
| TCP               | 443  | Explicitly approved tester IPv4 `/32` | Allowed  |
| TCP               | 22   | Any                                   | Denied   |
| TCP               | 80   | Any                                   | Denied   |
| TCP               | 3000 | Any                                   | Denied   |
| TCP               | 3001 | Any                                   | Denied   |
| TCP               | 4000 | Any                                   | Denied   |
| TCP               | 4001 | Any                                   | Denied   |
| TCP               | 5432 | Any                                   | Denied   |
| TCP               | 6379 | Any                                   | Denied   |
| TCP               | 9090 | Any                                   | Denied   |
| All other inbound | Any  | Any                                   | Denied   |

The first implementation has no general public demo exception. `allowed_https_cidr` must be an explicitly approved tester `/32`.

Outbound:

- TCP 443 to the internet for SSM, package installation, Docker downloads, Let's Encrypt workflow support, and required external services.
- TCP 80 outbound only if an approved package repository requires it.
- No broad inbound administration ports.

## 11. TLS Decision

Selected TLS method:

- User-owned and explicitly approved domain or subdomain
- Browser-trusted certificate issued using Let's Encrypt DNS-01
- Manual or separately approved DNS TXT-record workflow
- No public port 80
- No HTTP-01 challenge
- No DNS-provider API credentials on EC2
- No DNS credentials in Terraform
- No DNS credentials in Git
- No DNS credentials in user data
- No certificate renewal automation required for the eight-hour proof

The DNS A record points to the temporary EC2 public IPv4. Because the public IPv4 is auto-assigned and no Elastic IP is used, stopping and restarting the instance can change the public IPv4 and require updating the DNS A record. Termination requires removing the DNS A record.

The certificate and private key must be transferred through an approved secure channel and must not be committed. Certificate files and private keys must be deleted during teardown.

When no approved domain exists, browser-trusted HTTPS proof is blocked. A self-signed certificate may be used only for a separately approved mechanical TLS validation. Self-signed TLS is not equivalent to the approved trusted-browser proof.

## 12. SSM Administration Model

Administration model: SSM Session Manager only.

Requirements:

- No SSH ingress
- No SSH key
- IAM instance role for SSM
- `AmazonSSMManagedInstanceCore` managed policy
- IAM instance profile attached to EC2
- SSM Agent installed and verified
- Outbound HTTPS required
- Public IPv4 required because no NAT Gateway or VPC endpoints are used
- Operator-side Session Manager plugin required

If SSM registration fails, the proof stops before application deployment. The first implementation does not include SSH fallback, SSH ingress, or a key pair. Opening SSH requires a separate design change and approval.

## 13. IAM Design

Future IAM resources are limited to SSM administration:

- `aws_iam_role.ssm_instance`
- `aws_iam_role_policy_attachment.ssm_core`
- `aws_iam_instance_profile.ssm`

The instance role uses `AmazonSSMManagedInstanceCore`. No long-lived AWS access keys are placed on the instance. No application credentials are stored in user data. No AutoOps provider mutation permissions are granted. No AdministratorAccess policy is allowed.

EC2 metadata requirements:

- IMDSv2 required
- Metadata endpoint enabled
- Metadata hop limit evaluated for Docker and set only as needed
- Metadata tags disabled unless separately justified

Operational settings:

- Encrypted gp3 root volume
- Delete on termination
- Detailed monitoring disabled
- Termination protection disabled so approved destroy can succeed
- Shutdown is not final cleanup; termination is required

## 14. AMI Strategy

AMI strategy: required explicit `ami_id` variable.

The AMI must be an explicitly approved Ubuntu Server 24.04 LTS x86_64 AMI in `ap-south-1`. This avoids a Terraform AMI data source in the first proof design and makes the selected image deterministic and reviewable.

Trade-offs:

- Deterministic: yes, because the AMI ID is explicit.
- Staleness risk: yes, because manually supplied AMIs age.
- AWS API requirement during plan: lower than a data-source lookup, because no AMI discovery data source is needed.
- Architecture matching: enforced by manual approval and variable documentation.
- Update process: inspect the official Ubuntu AMI source separately, record the AMI ID, approve it, and pass it as a variable in a later approved implementation.

No live AMI ID is included in this document.

## 15. Bootstrap and Deployment Method

Bootstrap method: minimal user data plus SSM manual deployment.

User data installs only:

- Docker
- Docker Compose v2 plugin
- SSM Agent if necessary
- OS prerequisites
- 2 GiB swap emergency safety valve
- `/opt/autoops-proof`

User data must never contain:

- application deployment
- application secrets
- JWT secrets
- database passwords
- API tokens
- AWS access keys
- private repository tokens
- `.env` contents
- certificate private keys

Application source or deployment bundle is transferred only after explicit approval through SSM. Secrets are transferred through a separately approved secure process. The deployment directory is `/opt/autoops-proof`.

The runtime hardened base is `docker-compose.prod.yml`, which currently starts only `postgres`, `redis`, `api`, `worker`, and `web`. It cannot alone start the required eight-service proof. Slice 5 must add a production-safe `docker-compose.ec2-proof.yml` overlay for `nginx`, `prometheus`, and `grafana` before the proof can run.

Application deployment, migration, and Compose startup occur only after later apply approval. Migrations use:

```text
prisma migrate deploy
```

Never use:

```text
prisma migrate reset
```

The repository must not be assumed public. No private token may be placed in user data.

## 16. Secrets Boundary

Secrets are prohibited in:

- Git
- committed `.env`
- Terraform source
- committed tfvars
- images
- plaintext EC2 user data
- workflow logs
- shell history
- Docker build args
- public evidence

Approved future secret handling must use a separately approved secure process. Certificate and key transfer must also use an approved secure channel. No DNS credentials are allowed on EC2, in Terraform, in Git, or in user data.

## 17. Database and Migration Policy

The proof uses disposable sample data only.

PostgreSQL runs as a private container with no host ingress. Redis runs as a private container with no host ingress. Docker named volumes reside on the encrypted root disk and are destroyed with instance termination.

Migration policy:

- Run `prisma migrate deploy` as a controlled one-off step.
- Do not run migrations in every API replica.
- Do not run concurrent production-like deployments.
- Never run `prisma migrate reset`.
- Take backup evidence before destructive recovery testing.
- Halt deployment if migration fails.
- Prefer forward-fix for recoverable migration issues.
- Use restore only through a controlled restore procedure.

## 18. Storage and Persistence

Storage model:

- One 40 GiB encrypted gp3 root volume
- Delete on termination
- No separate EBS data volume
- All Docker named volumes reside on the root disk
- Disposable sample data only
- No production backup guarantee
- Instance termination destroys Docker volumes and data

Approved disk budget:

| Use                       | Budget |
| ------------------------- | -----: |
| OS and packages           |  8 GiB |
| Docker images/build cache | 12 GiB |
| PostgreSQL                |  4 GiB |
| Redis                     |  1 GiB |
| Grafana                   |  1 GiB |
| Prometheus                |  3 GiB |
| logs                      |  3 GiB |
| backup artifact           |  3 GiB |
| safety margin             |  5 GiB |

## 19. Observability

Observability included in proof:

- Docker health checks
- bounded container logs
- host CPU, memory, disk, and service status checks
- API health and readiness checks
- web health check
- PostgreSQL health check
- Redis health check
- Prometheus deployed privately
- Grafana deployed privately
- external HTTPS check from approved tester source
- deployment evidence
- rollback evidence
- cleanup evidence

Grafana is never publicly exposed. Prometheus and Grafana are accessed only through SSM port forwarding.

## 20. Cost Model

Pricing-check date: 2026-07-20

These figures are estimates and not billing guarantees. Compute and gp3 prices must be revalidated immediately before any Slice 5 plan or apply. No Free Tier is assumed.

Official price source for compute: AWS EC2 On-Demand Instance Pricing and the AWS Price List Bulk API regional AmazonEC2 price list for `ap-south-1` (`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-south-1/index.json`). The selected Linux On-Demand `t3.large` price used here is USD 0.0896/hour.

Assumptions:

- `t3.large` compute estimate: USD 0.0896/hour
- Public IPv4: USD 0.005/hour
- 40 GiB gp3 estimate: approximately USD 0.005/hour
- Estimated combined hourly cost: approximately USD 0.0996
- Conversion assumption: USD 1 = INR 86
- No snapshot
- Negligible proof data transfer assumption
- No Route 53 hosted zone included
- No NAT Gateway
- No endpoints
- No load balancer

| Runtime  | Approximate USD | Approximate INR |
| -------- | --------------: | --------------: |
| 1 hour   |            0.10 |               9 |
| 4 hours  |            0.40 |              34 |
| 8 hours  |            0.80 |              69 |
| 12 hours |            1.20 |             103 |
| 24 hours |            2.39 |             206 |
| 7 days   |           16.73 |           1,439 |
| 30 days  |           71.71 |           6,167 |

Public IPv4 is billed at USD 0.005 per address-hour. AWS Budgets alerts are not automatic hard caps and do not terminate resources.

## 21. Cost-Safety Controls

- Maximum approved direct infrastructure cost per proof run: USD 2.
- The USD 2 run ceiling remains conservative after the `t3.large` recalculation: the eight-hour direct estimate is approximately USD 0.80, leaving roughly USD 1.20 of contingency for estimate drift within the approved runtime.
- Investigate immediately when forecast exceeds USD 5.
- Stop when idle or blocked at four hours.
- Terminate no later than eight hours.
- No Free Tier assumption.
- No Elastic IP.
- No NAT Gateway.
- No endpoints.
- No load balancer.
- No snapshots unless separately approved.
- No Route 53 hosted zone cost included.
- Billing must be checked after teardown with an appropriate delay.

## 22. Exact Future Terraform Resource Set

Future Terraform-managed resources, exactly ten:

1. `aws_vpc.proof`
2. `aws_subnet.public`
3. `aws_internet_gateway.proof`
4. `aws_route_table.public`
5. `aws_route_table_association.public`
6. `aws_security_group.proof_instance`
7. `aws_iam_role.ssm_instance`
8. `aws_iam_role_policy_attachment.ssm_core`
9. `aws_iam_instance_profile.ssm`
10. `aws_instance.proof`

| Address                                   | Purpose                       | Direct cost               | Deletion behavior             | Dependency          | Replacement trigger                    | Cleanup verification |
| ----------------------------------------- | ----------------------------- | ------------------------- | ----------------------------- | ------------------- | -------------------------------------- | -------------------- |
| `aws_vpc.proof`                           | Dedicated proof network       | None direct               | Deleted after dependencies    | None                | CIDR/tag changes                       | VPC absent           |
| `aws_subnet.public`                       | Public subnet                 | None direct               | Deleted with VPC cleanup      | VPC                 | CIDR/AZ changes                        | Subnet absent        |
| `aws_internet_gateway.proof`              | Internet route                | None direct               | Detached and deleted          | VPC                 | VPC replacement                        | IGW absent           |
| `aws_route_table.public`                  | Public route table            | None direct               | Deleted                       | VPC, IGW            | Route changes                          | Route table absent   |
| `aws_route_table_association.public`      | Subnet route binding          | None direct               | Deleted                       | subnet, route table | subnet/RT replacement                  | association absent   |
| `aws_security_group.proof_instance`       | Ingress/egress policy         | None direct               | Deleted                       | VPC                 | rule/VPC replacement                   | SG absent            |
| `aws_iam_role.ssm_instance`               | SSM instance identity         | None direct               | Deleted after profile removal | None                | trust/name changes                     | role absent          |
| `aws_iam_role_policy_attachment.ssm_core` | SSM managed policy attachment | None direct               | Detached/deleted              | IAM role            | role/policy change                     | attachment absent    |
| `aws_iam_instance_profile.ssm`            | EC2 role delivery             | None direct               | Deleted                       | IAM role            | role/name change                       | profile absent       |
| `aws_instance.proof`                      | Disposable host               | compute, public IPv4, EBS | Terminated                    | subnet, SG, profile | AMI/type/user-data/root volume changes | instance terminated  |

All resources require deterministic tags including `Project`, `Environment`, `Owner`, `Gate`, `Slice`, `ProofExpiresAt`, `ManagedBy`, and `Repository`.

## 23. Future Variables and Validations

| Variable                | Type   | Default or required  | Allowed values                               | Validation                                          | Sensitive | Purpose                             |
| ----------------------- | ------ | -------------------- | -------------------------------------------- | --------------------------------------------------- | --------- | ----------------------------------- |
| `aws_region`            | string | default `ap-south-1` | `ap-south-1` only                            | reject all other regions                            | false     | region guardrail                    |
| `project_name`          | string | default `autoops`    | lowercase proof-safe slug                    | reject production names and invalid slug characters | false     | naming and tags                     |
| `environment`           | string | default `proof`      | `proof` only                                 | reject all other values                             | false     | proof-only guardrail                |
| `owner`                 | string | required             | non-empty safe tag value                     | reject blank owner                                  | false     | accountability                      |
| `proof_expires_at`      | string | required             | approved teardown timestamp                  | reject missing value                                | false     | teardown evidence                   |
| `max_proof_hours`       | number | default `8`          | 1 through 8                                  | reject values outside 1-8                           | false     | runtime ceiling                     |
| `instance_type`         | string | default `t3.large`   | `t3.large` only                              | reject all other types                              | false     | compute guardrail                   |
| `ami_id`                | string | required             | manually approved Ubuntu 24.04 x86_64 AMI ID | reject blank or malformed AMI ID                    | false     | deterministic OS image              |
| `root_volume_size_gib`  | number | default `40`         | exactly 40 or bounded no higher than 40      | reject values above 40                              | false     | storage ceiling                     |
| `allowed_https_cidr`    | string | required             | valid IPv4 `/32`                             | reject non-`/32` CIDR                               | false     | HTTPS ingress scope                 |
| `enable_public_https`   | bool   | default `true`       | `true` only                                  | reject false                                        | false     | proof ingress                       |
| `associate_public_ip`   | bool   | default `true`       | `true` only                                  | reject false                                        | false     | SSM and HTTPS without NAT/endpoints |
| `enable_ssm`            | bool   | default `true`       | `true` only                                  | reject false                                        | false     | administration path                 |
| `detailed_monitoring`   | bool   | default `false`      | `false` only                                 | reject true                                         | false     | cost control                        |
| `expected_max_cost_usd` | number | default `2`          | `<= 2`                                       | reject values above 2                               | false     | cost guardrail                      |

No SSH-related variable is included. No secret is modeled as a normal variable. Terraform validation cannot reliably compare a timestamp to continuously changing current time without additional mechanisms; operational gates and teardown timestamps enforce expiry.

## 24. Safe Outputs

Future safe outputs:

| Output                      | Sensitive | Notes                         |
| --------------------------- | --------- | ----------------------------- |
| `instance_id`               | false     | EC2 instance identifier       |
| `public_ipv4`               | false     | temporary public IPv4         |
| `public_url`                | false     | HTTPS URL for approved domain |
| `ssm_target_id`             | false     | SSM target identifier         |
| `proof_expires_at`          | false     | approved expiry timestamp     |
| `estimated_hourly_cost_usd` | false     | documented estimate           |
| `security_group_id`         | false     | proof security group          |

Outputs must exclude credentials, passwords, private keys, user-data content, environment-file content, DNS credentials, and certificate key material.

## 25. Local-State Model

The first proof uses local Terraform state.

- State directory: `infra/terraform/environments/proof`
- State and backups ignored by Git
- Encrypted operator filesystem required
- Single authorized operator
- No concurrent apply
- State backup immediately before apply and destroy
- State loss can prevent reliable Terraform cleanup
- Do not delete state until destroy and independent cleanup verification complete
- Import or manual cleanup requires separate approval
- Future migration to remote S3 state is outside this slice

No backend block is currently implemented or approved by Slice 4.

## 26. Approval Gates A Through M

| Gate | Name                                              | Evidence                                                                     | Approver | Prohibited next action until approved    |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| A    | Design approved                                   | Accepted design document                                                     | User     | Terraform resource code                  |
| B    | Terraform resource code reviewed                  | Full diff and static review                                                  | User     | Static validation                        |
| C    | Static validation passed                          | Formatter and local validators                                               | User     | AWS identity/account/region verification |
| D    | AWS identity/account/region verification approved | Explicit approval for identity/region check                                  | User     | Temporary credential use                 |
| E    | Temporary least-privileged credentials approved   | Credential scope, expiry, and policy review                                  | User     | Terraform init                           |
| F    | Terraform init approved                           | Local state and backend-disabled command review                              | User     | Terraform plan                           |
| G    | Terraform plan reviewed                           | Complete plan output, no unexpected resources                                | User     | Cost approval                            |
| H    | Cost reviewed                                     | Forecast within USD 2 using the `t3.large` cost model and no hidden services | User     | Terraform apply                          |
| I    | Explicit Terraform apply approval                 | Direct approval for one apply                                                | User     | Resource runtime verification            |
| J    | Runtime verification                              | Health, HTTPS, SSM, migration, smoke evidence                                | User     | Extended runtime                         |
| K    | Stop and termination deadlines confirmed          | Exact stop and termination timestamps                                        | User     | Continued operation past boundary        |
| L    | Terraform destroy and cleanup verified            | Destroy output and independent cleanup checklist                             | User     | State deletion                           |
| M    | Billing follow-up completed                       | Delayed billing check and final cost evidence                                | User     | Slice closure                            |

Approval of Slice 4 documentation does not authorize AWS identity lookup, credential use, Terraform init, Terraform plan, Terraform apply, resource creation, Terraform destroy, or AWS API access.

## 27. Failure and Rollback Matrix

| Failure              | Detection                                 | Immediate containment        | Safe recovery                                    | Final cleanup evidence                     |
| -------------------- | ----------------------------------------- | ---------------------------- | ------------------------------------------------ | ------------------------------------------ |
| Partial apply        | Terraform error or partial resource list  | Stop further apply           | Review state and planned cleanup                 | Resource inventory shows expected deletion |
| Bootstrap failure    | User-data log or SSM registration failure | Do not deploy app            | Terminate and recreate after approval            | Instance terminated                        |
| SSM unavailable      | Instance not managed in SSM               | Do not open SSH              | Terminate or approve new admin design            | No SSH rule exists                         |
| Compose failure      | Container health failures                 | Keep ingress restricted      | Inspect logs through SSM                         | Compose and log evidence captured          |
| Migration failure    | `prisma migrate deploy` nonzero           | Halt deployment              | Forward-fix or restore disposable DB             | Migration/restore evidence                 |
| Disk exhaustion      | `df`, Docker build, or volume errors      | Stop build/deploy            | Remove only approved temporary artifacts         | Disk usage evidence                        |
| Memory exhaustion    | OOM events or container restarts          | Stop workload                | Use emergency swap or reduce optional load       | Health and memory evidence                 |
| Overly broad ingress | Security group review                     | Revoke rule immediately      | Restore approved `/32` only                      | Security group export/screenshot           |
| Lost state           | Missing/corrupt state                     | No Terraform mutation        | Separate approval for import or manual cleanup   | Cleanup evidence                           |
| Failed destroy       | Destroy error                             | Prevent further creation     | Diagnose dependencies and retry approved destroy | Zero resource inventory                    |
| Orphaned EBS volume  | EBS inventory after termination           | Delete approved proof volume | Verify delete-on-termination or manual delete    | No EBS volume                              |
| Unexpected billing   | Billing/Cost Explorer                     | Terminate proof resources    | Investigate line items                           | Billing follow-up evidence                 |

Application rollback means restoring the previous approved source or image bundle and Compose configuration. Database rollback uses forward-fix or controlled restore of disposable data. `prisma migrate reset` is never used.

## 28. Final Cleanup Checklist

Final cleanup requires termination and resource deletion. Stopping the instance is not final cleanup.

Verify:

- EC2 terminated
- public IPv4 released
- root EBS volume deleted
- no snapshots
- security group deleted
- route-table association deleted
- route table deleted
- internet gateway detached and deleted
- subnet deleted
- VPC deleted
- IAM instance profile removed
- IAM policy attachment removed
- IAM role removed
- no ENIs
- no Elastic IP
- no NAT Gateway
- no load balancer
- no RDS
- no ElastiCache
- no unexpected SSM parameters or secrets
- certificate and key removed
- DNS A and TXT records removed
- local state shows no resources
- delayed billing check completed

## 29. Remaining Blockers

- Approved user-owned domain or subdomain
- Approved DNS TXT workflow for Let's Encrypt DNS-01
- Approved DNS A record workflow for temporary public IPv4
- Approved tester IPv4 `/32`
- Explicit Ubuntu Server 24.04 LTS x86_64 AMI ID
- AWS account and region verification approval for a later gate
- Temporary least-privileged credential approval for a later gate
- Final cost revalidation before plan or apply
- Future optimization evidence before any `t3.medium` reconsideration
- Exact proof expiry timestamp
- Disposable data approval
- Secure certificate/key transfer process
- Secure application secret transfer process

## 30. Slice 4 Completion Criteria

Slice 4 is complete when:

- This design document is reviewed.
- No Terraform resources are added.
- No AWS credentials are used.
- No AWS commands are run.
- No AWS resources are created.
- No runtime files are modified.
- The one-file documentation scope is preserved.
- Future Slice 5 approval gates are understood.

## 31. Final Decision Summary

- Selected region: `ap-south-1`
- Instance type: `t3.large`
- Instance size: 2 vCPU, 8 GiB RAM, x86_64
- OS: Ubuntu Server 24.04 LTS
- Architecture: x86_64
- Root volume: 40 GiB encrypted gp3, delete on termination
- Included services: nginx, web, api, worker, postgres, redis, prometheus, grafana
- Public IPv4 required: yes
- Public ports: TCP 443 only from approved tester `/32`
- SSH enabled: no
- EC2 key pair: no
- SSM enabled: yes
- TLS method: user-owned approved domain/subdomain with Let's Encrypt DNS-01
- Elastic IP: no
- NAT Gateway: no
- Interface endpoints: no
- Load balancer: no
- RDS: no
- ElastiCache: no
- Normal proof window: 4 hours
- Maximum runtime: 8 hours
- Maximum approved direct infrastructure cost per run: USD 2
- Investigate forecast above: USD 5
- Future Terraform resource count: 10
- Compose base: `docker-compose.prod.yml`
- Mandatory future overlay: `docker-compose.ec2-proof.yml`
- Documentation approval authorizes deployment: no

Decision: proceed only to documentation review. Block AWS identity lookup, credential use, Terraform init, Terraform plan, Terraform apply, Terraform destroy, AWS API access, and resource creation until the required future gates are approved.
