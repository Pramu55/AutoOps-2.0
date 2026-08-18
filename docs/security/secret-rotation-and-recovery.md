# Governed mounted-secret rotation and recovery

M01.4 adds planning and validation tooling around the immutable mounted-secret
sets produced by `prepare-mounted-secret-transfer.ps1`. It does not perform an
activation, retag an image, or select a secret generation implicitly.

## Lifecycle

Each generation is an explicit, lower-case 32-hex transaction ID in the secure
root's `sets` directory. A published generation contains exactly `.published`,
`runtime.env`, `sensitive.env`, `jwt-access`, `jwt-refresh`, and
`github-actions-token`. A staging sibling or any unexpected item is rejected.

The immutable plan is always `PREPARED`. Durable operation evidence has the
strict transition sequence `PREPARED` → `ACTIVATION_ATTEMPT_CONSUMED` → either
`ACTIVE_ACCEPTED` or `ACTIVATION_FAILED` → `ROLLBACK_ATTEMPT_CONSUMED` →
`ROLLED_BACK`. A `MANUAL_INTERVENTION_REQUIRED` marker is terminal. Each record
is create-new, plan-SHA-256-bound non-secret metadata under
`rotation-operations/<operation-id>`; a transition cannot be replayed. An
accepted transition additionally requires a create-new, plan-bound acceptance
evidence record. The ordinary transition tool can consume only intent,
failure, rollback-intent, and manual-intervention markers; it cannot assert
acceptance.

The plan names the candidate, current-good, and optional previous-good IDs.
There is deliberately no `latest` directory selection or mutable current
pointer. The plan is an atomically created metadata file under the protected
secret root's `rotation-plans` directory and contains no secret material. The
directory must be a non-reparse path with a protected Windows ACL limited to
the current operator, SYSTEM, and Administrators; plan reads and writes fail
closed otherwise.

## Preflight

Use `scripts/prepare-secret-rotation.ps1` only after a new published generation
has been independently prepared. It requires explicit transaction IDs,
repository revision, immutable candidate and rollback image IDs, and positive
mounted-secret delivery and image-provenance evidence. The preflight rejects a
candidate equal to current/previous-good, missing sets, staging remnants,
ineligible IDs, malformed paths, malformed plans, invalid overlays, and any
provider-policy drift.

For the `core,sensitive-env,github` deployment contract, GitHub must be
enabled and Jenkins must be disabled. Provider allowlists are compared without
printing their values:

- organization slugs and legacy organization slugs use exact nullable ordinal
  equality;
- organization IDs use exact nullable ordinal equality, with one narrow
  compatibility rule: an env-mode empty value may be absent in `runtime.env`
  because the maintained transfer serializer omits only that empty key.

`runtime.env` parsing accepts the maintained literal single-quoted values and
unquoted boolean flags. Duplicate approved keys, malformed quotes, unsupported
escaping, and ambiguous values fail closed.

## Activation and rollback boundary

The preflight produces an auditable plan with activation and rollback limits of
one. It is not an activation authority. A future owner-authorized change window
must bind the exact planned images, retain the rollback image identities and
non-target/volume metadata, then run one activation. `validate-secret-rotation-runtime.ps1`
is the maintained read-only acceptance harness for that window. It supports
explicit `Candidate` and `Rollback` modes and reads the
expected images and preservation metadata from the immutable operation plan,
rather than accepting those expectations as independent operator parameters.
It checks image identity, health/readiness, exact one-per-target read-only file
mount source binding to the planned generation, worker isolation, migrated
environment-key absence using an exit-code-only presence probe, enablement, provider parity, and
non-target/volume preservation. It returns a named failed gate rather than
treating uncertainty as success.

Immediately before an authorized live action, the operator uses
`update-secret-rotation-operation-state.ps1` to atomically consume the matching
attempt marker. The script cannot overwrite an existing marker or advance an
invalid transition. After the maintained validator has passed, only
`confirm-secret-rotation-runtime.ps1` may append the typed acceptance evidence
and corresponding accepted marker. It re-reads the immutable plan/state and
runs `validate-secret-rotation-runtime.ps1` itself; a caller cannot substitute
a claimed acceptance result.

Recovery inspection calls the same maintained validator in candidate and
rollback modes. `PREPARED` may resume only when the complete current-good
rollback acceptance passes. `ACTIVE_ACCEPTED` and `ROLLED_BACK` produce
`NO_ACTION_REQUIRED` only when their corresponding complete validator result
passes; unknown state, stale images, incomplete mounts, unhealthy services,
provider drift, or migrated secret environment-key presence require manual
intervention. It never accepts a caller-provided runtime classification.

Mounted secret-source comparison is Windows-native canonical path comparison
on the supported Docker Desktop host. A translated VM/Posix source form is not
treated as equivalent to an expected Windows generation path; it fails closed
until a separately reviewed canonical mapping can prove exact source identity.

If a hard gate fails, the separately authorized rollback contract restores the
explicit previous-good image identities and validates the legacy/previous-good
runtime. The tooling never retries activation or rollback automatically.

## Interrupted operations

`inspect-secret-rotation-recovery.ps1` classifies safe metadata only. It does
not mutate Docker or secret sets. Valid classifications are
`NO_ACTION_REQUIRED`, `SAFE_TO_RESUME_PREFLIGHT`, `ACTIVATION_IN_PROGRESS`,
`ROLLBACK_REQUIRED`, and `MANUAL_INTERVENTION_REQUIRED`. Exhausted budgets,
unknown plan states, or incomplete rollback require operator intervention.

## Operator checklist

1. Prepare a new generation with the maintained transfer tool; do not overwrite
   or delete historical sets.
2. Validate the new generation and preserve current-good/previous-good IDs.
3. Create and review a preflight plan with explicit image identities and
   evidence. Do not activate based on timestamps or directory ordering.
4. In a separately authorized live window, execute at most one activation and
   use the maintained acceptance harness.
5. On a hard failure, execute at most one explicit rollback and validate it.
6. If interrupted, run the recovery inspector and follow its classification;
   do not infer a safe resume path.

`SourceMode Runtime` transfer preparation is generation rollover: it captures
the current logical values in the maintained tool's process memory and writes a
new immutable generation. It is not cryptographic secret-value rotation. M01.4
does not manufacture new JWT or provider credentials; a future true value
rotation needs a separately approved credential-source and rotation design.

Never display secret files, secret values, lengths, hashes, tokens, complete
environment arrays, or complete `runtime.env`/`sensitive.env` content. FT3 is
historical M01.3 evidence only; it is not an authority to reuse or replace any
generation.
