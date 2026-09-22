using System.ComponentModel;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;

namespace AutoOpsRotationAuthority;

// Docker's public pipe name is not an identity.  The authority creates a
// private, service-only proxy and authenticates the real backend for every
// proxied connection before forwarding any Engine API bytes.
internal sealed class AuthenticatedDockerPipeProxy : IDisposable
{
    private const string DockerDesktopPipe = "dockerDesktopLinuxEngine";
    private readonly string _pipeName = "AutoOpsRotationAuthorityDocker-" + Guid.NewGuid().ToString("N");
    private readonly CancellationTokenSource _stopping;
    private readonly Task _acceptLoop;
    private readonly object _forwarderLock = new();
    private readonly List<Task> _forwarders = [];

    private AuthenticatedDockerPipeProxy(CancellationToken requestCancellationToken, bool startListener = true)
    {
        requestCancellationToken.ThrowIfCancellationRequested();
        _stopping = CancellationTokenSource.CreateLinkedTokenSource(requestCancellationToken);
        if (startListener)
        {
            var first = CreateListener(firstInstance: true);
            _acceptLoop = Task.Run(() => AcceptLoopAsync(first));
        }
        else
        {
            _acceptLoop = Task.CompletedTask;
        }
    }

    internal string Endpoint => "npipe:////./pipe/" + _pipeName;

    internal static AuthenticatedDockerPipeProxy StartForAuthority(CancellationToken requestCancellationToken) => new(requestCancellationToken);

    private NamedPipeServerStream CreateListener(bool firstInstance)
    {
        var current = WindowsIdentity.GetCurrent().User ?? throw new AuthorityException("AUTHORITY_DOCKER_PROXY_IDENTITY_UNAVAILABLE");
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(new PipeAccessRule(current, PipeAccessRights.ReadWrite, AccessControlType.Allow));
        return NamedPipeServerStreamAcl.Create(
            _pipeName,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | (firstInstance ? PipeOptions.FirstPipeInstance : PipeOptions.None),
            0,
            0,
            security);
    }

    private async Task AcceptLoopAsync(NamedPipeServerStream listener)
    {
        try
        {
            while (!_stopping.IsCancellationRequested)
            {
                await listener.WaitForConnectionAsync(_stopping.Token).ConfigureAwait(false);
                TrackForwarder(ForwardAsync(listener, _stopping.Token));
                listener = CreateListener(firstInstance: false);
            }
        }
        catch (OperationCanceledException) { listener.Dispose(); }
        catch { listener.Dispose(); }
    }

    private void TrackForwarder(Task forwarder)
    {
        lock (_forwarderLock) _forwarders.Add(forwarder);
        _ = forwarder.ContinueWith(
            completed =>
            {
                lock (_forwarderLock) _forwarders.Remove(completed);
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    internal static bool TrackedForwarderStopsWithRequestForSelfTest()
    {
        using var requestCancellation = new CancellationTokenSource();
        var proxy = new AuthenticatedDockerPipeProxy(requestCancellation.Token, startListener: false);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var forwarder = Task.Run(async () =>
        {
            entered.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, proxy._stopping.Token).ConfigureAwait(false);
        });
        proxy.TrackForwarder(forwarder);
        if (!entered.Task.Wait(TimeSpan.FromSeconds(5)))
        {
            proxy.Dispose();
            return false;
        }

        requestCancellation.Cancel();
        proxy.Dispose();
        return forwarder.IsCompleted;
    }

    private static async Task ForwardAsync(NamedPipeServerStream client, CancellationToken cancellationToken)
    {
        using (client)
        using (var backend = new NamedPipeClientStream(".", DockerDesktopPipe, PipeDirection.InOut, PipeOptions.Asynchronous))
        {
            try
            {
                await backend.ConnectAsync(5000, cancellationToken).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                if (!DockerPipeServerAuthenticator.Authenticate(backend)) return;
                using var cancelled = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var upstream = client.CopyToAsync(backend, 81920, cancelled.Token);
                var downstream = backend.CopyToAsync(client, 81920, cancelled.Token);
                await Task.WhenAny(upstream, downstream).ConfigureAwait(false);
                cancelled.Cancel();
                try { await Task.WhenAll(upstream, downstream).ConfigureAwait(false); } catch (OperationCanceledException) { }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
            catch { }
        }
    }

    public void Dispose()
    {
        _stopping.Cancel();
        try { _acceptLoop.GetAwaiter().GetResult(); } catch { }
        Task[] forwarders;
        lock (_forwarderLock) forwarders = _forwarders.ToArray();
        try { Task.WhenAll(forwarders).GetAwaiter().GetResult(); } catch { }
        _stopping.Dispose();
    }
}

internal static class DockerPipeServerAuthenticator
{
    private const string ExpectedRelativePath = "Docker\\Docker\\resources\\com.docker.backend.exe";
    private static readonly Guid WinTrustActionGenericVerifyV2 = new("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");

    internal static bool Authenticate(NamedPipeClientStream pipe)
    {
        try
        {
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var processId) || processId == 0) return false;
            using var process = Process.GetProcessById((int)processId);
            var path = process.MainModule?.FileName;
            var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var expected = string.IsNullOrWhiteSpace(programFiles) ? null : Path.GetFullPath(Path.Combine(programFiles, ExpectedRelativePath));
            var regularTrustedPath = !string.IsNullOrWhiteSpace(path) && File.Exists(path) && !HasReparseComponent(path);
            return IsTrustedServerIdentityForTest(processId, path, expected, regularTrustedPath, VerifyDockerSignature(path));
        }
        catch { return false; }
    }

    // Synthetic coverage exercises every decision without a Docker Desktop host.
    internal static bool IsTrustedServerIdentityForTest(uint processId, string? imagePath, string? expectedPath, bool regularTrustedPath, bool signatureValid)
    {
        if (processId == 0 || string.IsNullOrWhiteSpace(imagePath) || string.IsNullOrWhiteSpace(expectedPath) || !regularTrustedPath || !signatureValid) return false;
        var actual = Path.GetFullPath(imagePath);
        return string.Equals(actual, Path.GetFullPath(expectedPath), StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasReparseComponent(string path)
    {
        var current = Path.GetFullPath(path);
        while (!string.IsNullOrWhiteSpace(current))
        {
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return true;
            var parent = Path.GetDirectoryName(current);
            if (string.Equals(parent, current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
        return false;
    }

    private static bool VerifyDockerSignature(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return false;
        try
        {
            using var certificate = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
            if (!certificate.Subject.Contains("CN=Docker Inc", StringComparison.OrdinalIgnoreCase) || !certificate.Verify()) return false;
            return WinVerifyTrustFile(path) == 0;
        }
        catch { return false; }
    }

    private static uint WinVerifyTrustFile(string path)
    {
        var file = new WinTrustFileInfo(path);
        var data = new WinTrustData(file);
        try { return WinVerifyTrust(IntPtr.Zero, WinTrustActionGenericVerifyV2, ref data); }
        finally { data.Dispose(); file.Dispose(); }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint serverProcessId);

    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = true)]
    private static extern uint WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid actionId, ref WinTrustData data);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class WinTrustFileInfo : IDisposable
    {
        internal int cbStruct = Marshal.SizeOf<WinTrustFileInfo>();
        internal IntPtr pcwszFilePath;
        internal IntPtr hFile = IntPtr.Zero;
        internal IntPtr pgKnownSubject = IntPtr.Zero;
        internal WinTrustFileInfo(string path) => pcwszFilePath = Marshal.StringToCoTaskMemUni(path);
        public void Dispose() { if (pcwszFilePath != IntPtr.Zero) Marshal.FreeCoTaskMem(pcwszFilePath); }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class WinTrustData : IDisposable
    {
        internal int cbStruct = Marshal.SizeOf<WinTrustData>();
        internal IntPtr pPolicyCallbackData = IntPtr.Zero;
        internal IntPtr pSIPClientData = IntPtr.Zero;
        internal uint dwUIChoice = 2;
        internal uint fdwRevocationChecks = 0;
        internal uint dwUnionChoice = 1;
        internal IntPtr pFile;
        internal uint dwStateAction = 0;
        internal IntPtr hWVTStateData = IntPtr.Zero;
        internal IntPtr pwszURLReference = IntPtr.Zero;
        internal uint dwProvFlags = 0x00000100;
        internal uint dwUIContext = 0;
        internal IntPtr pSignatureSettings = IntPtr.Zero;
        internal WinTrustData(WinTrustFileInfo file)
        {
            pFile = Marshal.AllocCoTaskMem(Marshal.SizeOf<WinTrustFileInfo>());
            Marshal.StructureToPtr(file, pFile, false);
        }
        public void Dispose() { if (pFile != IntPtr.Zero) Marshal.FreeCoTaskMem(pFile); }
    }
}
