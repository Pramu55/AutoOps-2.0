using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace AutoOpsRotationAuthority;

internal static class Program
{
    private const string PipeName = "AutoOpsRotationAuthority-v1";

    public static Task<int> Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test")
        {
            return Task.FromResult(AuthoritySelfTest.Run());
        }

        // This executable is intentionally service-hosted only. Provisioning is
        // separate and assigns NT SERVICE\\AutoOpsRotationAuthority; a user-mode
        // invocation must not create an alternate authority writer.
        if (args.Length != 1 || args[0] != "--service")
        {
            return Task.FromResult(64);
        }

        return Task.FromResult(WindowsServiceHost.Run("AutoOpsRotationAuthority", AuthorityStore.OpenProvisioned, RunServerAsync));
    }

    internal static async Task RunServerAsync(AuthorityStore store, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            await using var pipe = CreateAuthorityPipe(store.AllowedRequesterSid);
            await pipe.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            var response = await AuthorityServer.HandleAsync(pipe, store, cancellationToken).ConfigureAwait(false);
            await AuthorityServer.WriteFrameAsync(pipe, response, cancellationToken).ConfigureAwait(false);
            await pipe.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    internal static NamedPipeServerStream CreateAuthorityPipe(string requesterSid)
    {
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.AddAccessRule(new PipeAccessRule(new NTAccount("NT SERVICE", "AutoOpsRotationAuthority"), PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(requesterSid), PipeAccessRights.ReadWrite, AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(
            PipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            4096,
            4096,
            security);
    }
}

internal enum AuthorityOperation
{
    CreateCanonicalPlan,
    InitializeOperation,
    GetOperationState,
    ConsumeActivationAttempt,
    RecordActivationFailure,
    ConsumeRollbackAttempt,
    RecordManualIntervention,
    ConfirmCandidate,
    ConfirmRollback
}

internal sealed record AuthorityRequest(AuthorityOperation Operation, string OperationId, JsonElement? PlanProposal)
{
    private static readonly Regex OperationIdPattern = new("^[a-f0-9]{32}$", RegexOptions.CultureInvariant);

    public static AuthorityRequest Parse(ReadOnlySpan<byte> utf8)
    {
        using var document = ParseStrictJson(utf8);
        var root = document.RootElement;
        RequireKind(root, JsonValueKind.Object, "IPC_SCHEMA_INVALID");
        var names = PropertyNames(root, "IPC_SCHEMA_INVALID");
        var operationText = RequiredString(root, "operation", "IPC_SCHEMA_INVALID");
        if (!Enum.TryParse<AuthorityOperation>(operationText, ignoreCase: false, out var operation))
        {
            throw new AuthorityException("IPC_OPERATION_INVALID");
        }
        var operationId = RequiredString(root, "operationId", "IPC_SCHEMA_INVALID");
        if (!OperationIdPattern.IsMatch(operationId))
        {
            throw new AuthorityException("IPC_OPERATION_ID_INVALID");
        }
        var hasProposal = root.TryGetProperty("planProposal", out var proposal);
        if (operation == AuthorityOperation.CreateCanonicalPlan)
        {
            RequireExactNames(names, new[] { "operation", "operationId", "planProposal" }, "IPC_SCHEMA_INVALID");
            if (!hasProposal || proposal.ValueKind != JsonValueKind.Object)
            {
                throw new AuthorityException("IPC_PLAN_PROPOSAL_REQUIRED");
            }
            return new AuthorityRequest(operation, operationId, proposal.Clone());
        }
        RequireExactNames(names, new[] { "operation", "operationId" }, "IPC_SCHEMA_INVALID");
        if (hasProposal)
        {
            throw new AuthorityException("IPC_PLAN_PROPOSAL_FORBIDDEN");
        }
        return new AuthorityRequest(operation, operationId, null);
    }

    private static JsonDocument ParseStrictJson(ReadOnlySpan<byte> utf8)
    {
        try
        {
            var document = JsonDocument.Parse(utf8.ToArray());
            AssertNoDuplicateProperties(document.RootElement, "IPC_SCHEMA_INVALID");
            return document;
        }
        catch (AuthorityException)
        {
            throw;
        }
        catch (JsonException)
        {
            throw new AuthorityException("IPC_SCHEMA_INVALID");
        }
    }

    internal static void AssertNoDuplicateProperties(JsonElement value, string code)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var property in value.EnumerateObject())
                {
                    if (!names.Add(property.Name)) throw new AuthorityException(code);
                    AssertNoDuplicateProperties(property.Value, code);
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in value.EnumerateArray()) AssertNoDuplicateProperties(item, code);
                break;
        }
    }

    internal static HashSet<string> PropertyNames(JsonElement element, string code)
    {
        RequireKind(element, JsonValueKind.Object, code);
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!result.Add(property.Name)) throw new AuthorityException(code);
        }
        return result;
    }

    internal static void RequireExactNames(HashSet<string> actual, IEnumerable<string> expected, string code)
    {
        var expectedSet = new HashSet<string>(expected, StringComparer.Ordinal);
        if (!actual.SetEquals(expectedSet)) throw new AuthorityException(code);
    }

    internal static string RequiredString(JsonElement element, string name, string code)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
        {
            throw new AuthorityException(code);
        }
        return value.GetString()!;
    }

    internal static void RequireKind(JsonElement element, JsonValueKind kind, string code)
    {
        if (element.ValueKind != kind) throw new AuthorityException(code);
    }
}

internal sealed record CanonicalPlan(string OperationId, byte[] Utf8, string Identity)
{
    private static readonly Regex GenerationId = new("^[a-f0-9]{32}$", RegexOptions.CultureInvariant);
    private static readonly Regex Revision = new("^[a-f0-9]{40}$", RegexOptions.CultureInvariant);
    private static readonly Regex Digest = new("^sha256:[a-f0-9]{64}$", RegexOptions.CultureInvariant);
    private static readonly string[] RequiredOverlays = ["core", "sensitive-env", "github"];
    private static readonly string[] RequiredGates = ["mounted-secret-delivery", "provider-semantic-equivalence", "image-provenance", "runtime-acceptance"];
    private static readonly string[] NonTargets = ["autoops-grafana", "autoops-nginx", "autoops-postgres", "autoops-prometheus", "autoops-redis", "autoops-web"];

    public static CanonicalPlan Create(string operationId, JsonElement proposal)
    {
        var names = AuthorityRequest.PropertyNames(proposal, "CANONICAL_PLAN_INVALID");
        AuthorityRequest.RequireExactNames(names, new[]
        {
            "candidateGenerationId", "currentGoodGenerationId", "previousGoodGenerationId", "repositoryRevision",
            "apiImageId", "workerImageId", "requiredOverlays", "rollback"
        }, "CANONICAL_PLAN_INVALID");
        var candidate = AuthorityRequest.RequiredString(proposal, "candidateGenerationId", "CANONICAL_PLAN_INVALID");
        var current = AuthorityRequest.RequiredString(proposal, "currentGoodGenerationId", "CANONICAL_PLAN_INVALID");
        var previous = proposal.GetProperty("previousGoodGenerationId");
        var previousValue = previous.ValueKind == JsonValueKind.Null ? null : previous.ValueKind == JsonValueKind.String ? previous.GetString() : throw new AuthorityException("CANONICAL_PLAN_INVALID");
        var revision = AuthorityRequest.RequiredString(proposal, "repositoryRevision", "CANONICAL_PLAN_INVALID");
        var apiImage = AuthorityRequest.RequiredString(proposal, "apiImageId", "CANONICAL_PLAN_INVALID");
        var workerImage = AuthorityRequest.RequiredString(proposal, "workerImageId", "CANONICAL_PLAN_INVALID");
        if (!GenerationId.IsMatch(operationId) || !GenerationId.IsMatch(candidate) || !GenerationId.IsMatch(current) ||
            (previousValue is not null && !GenerationId.IsMatch(previousValue)) || candidate == current || candidate == previousValue ||
            !Revision.IsMatch(revision) || !Digest.IsMatch(apiImage) || !Digest.IsMatch(workerImage) || apiImage == workerImage)
        {
            throw new AuthorityException("CANONICAL_PLAN_INVALID");
        }
        ValidateExactStringArray(proposal.GetProperty("requiredOverlays"), RequiredOverlays, "CANONICAL_PLAN_INVALID");
        ValidateRollback(proposal.GetProperty("rollback"), current);

        var payload = new JsonObject
        {
            ["schemaVersion"] = 1,
            ["operationId"] = operationId,
            // Plan admission is not operation initialization.  In particular,
            // it must never be confused with PREPARED before the service has
            // independently passed the rollback runtime baseline and created
            // the one-time initialization claim.
            ["status"] = "ADMITTED",
            ["createdAtUtc"] = DateTime.UtcNow.ToString("O"),
            ["candidateGenerationId"] = candidate,
            ["currentGoodGenerationId"] = current,
            ["previousGoodGenerationId"] = previousValue,
            ["repositoryRevision"] = revision,
            ["apiImageId"] = apiImage,
            ["workerImageId"] = workerImage,
            ["runtimeServices"] = new JsonObject { ["api"] = "autoops-api", ["worker"] = "autoops-worker" },
            ["requiredOverlays"] = new JsonArray(RequiredOverlays.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
            ["requiredGates"] = new JsonArray(RequiredGates.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
            ["activationAttemptLimit"] = 1,
            ["rollbackAttemptLimit"] = 1,
            ["activationAttempts"] = 0,
            ["rollbackAttempts"] = 0,
            ["rollback"] = JsonNode.Parse(proposal.GetProperty("rollback").GetRawText())
        };
        var bytes = Encoding.UTF8.GetBytes(payload.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
        return new CanonicalPlan(operationId, bytes, "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
    }

    public static CanonicalPlan Parse(string expectedOperationId, ReadOnlySpan<byte> utf8)
    {
        try
        {
            using var document = JsonDocument.Parse(utf8.ToArray());
            var root = document.RootElement;
            AuthorityRequest.AssertNoDuplicateProperties(root, "CANONICAL_PLAN_INVALID");
            AuthorityRequest.RequireKind(root, JsonValueKind.Object, "CANONICAL_PLAN_INVALID");
            AuthorityRequest.RequireExactNames(AuthorityRequest.PropertyNames(root, "CANONICAL_PLAN_INVALID"), new[]
            {
                "schemaVersion", "operationId", "status", "createdAtUtc", "candidateGenerationId", "currentGoodGenerationId",
                "previousGoodGenerationId", "repositoryRevision", "apiImageId", "workerImageId", "runtimeServices",
                "requiredOverlays", "requiredGates", "activationAttemptLimit", "rollbackAttemptLimit", "activationAttempts",
                "rollbackAttempts", "rollback"
            }, "CANONICAL_PLAN_INVALID");
            if (root.GetProperty("schemaVersion").ValueKind != JsonValueKind.Number || root.GetProperty("schemaVersion").GetInt32() != 1 ||
                AuthorityRequest.RequiredString(root, "operationId", "CANONICAL_PLAN_INVALID") != expectedOperationId ||
                AuthorityRequest.RequiredString(root, "status", "CANONICAL_PLAN_INVALID") != "ADMITTED" ||
                !DateTime.TryParse(AuthorityRequest.RequiredString(root, "createdAtUtc", "CANONICAL_PLAN_INVALID"), out _) ||
                root.GetProperty("activationAttemptLimit").GetInt32() != 1 || root.GetProperty("rollbackAttemptLimit").GetInt32() != 1 ||
                root.GetProperty("activationAttempts").GetInt32() != 0 || root.GetProperty("rollbackAttempts").GetInt32() != 0)
            {
                throw new AuthorityException("CANONICAL_PLAN_INVALID");
            }
            var runtimeServices = root.GetProperty("runtimeServices");
            AuthorityRequest.RequireExactNames(AuthorityRequest.PropertyNames(runtimeServices, "CANONICAL_PLAN_INVALID"), new[] { "api", "worker" }, "CANONICAL_PLAN_INVALID");
            if (AuthorityRequest.RequiredString(runtimeServices, "api", "CANONICAL_PLAN_INVALID") != "autoops-api" ||
                AuthorityRequest.RequiredString(runtimeServices, "worker", "CANONICAL_PLAN_INVALID") != "autoops-worker")
            {
                throw new AuthorityException("CANONICAL_PLAN_INVALID");
            }
            ValidateExactStringArray(root.GetProperty("requiredOverlays"), RequiredOverlays, "CANONICAL_PLAN_INVALID");
            ValidateExactStringArray(root.GetProperty("requiredGates"), RequiredGates, "CANONICAL_PLAN_INVALID");
            var proposalJson = new JsonObject
            {
                ["candidateGenerationId"] = root.GetProperty("candidateGenerationId").GetString(),
                ["currentGoodGenerationId"] = root.GetProperty("currentGoodGenerationId").GetString(),
                ["previousGoodGenerationId"] = root.GetProperty("previousGoodGenerationId").ValueKind == JsonValueKind.Null ? null : root.GetProperty("previousGoodGenerationId").GetString(),
                ["repositoryRevision"] = root.GetProperty("repositoryRevision").GetString(),
                ["apiImageId"] = root.GetProperty("apiImageId").GetString(),
                ["workerImageId"] = root.GetProperty("workerImageId").GetString(),
                ["requiredOverlays"] = JsonNode.Parse(root.GetProperty("requiredOverlays").GetRawText()),
                ["rollback"] = JsonNode.Parse(root.GetProperty("rollback").GetRawText())
            };
            using var proposalDocument = JsonDocument.Parse(proposalJson.ToJsonString());
            _ = Create(expectedOperationId, proposalDocument.RootElement);
            var bytes = utf8.ToArray();
            return new CanonicalPlan(expectedOperationId, bytes, "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
        }
        catch (AuthorityException)
        {
            throw;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException)
        {
            throw new AuthorityException("CANONICAL_PLAN_INVALID");
        }
    }

    private static void ValidateRollback(JsonElement rollback, string current)
    {
        var names = AuthorityRequest.PropertyNames(rollback, "CANONICAL_PLAN_INVALID");
        AuthorityRequest.RequireExactNames(names, new[] { "TargetGenerationId", "ApiImageId", "WorkerImageId", "ExpectedRuntimeMode", "ExpectedHealthEndpoints", "NonTargetContainerIds", "VolumeInventory" }, "CANONICAL_PLAN_INVALID");
        if (AuthorityRequest.RequiredString(rollback, "TargetGenerationId", "CANONICAL_PLAN_INVALID") != current ||
            !Digest.IsMatch(AuthorityRequest.RequiredString(rollback, "ApiImageId", "CANONICAL_PLAN_INVALID")) ||
            !Digest.IsMatch(AuthorityRequest.RequiredString(rollback, "WorkerImageId", "CANONICAL_PLAN_INVALID")) ||
            AuthorityRequest.RequiredString(rollback, "ExpectedRuntimeMode", "CANONICAL_PLAN_INVALID") != "file")
        {
            throw new AuthorityException("CANONICAL_PLAN_INVALID");
        }
        ValidateExactStringArray(rollback.GetProperty("ExpectedHealthEndpoints"), ["/health", "/ready", "/healthz", "/readyz"], "CANONICAL_PLAN_INVALID");
        var containers = rollback.GetProperty("NonTargetContainerIds");
        var containerNames = AuthorityRequest.PropertyNames(containers, "CANONICAL_PLAN_INVALID");
        AuthorityRequest.RequireExactNames(containerNames, NonTargets, "CANONICAL_PLAN_INVALID");
        foreach (var property in containers.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String || !Regex.IsMatch(property.Value.GetString()!, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant)) throw new AuthorityException("CANONICAL_PLAN_INVALID");
        }
        var volumes = rollback.GetProperty("VolumeInventory");
        AuthorityRequest.RequireKind(volumes, JsonValueKind.Array, "CANONICAL_PLAN_INVALID");
        foreach (var volume in volumes.EnumerateArray())
        {
            if (volume.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(volume.GetString())) throw new AuthorityException("CANONICAL_PLAN_INVALID");
        }
    }

    private static void ValidateExactStringArray(JsonElement array, IReadOnlyList<string> expected, string code)
    {
        AuthorityRequest.RequireKind(array, JsonValueKind.Array, code);
        var actual = array.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : null).ToArray();
        if (actual.Length != expected.Count || actual.Any(item => item is null) || !actual.SequenceEqual(expected, StringComparer.Ordinal)) throw new AuthorityException(code);
    }
}

internal sealed class AuthorityStore
{
    private static readonly Regex OperationIdPattern = new("^[a-f0-9]{32}$", RegexOptions.CultureInvariant);
    private readonly string _root;
    private readonly IRuntimeValidator _validator;
    private readonly bool _enforceProvisionedAcl;
    public string AllowedRequesterSid { get; }

    private AuthorityStore(string root, IRuntimeValidator validator, string allowedRequesterSid, bool enforceProvisionedAcl)
    {
        _root = Path.GetFullPath(root);
        _validator = validator;
        AllowedRequesterSid = allowedRequesterSid;
        _enforceProvisionedAcl = enforceProvisionedAcl;
    }

    public static AuthorityStore OpenProvisioned()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AutoOps", "rotation-authority");
        var settings = AuthoritySettings.Load(root);
        var store = new AuthorityStore(root, new FailClosedRuntimeValidator(), settings.RequesterSid, enforceProvisionedAcl: true);
        store.AssertProvisionedLayout();
        return store;
    }

    internal static AuthorityStore CreateSynthetic(string root, IRuntimeValidator validator)
    {
        Directory.CreateDirectory(root);
        foreach (var child in new[] { "plans", "initialization-claims", "operations" }) Directory.CreateDirectory(Path.Combine(root, child));
        return new AuthorityStore(root, validator, "S-1-5-21-1-2-3-1001", enforceProvisionedAcl: false);
    }

    public void CreateCanonicalPlan(CanonicalPlan plan)
    {
        AssertProvisionedLayout();
        WriteCreateNew(PlanPath(plan.OperationId), plan.Utf8, "CANONICAL_PLAN_EXISTS_OR_WRITE_FAILED");
    }

    public string GetOperationState(string operationId)
    {
        if (!File.Exists(PlanPath(operationId))) return "CANONICAL_PLAN_MISSING";
        CanonicalPlan plan;
        try { plan = ReadCanonicalPlan(operationId); }
        catch (AuthorityException) { return "CANONICAL_PLAN_INTERRUPTED_OR_TAMPERED"; }
        var claimPath = ClaimPath(operationId);
        if (!File.Exists(claimPath)) return "NEVER_INITIALIZED";
        if (!IsValidClaim(claimPath, plan)) return "INITIALIZATION_CLAIM_INTERRUPTED_OR_TAMPERED";
        var operationDirectory = OperationDirectory(operationId);
        if (!Directory.Exists(operationDirectory) || !File.Exists(Path.Combine(operationDirectory, "operation-created.json"))) return "OPERATION_INITIALIZATION_INTERRUPTED";
        return "PREPARED";
    }

    public void InitializeOperation(string operationId)
    {
        var plan = ReadCanonicalPlan(operationId);
        if (!_validator.ValidateRollbackBaseline(plan)) throw new AuthorityException("ROLLBACK_RUNTIME_BASELINE_REJECTED");
        var claimPath = ClaimPath(operationId);
        if (File.Exists(claimPath)) throw new AuthorityException("ROTATION_INITIALIZATION_ALREADY_CLAIMED");
        var claim = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { schemaVersion = 1, operationId, planIdentity = plan.Identity, transition = "INITIALIZATION_CLAIMED", createdAtUtc = DateTime.UtcNow.ToString("O") }));
        WriteCreateNew(claimPath, claim, "ROTATION_INITIALIZATION_ALREADY_CLAIMED");
        var operationDirectory = OperationDirectory(operationId);
        if (Directory.Exists(operationDirectory)) throw new AuthorityException("ROTATION_OPERATION_EXISTS");
        Directory.CreateDirectory(operationDirectory);
        var created = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { schemaVersion = 1, operationId, planIdentity = plan.Identity, transition = "OPERATION_CREATED", createdAtUtc = DateTime.UtcNow.ToString("O") }));
        WriteCreateNew(Path.Combine(operationDirectory, "operation-created.json"), created, "ROTATION_OPERATION_RECORD_WRITE_FAILED");
    }

    private CanonicalPlan ReadCanonicalPlan(string operationId)
    {
        if (!OperationIdPattern.IsMatch(operationId)) throw new AuthorityException("IPC_OPERATION_ID_INVALID");
        var path = PlanPath(operationId);
        if (!File.Exists(path)) throw new AuthorityException("CANONICAL_PLAN_MISSING");
        try { return CanonicalPlan.Parse(operationId, File.ReadAllBytes(path)); }
        catch (IOException) { throw new AuthorityException("CANONICAL_PLAN_INVALID"); }
    }

    private bool IsValidClaim(string path, CanonicalPlan plan)
    {
        try
        {
            var bytes = File.ReadAllBytes(path);
            using var document = JsonDocument.Parse(bytes);
            AuthorityRequest.AssertNoDuplicateProperties(document.RootElement, "ROTATION_INITIALIZATION_CLAIM_INVALID");
            var root = document.RootElement;
            AuthorityRequest.RequireExactNames(AuthorityRequest.PropertyNames(root, "ROTATION_INITIALIZATION_CLAIM_INVALID"), new[] { "schemaVersion", "operationId", "planIdentity", "transition", "createdAtUtc" }, "ROTATION_INITIALIZATION_CLAIM_INVALID");
            return root.GetProperty("schemaVersion").GetInt32() == 1 &&
                   root.GetProperty("operationId").GetString() == plan.OperationId &&
                   root.GetProperty("planIdentity").GetString() == plan.Identity &&
                   root.GetProperty("transition").GetString() == "INITIALIZATION_CLAIMED" &&
                   root.GetProperty("createdAtUtc").ValueKind == JsonValueKind.String;
        }
        catch
        {
            return false;
        }
    }

    private void AssertProvisionedLayout()
    {
        var authoritySid = _enforceProvisionedAcl ? WindowsIdentity.GetCurrent().User ?? throw new AuthorityException("AUTHORITY_SERVICE_IDENTITY_UNAVAILABLE") : null;
        var requesterSid = _enforceProvisionedAcl ? new SecurityIdentifier(AllowedRequesterSid) : null;
        var parent = Path.GetDirectoryName(_root);
        if (_enforceProvisionedAcl && (string.IsNullOrWhiteSpace(parent) || !Directory.Exists(parent))) throw new AuthorityException("AUTHORITY_STORE_PARENT_UNAVAILABLE");
        if (_enforceProvisionedAcl) AuthorityStoreSecurity.AssertAuthorityStoreParentDescriptor(parent!, authoritySid!, requesterSid!);
        foreach (var path in new[] { _root, Path.Combine(_root, "plans"), Path.Combine(_root, "initialization-claims"), Path.Combine(_root, "operations") })
        {
            if (!Directory.Exists(path)) throw new AuthorityException("AUTHORITY_STORE_UNAVAILABLE");
            if (_enforceProvisionedAcl) AuthorityStoreSecurity.AssertProvisionedDescriptor(path, authoritySid!, requesterSid!);
        }
    }

    internal bool IsApprovedRequesterSid(string? callerSid) =>
        !string.IsNullOrWhiteSpace(callerSid) && string.Equals(callerSid, AllowedRequesterSid, StringComparison.Ordinal);

    private string PlanPath(string operationId) => SafeChild("plans", operationId + ".json");
    private string ClaimPath(string operationId) => SafeChild("initialization-claims", operationId + ".json");
    private string OperationDirectory(string operationId) => SafeChild("operations", operationId);

    private string SafeChild(string directory, string leaf)
    {
        if (!OperationIdPattern.IsMatch(Path.GetFileNameWithoutExtension(leaf))) throw new AuthorityException("IPC_OPERATION_ID_INVALID");
        var parent = Path.Combine(_root, directory);
        var result = Path.GetFullPath(Path.Combine(parent, leaf));
        if (!result.StartsWith(parent + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new AuthorityException("AUTHORITY_STORE_PATH_INVALID");
        return result;
    }

    private static void WriteCreateNew(string path, byte[] bytes, string code)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough);
            stream.Write(bytes, 0, bytes.Length);
            stream.Flush(flushToDisk: true);
        }
        catch (IOException)
        {
            throw new AuthorityException(code);
        }
    }
}

internal interface IRuntimeValidator
{
    bool ValidateRollbackBaseline(CanonicalPlan plan);
}

internal sealed class FailClosedRuntimeValidator : IRuntimeValidator
{
    public bool ValidateRollbackBaseline(CanonicalPlan plan) => false;
}

internal sealed class StaticRuntimeValidator(bool result) : IRuntimeValidator
{
    public bool ValidateRollbackBaseline(CanonicalPlan plan) => result;
}

internal static class AuthorityServer
{
    public static async Task<byte[]> HandleAsync(NamedPipeServerStream pipe, AuthorityStore store, CancellationToken cancellationToken)
    {
        try
        {
            var callerSid = GetAuthenticatedClientSid(pipe);
            if (!store.IsApprovedRequesterSid(callerSid)) throw new AuthorityException("IPC_CALLER_UNAUTHORIZED");
            var request = AuthorityRequest.Parse(await ReadFrameAsync(pipe, cancellationToken).ConfigureAwait(false));
            object payload = request.Operation switch
            {
                AuthorityOperation.CreateCanonicalPlan => CreateCanonicalPlan(store, request),
                AuthorityOperation.InitializeOperation => Initialize(store, request),
                AuthorityOperation.GetOperationState => new { result = "PASS", state = store.GetOperationState(request.OperationId) },
                _ => throw new AuthorityException("IPC_OPERATION_NOT_IMPLEMENTED")
            };
            return JsonSerializer.SerializeToUtf8Bytes(payload);
        }
        catch (AuthorityException error)
        {
            return JsonSerializer.SerializeToUtf8Bytes(new { result = "FAIL", errorCode = error.Code });
        }
        catch
        {
            return JsonSerializer.SerializeToUtf8Bytes(new { result = "FAIL", errorCode = "AUTHORITY_REQUEST_FAILED" });
        }
    }

    internal static string GetAuthenticatedClientSid(NamedPipeServerStream pipe)
    {
        string? result = null;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent();
            result = identity.User?.Value;
        });
        if (string.IsNullOrWhiteSpace(result)) throw new AuthorityException("IPC_CALLER_IDENTITY_UNAVAILABLE");
        return result;
    }

    public static async Task WriteFrameAsync(Stream stream, byte[] payload, CancellationToken cancellationToken)
    {
        if (payload.Length == 0 || payload.Length > 16 * 1024) throw new AuthorityException("IPC_RESPONSE_INVALID");
        await stream.WriteAsync(BitConverter.GetBytes(payload.Length), cancellationToken).ConfigureAwait(false);
        await stream.WriteAsync(payload, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<byte[]> ReadFrameAsync(Stream stream, CancellationToken cancellationToken)
    {
        var header = new byte[sizeof(int)];
        await ReadExactlyAsync(stream, header, cancellationToken).ConfigureAwait(false);
        var length = BitConverter.ToInt32(header, 0);
        if (length <= 0 || length > 16 * 1024) throw new AuthorityException("IPC_REQUEST_INVALID");
        var payload = new byte[length];
        await ReadExactlyAsync(stream, payload, cancellationToken).ConfigureAwait(false);
        return payload;
    }

    private static async Task ReadExactlyAsync(Stream stream, byte[] buffer, CancellationToken cancellationToken)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset), cancellationToken).ConfigureAwait(false);
            if (read == 0) throw new AuthorityException("IPC_REQUEST_INVALID");
            offset += read;
        }
    }

    private static object CreateCanonicalPlan(AuthorityStore store, AuthorityRequest request)
    {
        var plan = CanonicalPlan.Create(request.OperationId, request.PlanProposal!.Value);
        store.CreateCanonicalPlan(plan);
        return new { result = "PASS", planIdentity = plan.Identity };
    }

    private static object Initialize(AuthorityStore store, AuthorityRequest request)
    {
        store.InitializeOperation(request.OperationId);
        return new { result = "PASS", state = "PREPARED" };
    }
}

internal sealed class AuthorityException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

internal static class AuthoritySelfTest
{
    public static int Run()
    {
        var root = Path.Combine(Path.GetTempPath(), "autoops-rotation-authority-" + Guid.NewGuid().ToString("N"));
        try
        {
            var validator = new StaticRuntimeValidator(true);
            var store = AuthorityStore.CreateSynthetic(root, validator);
            var descriptor = AuthorityStoreSecurity.CreateExpectedDescriptor(new SecurityIdentifier("S-1-5-80-1-2-3-4-5"), new SecurityIdentifier("S-1-5-21-1-2-3-1001"));
            Assert(AuthorityStoreSecurity.RequesterCannotWrite(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001")), "REQUESTER_STORE_WRITE_BLOCKED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.WriteData), "REQUESTER_WRITE_DATA_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.AppendData), "REQUESTER_APPEND_DATA_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.Delete), "REQUESTER_DELETE_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.DeleteSubdirectoriesAndFiles), "REQUESTER_DELETE_CHILD_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.ChangePermissions), "REQUESTER_CHANGE_PERMISSIONS_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.TakeOwnership), "REQUESTER_TAKE_OWNERSHIP_DENIED");
            Assert(!AuthorityStoreSecurity.RequesterHasDangerousRight(descriptor, new SecurityIdentifier("S-1-5-21-1-2-3-1001"), FileSystemRights.DeleteSubdirectoriesAndFiles), "REQUESTER_PARENT_DELETE_CHILD_DENIED");
            var operation = new string('a', 32);
            var request = AuthorityRequest.Parse(Encoding.UTF8.GetBytes(CreateRequestJson(operation)));
            Assert(request.Operation == AuthorityOperation.CreateCanonicalPlan, "IPC_TYPED_OPERATION");
            var plan = CanonicalPlan.Create(operation, request.PlanProposal!.Value);
            store.CreateCanonicalPlan(plan);
            AssertThrows(() => store.CreateCanonicalPlan(plan), "CANONICAL_PLAN_REWRITE_BLOCKED");
            Assert(store.GetOperationState(operation) == "NEVER_INITIALIZED", "CANONICAL_PLAN_ADMISSION_NOT_PREPARED");
            store.InitializeOperation(operation);
            Assert(store.GetOperationState(operation) == "PREPARED", "VALIDATED_INITIALIZATION_PREPARED");
            AssertThrows(() => store.InitializeOperation(operation), "INITIALIZATION_REPLAY_BLOCKED");
            var tornOperation = new string('b', 32);
            var tornPlan = CanonicalPlan.Create(tornOperation, AuthorityRequest.Parse(Encoding.UTF8.GetBytes(CreateRequestJson(tornOperation))).PlanProposal!.Value);
            store.CreateCanonicalPlan(tornPlan);
            File.WriteAllBytes(Path.Combine(root, "initialization-claims", tornOperation + ".json"), []);
            Assert(store.GetOperationState(tornOperation) == "INITIALIZATION_CLAIM_INTERRUPTED_OR_TAMPERED", "TORN_CLAIM_MANUAL_STATE");
            AssertThrows(() => store.InitializeOperation(tornOperation), "TORN_CLAIM_NEVER_PREPARED");
            var tornPlanOperation = new string('c', 32);
            File.WriteAllBytes(Path.Combine(root, "plans", tornPlanOperation + ".json"), []);
            Assert(store.GetOperationState(tornPlanOperation) == "CANONICAL_PLAN_INTERRUPTED_OR_TAMPERED", "CANONICAL_PLAN_TORN_WRITE_MANUAL");
            AssertThrows(() => store.InitializeOperation(tornPlanOperation), "CANONICAL_PLAN_TORN_WRITE_NEVER_PREPARED");
            var wrongBindingOperation = new string('e', 32);
            File.WriteAllBytes(Path.Combine(root, "plans", wrongBindingOperation + ".json"), Encoding.UTF8.GetBytes("{\"operationId\":\"" + operation + "\"}"));
            Assert(store.GetOperationState(wrongBindingOperation) == "CANONICAL_PLAN_INTERRUPTED_OR_TAMPERED", "CANONICAL_PLAN_WRONG_BINDING_BLOCKED");
            AssertThrows(() => AuthorityRequest.Parse(Encoding.UTF8.GetBytes("{\"operation\":\"GetOperationState\",\"operation\":\"InitializeOperation\",\"operationId\":\"" + operation + "\"}")), "IPC_DUPLICATE_FIELD_BLOCKED");
            AssertThrows(() => AuthorityRequest.Parse(Encoding.UTF8.GetBytes("{\"operation\":\"GetOperationState\",\"operationId\":\"" + operation + "\",\"validationPassed\":true}")), "IPC_CALLER_PASS_FIELD_BLOCKED");
            AssertThrows(() => AuthorityRequest.Parse(Encoding.UTF8.GetBytes("{\"operation\":\"GetOperationState\",\"operationId\":\"" + operation + "\",\"requesterSid\":\"S-1-5-18\"}")), "IPC_PAYLOAD_IDENTITY_IGNORED");
            Assert(store.IsApprovedRequesterSid("S-1-5-21-1-2-3-1001") && !store.IsApprovedRequesterSid("S-1-5-21-1-2-3-1002"), "UNAPPROVED_PIPE_CLIENT_BLOCKED");
            Console.WriteLine("AUTHORITY_CANONICAL_PLAN_CREATE_NEW PASS");
            Console.WriteLine("AUTHORITY_INITIALIZATION_SINGLE_USE PASS");
            Console.WriteLine("AUTHORITY_TORN_CLAIM_FAIL_CLOSED PASS");
            Console.WriteLine("AUTHORITY_IPC_STRICT_SCHEMA PASS");
            Console.WriteLine("AUTHORITY_STORE_ACL_CONTRACT PASS");
            Console.WriteLine("REQUESTER_WRITE_DATA_DENIED PASS");
            Console.WriteLine("REQUESTER_APPEND_DATA_DENIED PASS");
            Console.WriteLine("REQUESTER_DELETE_DENIED PASS");
            Console.WriteLine("REQUESTER_DELETE_CHILD_DENIED PASS");
            Console.WriteLine("REQUESTER_CHANGE_PERMISSIONS_DENIED PASS");
            Console.WriteLine("REQUESTER_TAKE_OWNERSHIP_DENIED PASS");
            Console.WriteLine("REQUESTER_PARENT_DELETE_CHILD_DENIED PASS");
            Console.WriteLine("CANONICAL_PLAN_TORN_WRITE_FAIL_CLOSED PASS");
            Console.WriteLine("PIPE_USES_OS_CLIENT_IDENTITY PASS");
            Console.WriteLine("PIPE_PAYLOAD_IDENTITY_IGNORED PASS");
            Console.WriteLine("UNAPPROVED_PIPE_CLIENT_BLOCKED PASS");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateRequestJson(string operation)
    {
        var current = new string('d', 32);
        var proposal = new JsonObject
        {
            ["candidateGenerationId"] = new string('c', 32),
            ["currentGoodGenerationId"] = current,
            ["previousGoodGenerationId"] = null,
            ["repositoryRevision"] = new string('e', 40),
            ["apiImageId"] = "sha256:" + new string('1', 64),
            ["workerImageId"] = "sha256:" + new string('2', 64),
            ["requiredOverlays"] = new JsonArray("core", "sensitive-env", "github"),
            ["rollback"] = new JsonObject
            {
                ["TargetGenerationId"] = current,
                ["ApiImageId"] = "sha256:" + new string('3', 64),
                ["WorkerImageId"] = "sha256:" + new string('4', 64),
                ["ExpectedRuntimeMode"] = "file",
                ["ExpectedHealthEndpoints"] = new JsonArray("/health", "/ready", "/healthz", "/readyz"),
                ["NonTargetContainerIds"] = new JsonObject
                {
                    ["autoops-grafana"] = new string('a', 64), ["autoops-nginx"] = new string('b', 64),
                    ["autoops-postgres"] = new string('c', 64), ["autoops-prometheus"] = new string('d', 64),
                    ["autoops-redis"] = new string('e', 64), ["autoops-web"] = new string('f', 64)
                },
                ["VolumeInventory"] = new JsonArray("synthetic-volume")
            }
        };
        return new JsonObject { ["operation"] = "CreateCanonicalPlan", ["operationId"] = operation, ["planProposal"] = proposal }.ToJsonString();
    }

    private static void Assert(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException(name);
    }

    private static void AssertThrows(Action action, string name)
    {
        try { action(); } catch (AuthorityException) { return; }
        throw new InvalidOperationException(name);
    }
}
