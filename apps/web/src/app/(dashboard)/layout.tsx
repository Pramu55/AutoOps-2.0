import { ConsoleSidebar, Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen ao-console-surface text-slate-900">
      <Topbar />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <ConsoleSidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
