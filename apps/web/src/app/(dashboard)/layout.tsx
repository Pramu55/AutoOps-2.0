import { ConsoleSidebar, PageContextBar, Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <Topbar />
      <div className="flex h-full pt-14">
        <ConsoleSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <PageContextBar />
          <div className="mx-auto w-full max-w-[1560px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
