# AO-SEC-001 — Local Credential Exposure and Rotation

## Incident metadata

| Field                      | Value                               |
| -------------------------- | ----------------------------------- |
| Incident ID                | AO-SEC-001                          |
| Detected                   | 2026-08-03                          |
| Project                    | AutoOps                             |
| Severity                   | HIGH                                |
| Current status             | PARTIALLY CLOSED                    |
| Local remediation          | COMPLETE                            |
| Remote provider revocation | PENDING                             |
| Remediation branch         | `security/ao-sec-001-local-closure` |
| Remediation commit         | `9b898b6`                           |

## Summary

An AutoOps security review identified credentials or credential-like values in the
local runtime configuration and container environment. The affected material
included local PostgreSQL, Grafana and JWT credentials, together with configured
GitHub and Jenkins integration tokens.

The incident was treated as a credential exposure. Existing values were not
printed, copied into evidence, committed, or reused during remediation.

## Potential impact

The identified credentials could have been exposed to a person or process able
to inspect the local `.env` file or affected container environment.

This remediation did not establish unauthorized use of any credential. Remote
GitHub and Jenkins revocation and provider-side verification remain required
before the incident can be fully closed.

No verified AWS resource access, AWS mutation, public deployment change, Git
history rewrite or cloud infrastructure change occurred as part of this work.

## Scope

### Locally remediated

- PostgreSQL application credentials
- Grafana administrator credentials
- JWT access and refresh signing secrets
- Local GitHub integration token configuration
- Local Jenkins integration token configuration
- Hard-coded PostgreSQL credentials in `docker-compose.yml`
- Hard-coded Grafana credentials in `docker-compose.yml`

### Pending remote action

- Revoke the previous GitHub personal access token through GitHub.
- Review provider-side token activity where available.
- Create a least-privilege replacement only when the integration is intentionally
  re-enabled.
- Revoke the previous Jenkins API token when the Jenkins controller is available.
- Create a least-privilege Jenkins replacement only when the integration is
  intentionally re-enabled.

No replacement token may be committed, pasted into chat, stored in incident
evidence, or included in screenshots.

## Detection

The exposure was identified during an AutoOps continuation and security audit.
The audit found sensitive values or sensitive configuration in the ignored local
environment and affected container runtime configuration.

The tracked Docker Compose file also contained fixed development PostgreSQL and
Grafana credentials.

## Containment actions completed

1. Rotated the local PostgreSQL application password.
2. Rotated the local Grafana administrator password.
3. Generated distinct replacement JWT access and refresh secrets.
4. Cleared local GitHub token configuration.
5. Disabled the GitHub integration pending remote revocation and replacement.
6. Cleared local Jenkins token configuration.
7. Disabled the Jenkins integration pending controller availability, revocation
   and replacement.
8. Preserved all replacement values only in the ignored local `.env`.
9. Recreated only the API, worker and Grafana services.
10. Preserved PostgreSQL and Redis data and protected Docker volumes.

## Source hardening completed

Commit `9b898b6` removed fixed PostgreSQL and Grafana credentials from the tracked
Docker Compose configuration.

The Compose configuration now:

- Requires `POSTGRES_PASSWORD`.
- Requires `DATABASE_URL`.
- Requires `GRAFANA_ADMIN_PASSWORD`.
- Accepts `POSTGRES_USER`, `POSTGRES_DB` and `GRAFANA_ADMIN_USER` through explicit
  environment configuration with safe non-secret defaults.
- Fails Compose interpolation when required sensitive values are absent.

This is environment externalization, not completion of managed secret storage.
A mounted-file `SecretProvider` boundary remains future work for
`v3.1.0-security`.

## Verification completed

- AutoOps API health passed.
- AutoOps worker health passed.
- AutoOps web health passed.
- PostgreSQL health passed.
- Redis health passed.
- Grafana health passed.
- Prometheus remained available.
- Repository secret scan passed.
- `git diff --check` passed.
- Docker Compose configuration validation passed.
- A normalized parent-versus-current Compose comparison passed.
- The comparison found no semantic change outside the approved credential fields.
- The Git working tree was clean after commit `9b898b6`.

No secret values were included in the recorded verification output.

## Root cause

The local development configuration relied on long-lived credentials supplied
through a local environment file and inherited by application containers.

Additionally, the tracked base Docker Compose file contained fixed PostgreSQL
and Grafana development credentials rather than requiring externally supplied
values.

The project had secret-scanning and redaction guidance, but did not yet provide a
managed or mounted-file secret-provider boundary for all runtime components.

## Contributing factors

- Local-first development configuration.
- Long-lived provider tokens.
- Secrets supplied as process environment variables.
- Fixed development credentials in the base Compose file.
- No completed runtime secret-provider abstraction.
- Local integration credentials had broader lifetimes than desired.
- Container-inspection evidence can expose environment configuration when
  collected unsafely.

## Corrective and preventive actions

### Completed

- Rotate local affected credentials.
- Disable integrations whose remote tokens remain pending.
- Remove fixed PostgreSQL and Grafana credentials from tracked Compose.
- Require sensitive local values through ignored configuration.
- Validate runtime health after targeted service recreation.
- Validate that no unintended Compose behavior changed.
- Preserve secret-free audit evidence.

### Planned for `v3.1.0-security`

- Add a small typed `SecretProvider` interface.
- Add a local-development provider.
- Add a mounted-file production-like provider.
- Fail closed when required production secret references are missing.
- Add nested-object, URL, header, provider-error and serialization redaction
  tests.
- Add secret-safe readiness states without returning secret values.
- Improve automated detection of fixed credentials in Compose and runtime
  configuration.
- Document rotation ownership and expiry expectations.

## Closure criteria

AO-SEC-001 may be marked fully closed only after:

1. The previous GitHub PAT is remotely revoked.
2. GitHub provider-side status or activity is reviewed where available.
3. The previous Jenkins API token is remotely revoked when Jenkins is available.
4. Both integrations remain disabled until approved fresh credentials exist.
5. Any fresh credentials use least privilege and remain only in approved local
   or managed secret storage.
6. Re-enabled integrations return a secret-safe successful status.
7. Full AutoOps release checks pass.
8. The final pull request contains no credential values or unsafe evidence.

## Current conclusion

Local exposure containment and source hardening are complete.

GitHub remediation is complete: previous GitHub tokens were revoked, the
least-privilege replacement was validated, and the GitHub Actions integration
is connected.

The incident remains `PARTIALLY CLOSED` because controller-side revocation of
the previous Jenkins API token cannot be safely verified.

## Jenkins containment and quarantine — 2026-08-04

The original Jenkins controller container was not present. A high-confidence
preserved Jenkins-home Docker volume was discovered, and a separate backup
volume was created and preserved before any recovery action.

An exact compatible local Jenkins image was identified. Jenkins was never
started during discovery, backup, or verification. No setup wizard, plugin
migration, job execution, or security-setting change occurred.

Completed aggregate source-versus-backup measurements matched. Final backup
acceptance was blocked by an unresolved measurement-tooling inconsistency; no
proven source-versus-backup data mismatch was found. The recovery effort was
intentionally stopped rather than risking the preserved controller state.

Both original and backup Jenkins volumes remain detached and quarantined, and
port 8080 remains closed. The AutoOps Jenkins integration remains disabled,
and sanitized configuration verification confirms the local Jenkins token is
absent or empty. No replacement Jenkins token was generated.

The previous Jenkins API token was not controller-side revoked because the
issuing controller could not be safely recovered. Active exposure is contained,
but latent restoration risk remains: restoring preserved state could restore
the token until it is revoked from the recovered original controller.

AO-SEC-001 remains `PARTIALLY CLOSED`.

Restoring either Jenkins volume requires a separately approved,
backup-preserving recovery procedure. The previous Jenkins API token must be
revoked before enabling the AutoOps Jenkins integration, publishing Jenkins
beyond localhost, or triggering any Jenkins job.
