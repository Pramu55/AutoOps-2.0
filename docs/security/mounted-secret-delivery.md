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
  worker `SECRET_PROVIDER_MODE=file` with root `/run/secrets/autoops`. It
  replaces the base `.env` with the required external, non-secret
  `AUTOOPS_FILE_MODE_ENV_FILE` and explicitly removes the four migrated
  application-secret variables from both service environments.
- `docker-compose.secrets-github.yml` is an additional API-only GitHub Actions
  token mount. Use it only when GitHub Actions is enabled through approved
  non-secret configuration.
- `docker-compose.secrets-jenkins.yml` is an additional API-and-worker Jenkins
  token mount. It does not enable Jenkins; `JENKINS_INTEGRATION_ENABLED` remains
  disabled unless separately approved.

The core overlay requires external host-file path variables for `jwt-access`
and `jwt-refresh`, plus `AUTOOPS_FILE_MODE_ENV_FILE` for the non-secret
runtime configuration normally supplied by `.env`. Optional integration
overlays require their own external path variable. Compose bind mounts are
read-only and refuse to create missing host paths. Keep every host file outside
the tracked repository; never place them in an image, build argument, label,
command, or Compose file.

The core overlay uses Compose's `!override` tag to replace, rather than append
to, the base `env_file` list. Null environment entries remove inherited
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `GITHUB_ACTIONS_TOKEN`, and
`JENKINS_API_TOKEN`. Consequently, the API receives JWT values only from its
two mounted files in file mode, while the worker receives neither JWT nor
GitHub credentials. The GitHub file is mounted only by its API overlay; the
Jenkins file is mounted only by its dedicated API-and-worker overlay.

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
accepts a normalized overlay set, for example `-Overlay core,github,jenkins`;
`core` is implied when an optional overlay is selected. It rejects duplicate or
unknown selections. Enablement is derived exclusively from the approved
external `AUTOOPS_FILE_MODE_ENV_FILE`, not from ambient shell variables. This
matches the file-mode Compose `env_file` source and prevents a shell from
silently changing validation behavior.

The runtime file parser inspects every assignment only for exact, ordinal-case
duplicate detection, but retains and interprets values only for the exact
allowlisted enablement keys `GITHUB_ACTIONS_ENABLED` and
`JENKINS_INTEGRATION_ENABLED`. Lowercase or mixed-case variants are ordinary
Linux environment keys and do not enable an integration. Missing exact keys
use the application's exact `false` default. Duplicate assignments for every
runtime key are rejected before allowlist filtering, so unrelated duplicate
configuration cannot pass.
The runtime file must not contain any migrated application-secret key. When an
integration is enabled, its matching overlay and source path are required;
when disabled, selecting its optional credential overlay fails to prevent
needless credential exposure.

The validator checks configured path variables, regular-file type, fixed
filename mapping, duplicate canonical source paths, and integration/overlay
agreement. It rejects final-file and parent-directory symbolic links,
junctions, reparse points, and repository-contained canonical targets before
any Git tracking check. Every source, including the non-secret runtime file,
must have exactly one filesystem hard link; unavailable or multiply-linked
metadata fails closed. Windows uses read-only handle metadata, Linux uses the
runtime `stat` metadata API, and unsupported platforms fail closed. Git
exit-status checks are then evaluated against each source's own discovered
worktree: tracked sources are rejected, while untracked sources inside a
worktree are accepted only when ignored. Normal sources outside every Git
worktree remain valid; ambiguous Git metadata or command failures fail closed.
For source-specific `ls-files` probes, Git is invoked with
`--literal-pathspecs` before the worktree selection. `check-ignore` rejects
that global mode on the supported Git version, so its relative pathname is
anchored with `./`; this prevents a leading `:` from being parsed as pathspec
magic. The validator relies on Git exit statuses and never prints the source
path or worktree root.

It never opens a mounted secret file or prints content, length, hash, prefix,
suffix, filesystem identifiers, or paths. Its `-RunSelfTest` mode uses only
temporary empty files and non-secret temporary runtime configuration files,
with deterministic metadata-seam coverage for link and hard-link bypass
rejection.

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
