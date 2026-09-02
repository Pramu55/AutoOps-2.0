using System.Runtime.InteropServices;

namespace AutoOpsRotationAuthority;

// A package-free SCM host. It is deliberately not run by tests; the service is
// installed only in the separately authorized provisioning phase.
internal static class WindowsServiceHost
{
    private const int ServiceWin32OwnProcess = 0x10;
    private const int ServiceStartPending = 0x2;
    private const int ServiceRunning = 0x4;
    private const int ServiceStopPending = 0x3;
    private const int ServiceStopped = 0x1;
    private const int ServiceAcceptStop = 0x1;
    private const int ServiceControlStop = 0x1;

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate void ServiceMainDelegate(uint argumentCount, IntPtr argumentValues);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int ServiceControlHandlerDelegate(int control, int eventType, IntPtr eventData, IntPtr context);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ServiceTableEntry
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string? ServiceName;
        public ServiceMainDelegate? ServiceMain;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatus
    {
        public int ServiceType;
        public int CurrentState;
        public int ControlsAccepted;
        public int Win32ExitCode;
        public int ServiceSpecificExitCode;
        public int CheckPoint;
        public int WaitHint;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool StartServiceCtrlDispatcher([In] ServiceTableEntry[] serviceTable);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr RegisterServiceCtrlHandlerEx(string serviceName, ServiceControlHandlerDelegate handler, IntPtr context);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SetServiceStatus(IntPtr statusHandle, ref ServiceStatus status);

    internal static int Run(string serviceName, Func<AuthorityStore> openStore, Func<AuthorityStore, CancellationToken, Task> runServer)
    {
        if (!OperatingSystem.IsWindows()) return 78;
        Exception? failure = null;
        var main = new ServiceMainDelegate((_, _) =>
        {
            using var cancellation = new CancellationTokenSource();
            var handler = new ServiceControlHandlerDelegate((control, _, _, _) =>
            {
                if (control == ServiceControlStop) cancellation.Cancel();
                return 0;
            });
            var handle = RegisterServiceCtrlHandlerEx(serviceName, handler, IntPtr.Zero);
            if (handle == IntPtr.Zero) { failure = new InvalidOperationException("ROTATION_AUTHORITY_SERVICE_HANDLER_FAILED"); return; }
            SetStatus(handle, ServiceStartPending, 0);
            try
            {
                var store = openStore();
                SetStatus(handle, ServiceRunning, ServiceAcceptStop);
                runServer(store, cancellation.Token).GetAwaiter().GetResult();
                SetStatus(handle, ServiceStopPending, 0);
                SetStatus(handle, ServiceStopped, 0);
            }
            catch (Exception error)
            {
                failure = error;
                SetStatus(handle, ServiceStopped, 0);
            }
        });
        var table = new[] { new ServiceTableEntry { ServiceName = serviceName, ServiceMain = main }, new ServiceTableEntry() };
        if (!StartServiceCtrlDispatcher(table)) return Marshal.GetLastWin32Error() == 1063 ? 1063 : 1;
        GC.KeepAlive(main);
        return failure is null ? 0 : 1;
    }

    private static void SetStatus(IntPtr handle, int state, int acceptedControls)
    {
        var status = new ServiceStatus { ServiceType = ServiceWin32OwnProcess, CurrentState = state, ControlsAccepted = acceptedControls, WaitHint = 10000 };
        _ = SetServiceStatus(handle, ref status);
    }
}
