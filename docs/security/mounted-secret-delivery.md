# Mounted-secret delivery wiring

AutoOps currently runs in the backward-compatible environment mode. The
mounted-file design is opt-in deployment wiring only: it does not create,
activate, rotate, or store a secret. The default `docker-compose.yml` remains
environment mode.

## Docker Compose overlays

Use the default Compose file alone for environment mode. File mode requires the
explicit core overlay, which changes secret delivery only for the API and
worker:

- `docker-compose.secrets-core.yml` mounts API JWT files and sets both API and
  worker `SECRET_PROVIDER_MODE=file` with root `/run/secrets/autoops`.
- `docker-compose.secrets-github.yml` is an additional API-only GitHub Actions
  token mount. Use it only when GitHub Actions is enabled through approved
  non-secret configuration.
- `docker-compose.secrets-jenkins.yml` is an additional API-and-worker Jenkins
  token mount. It does not enable Jenkins; `JENKINS_INTEGRATION_ENABLED` remains
  disabled unless separately approved.

The core overlay requires external host-file path variables for `jwt-access`
and `jwt-refresh`. Optional integration overlays require their own external
path variable. Compose bind mounts are read-only and refuse to create missing
host paths. Keep host files outside the tracked repository; never place them in
an image, build argument, label, command, or Compose file.

## Fixed mounted filenames

The typed registry accepts only these filenames below the mounted root:

| Semantic secret            | Mounted filename       | API         | Worker        |
| -------------------------- | ---------------------- | ----------- | ------------- |
| JWT access signing secret  | `jwt-access`           | required    | never mounted |
| JWT refresh signing secret | `jwt-refresh`          | required    | never mounted |
| GitHub Actions token       | `github-actions-token` | conditional | never mounted |
| Jenkins API token          | `jenkins-api-token`    | conditional | conditional   |

API file mode fails before listening when either JWT file is missing, invalid,
or empty. The GitHub token becomes required only when GitHub Actions is
enabled. The Jenkins token becomes required only when Jenkins is explicitly
enabled. A disabled Jenkins integration neither resolves nor needs a token,
even if the optional Jenkins overlay is not selected.

## Structural validation

`scripts/validate-mounted-secret-delivery.ps1` validates metadata only. It
checks configured path variables, regular-file type, fixed filename mapping,
duplicate source paths, tracked/ignored repository placement, and Jenkins
overlay gating. It never opens a secret file or prints content, length, hash,
prefix, or suffix. Its `-SelfTest` mode uses only temporary empty files.

Run the validator before any controlled activation and use `docker compose
config` with the selected explicit overlay(s). These checks render structure
only; they do not start, stop, recreate, or activate containers.

## Host filesystem guidance

Use a dedicated external directory with ownership readable by the relevant
container process and restrictive host permissions. On Docker Desktop for
Windows, use fully qualified shared-drive paths and verify file-sharing policy
before a controlled activation. Do not use a repository-relative source path.
The Compose mounts are read-only inside containers.

## Kubernetes status

This repository has a Docker Compose Kubernetes-client connector overlay, but
does not currently maintain Kubernetes workload manifests, Helm charts, or a
GitOps deployment package for AutoOps itself. Kubernetes projected-secret
wiring is therefore deferred rather than introducing an unowned deployment
architecture. A future maintained workload package should project an existing
cluster Secret with the same fixed key-to-filename mapping, read-only volume
mounts, API/worker least-privilege separation, and no committed `data` or
`stringData` values. An ExternalSecret reference may be considered only when
that controller is separately adopted and reviewed.

## Activation, rollback, and rotation

Activation requires a separate approval and must use a non-secret deployment
configuration that selects the needed overlay(s). To roll back, remove all
mounted-secret overlays and return to the default Compose environment mode.
There is no dynamic secret reload: rotation requires a controlled process
recreation after replacement files have been validated. No real secret file is
committed by this design. Future Vault or AWS Secrets Manager providers remain
separate work and are not added here.
