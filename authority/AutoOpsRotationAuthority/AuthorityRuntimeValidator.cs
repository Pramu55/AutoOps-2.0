using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Runtime acceptance remains the maintained PowerShell contract.  The service
// launches only the protected script payload installed beside its executable;
// callers cannot select a script, executable, environment, plan path, or
// target root.  A non-zero validator result is deliberately indistinguishable
// from any other failed acceptance gate to the IPC client.
internal sealed class AuthorityRuntimeValidator(AuthoritySettings settings, string storeRoot) : IRuntimeValidator
{
    private readonly string _secretRoot = settings.SecretRoot;
    private readonly string _planRoot = Path.Combine(storeRoot, "plans");
    private readonly AuthorityInstalledPayloadSet _payloads = AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
        "scripts", "validate-secret-rotation-runtime.ps1", RuntimePayloadContract(), settings.RequesterSid);
    private readonly string _dockerConfigRoot = Path.GetFullPath(settings.DockerCliConfigDirectory);
    private readonly string _requesterSid = settings.RequesterSid;

    public bool ValidateRollbackBaseline(CanonicalPlan plan, CancellationToken cancellationToken) => Validate(plan, "Rollback", cancellationToken);
    public bool ValidateCandidateAcceptance(CanonicalPlan plan, CancellationToken cancellationToken) => Validate(plan, "Candidate", cancellationToken);

    private bool Validate(CanonicalPlan plan, string mode, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            AuthorityPathSecurity.AssertTrustedDirectoryTree(_dockerConfigRoot, _requesterSid);
            cancellationToken.ThrowIfCancellationRequested();
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority(cancellationToken);
            var powershell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
            var planPath = Path.Combine(_planRoot, plan.OperationId + ".json");
            if (!File.Exists(planPath) || (File.GetAttributes(planPath) & FileAttributes.ReparsePoint) != 0) return false;
            var psi = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(_payloads.EntryPoint)!
            };
            psi.Environment.Clear();
            var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var system = Environment.SystemDirectory;
            if (string.IsNullOrWhiteSpace(windows) || string.IsNullOrWhiteSpace(system)) return false;
            psi.Environment["SystemRoot"] = windows;
            psi.Environment["WINDIR"] = windows;
            psi.Environment["ComSpec"] = Path.Combine(system, "cmd.exe");
            psi.Environment["TEMP"] = Path.GetTempPath();
            psi.Environment["TMP"] = Path.GetTempPath();
            psi.Environment["AUTOOPS_AUTHORITY_DOCKER_ENDPOINT"] = dockerProxy.Endpoint;
            psi.ArgumentList.Add("-NoProfile");
            psi.ArgumentList.Add("-ExecutionPolicy");
            psi.ArgumentList.Add("Bypass");
            psi.ArgumentList.Add("-File");
            psi.ArgumentList.Add(_payloads.EntryPoint);
            psi.ArgumentList.Add("-TargetRoot");
            psi.ArgumentList.Add(_secretRoot);
            psi.ArgumentList.Add("-OperationId");
            psi.ArgumentList.Add(plan.OperationId);
            psi.ArgumentList.Add("-Mode");
            psi.ArgumentList.Add(mode);
            psi.ArgumentList.Add("-AuthorityPlanPath");
            psi.ArgumentList.Add(planPath);
            return AuthorityProcessRunner.Run(psi, cancellationToken, () =>
            {
                AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
                    "scripts", "validate-secret-rotation-runtime.ps1", RuntimePayloadContract(), _requesterSid);
                var currentPowerShell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
                if (!string.Equals(currentPowerShell, powershell, StringComparison.OrdinalIgnoreCase))
                    throw new AuthorityException("AUTHORITY_POWERSHELL_IDENTITY_CHANGED");
            }).ExitCode == 0;
        }
        catch (OperationCanceledException) { throw; }
        catch { return false; }
    }

    private static IReadOnlyDictionary<string, IReadOnlyCollection<string>> RuntimePayloadContract() =>
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["validate-secret-rotation-runtime.ps1"] = new[] { "secret-rotation-common.ps1" },
            ["secret-rotation-common.ps1"] = Array.Empty<string>()
        };

}
