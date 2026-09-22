# AutoOps Rotation Authority

This component is the intended Windows service host for M01.4 rotation
authorization. It is not installed or started by repository tests. Its service
identity is `NT SERVICE\\AutoOpsRotationAuthority`; the authority-owned store is
`C:\\ProgramData\\AutoOps\\rotation-authority` after privileged provisioning.

The service accepts only a bounded named-pipe protocol. It owns canonical plans,
initialization claims, operation records, and acceptance records. Requester-side
PowerShell scripts are clients and have no local durable-record writer fallback.
