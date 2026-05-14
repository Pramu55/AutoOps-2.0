import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_86%_7%,rgba(124,58,237,0.18),transparent_32%),radial-gradient(circle_at_48%_100%,rgba(16,185,129,0.08),transparent_34%),linear-gradient(180deg,#030712_0%,#08111f_45%,#020617_100%)]">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-55" />
      <div className="relative flex min-h-screen flex-col">
        <Topbar />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-5 lg:px-8 lg:py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
