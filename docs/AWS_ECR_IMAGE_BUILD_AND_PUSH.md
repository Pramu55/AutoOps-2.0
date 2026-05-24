# AWS ECR Image Build And Push

## Purpose

AutoOps supports governed Docker image build and AWS ECR push workflows for allowlisted application targets. Build and push are intentionally separate operations so teams can review image evidence before pushing to a remote registry.

## Safety Model

- No arbitrary Dockerfile paths.
- No arbitrary build contexts.
- No arbitrary image tags.
- No arbitrary ECR repositories.
- No arbitrary shell execution.
- No AWS infrastructure creation or deletion.
- No Docker login password is printed, stored, or returned.
- No AWS credentials are returned in API responses, UI, logs, operation evidence, or governance export.

## Configuration

Safe optional `.env` settings:

```env
AWS_ECR_ALLOWED_REPOSITORIES=autoops-sample-app
AWS_ECR_ALLOWED_BUILD_TARGETS=aws-sample-ecs-app
AWS_ECR_PUSH_ENABLED=false
AWS_ECR_PRODUCTION_PUSH_REQUIRES_APPROVAL=true
```

`AWS_ECR_PUSH_ENABLED=false` keeps remote push disabled by default. Readiness and repository checks remain read-only.

## Allowlisted Build Targets

Each build target is an internal catalog entry with:

- `targetSlug`
- `displayName`
- `contextPath`
- `dockerfilePath`
- `defaultRepository`
- `allowedEnvironments`
- `allowedPlatforms`

The included safe sample target is `aws-sample-ecs-app`, which maps to `infra/terraform/aws-sample-ecs-app/app`.

## API Routes

- `GET /api/v1/integrations/aws/ecr/readiness`
- `GET /api/v1/integrations/aws/ecr/repositories`
- `GET /api/v1/integrations/aws/ecr/images`
- `POST /api/v1/integrations/aws/ecr/images/build`
- `POST /api/v1/integrations/aws/ecr/images/push`

Repository inventory requires OWNER/ADMIN provider-boundary access. Image operation history is tenant-scoped.

## Operation Policy

| Operation | Token | Approval |
| --- | --- | --- |
| `AWS_ECR_IMAGE_BUILD` | `BUILD` | Not required |
| `AWS_ECR_IMAGE_PUSH` to staging/development | `PUSH` | Not required |
| `AWS_ECR_IMAGE_PUSH` to `production` or `prod` | `PUSH` | Required |

Requester self-approval remains blocked by the shared approval authorization service.

## Worker Execution

The worker executes fixed Docker commands only:

- `docker build` with allowlisted context and Dockerfile.
- `docker login --password-stdin` using AWS ECR authorization.
- `docker push` for selected safe image tags.

Output is summarized and redacted. Operation input stores safe metadata only: repository name, repository URI, image tag, image URI, environment slug, build target, and source build operation ID.

## Governance Evidence

ECR build and push operations appear in:

- Operations Hub
- Operation detail
- Governance Center
- Incident/runbook flow if a worker operation fails

Evidence shows target, repository, tag, digest when available, requester, policy, approval status, lifecycle, and safe result summary.

## Limitations

- AutoOps does not create ECR repositories in this milestone.
- AutoOps does not create ECS services in this milestone.
- AutoOps does not run Terraform apply for ECR.
- Push requires AWS credentials and an existing allowlisted ECR repository.
