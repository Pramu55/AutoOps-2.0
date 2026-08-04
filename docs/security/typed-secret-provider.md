# Typed SecretProvider foundation

AutoOps v3.1 introduces a small typed boundary for application-owned secrets.
It prevents application services from selecting arbitrary environment variables
or filesystem paths, and reduces accidental logging or serialization of values.
It is not cryptographic memory protection.

## Supported modes

`SECRET_PROVIDER_MODE=env` is the backward-compatible local-development mode.
It reads only the fixed environment-variable mapping in the semantic registry.
In production, readiness reports `DEGRADED_LEGACY_ENV_MODE` to make the legacy
delivery mechanism visible without exposing values.

`SECRET_PROVIDER_MODE=file` reads only allowlisted files from
`SECRET_PROVIDER_ROOT`, which defaults to `/run/secrets/autoops`. File mode does
not fall back to environment variables, and environment mode does not inspect
mounted files. An invalid mode fails startup safely.

## Semantic registry

The first supported identifiers are:

- `auth.jwtAccess` mapped to `JWT_SECRET` and `jwt-access`
- `auth.jwtRefresh` mapped to `JWT_REFRESH_SECRET` and `jwt-refresh`
- `githubActions.token` mapped to `GITHUB_ACTIONS_TOKEN` and
  `github-actions-token`
- `jenkins.apiToken` mapped to `JENKINS_API_TOKEN` and `jenkins-api-token`

Application code asks for these identifiers, not arbitrary environment names or
paths. JWT secrets are required. GitHub Actions and Jenkins tokens are optional
while their integrations are disabled, but required at bootstrap when their
respective integrations are enabled. Jenkins enablement is explicit through the
non-secret `JENKINS_INTEGRATION_ENABLED` setting; it defaults to `false`.

## Mounted-file behavior

The provider reads UTF-8 regular files only. It strips one final newline to
support normal Docker and Kubernetes secret-file delivery, rejects NUL bytes,
and never writes or watches the mounted root. Descriptor filenames are fixed.
The resolved target must remain inside the configured root, so traversal and
symlink escapes are rejected. Kubernetes projected-secret symlinks are accepted
when their resolved target remains inside that root.

A missing or empty required secret blocks startup before the API listens. A
missing optional provider token is recorded as unavailable without starting a
disabled integration. Values are loaded only during controlled resolution;
dynamic reload is intentionally unsupported, so rotation requires a process
restart.

## Redaction and readiness

Resolved values are held in `SecretValue`. Its string conversion, JSON
serialization, and Node inspection output are `[REDACTED]`; the raw value is
available only through the deliberately named `revealForUse()` method at the
integration or signing boundary. Typed provider errors contain safe categories
and semantic identifiers, never file contents or raw filesystem messages.

`/ready` adds only provider mode, status, required-missing count, and
optional-unavailable count. It never returns values, variable names, filenames,
paths, token scopes, lengths, or hashes.

## Scope and extension point

This foundation migrates only API-owned JWT, GitHub Actions, and Jenkins token
delivery. `DATABASE_URL`, PostgreSQL container credentials, Redis, Grafana,
Docker, Kubernetes, Terraform, Ansible, and cloud-provider credentials remain
outside this migration because they have bootstrap or infrastructure ownership
boundaries that require separate design and deployment work.

The asynchronous provider interface is intentionally suitable for a later AWS
Secrets Manager or Vault implementation. This change does not add either client
or alter the local Docker deployment. Example values must always be clearly
fake, such as `test-secret-value-not-real`.
