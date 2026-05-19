import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Cloud,
  Container,
  GitMerge,
  Hammer,
  Layers,
  Search,
  ShieldCheck,
} from 'lucide-react';

const services = [
  { title: 'Operations Hub', href: '/dashboard/operations', description: 'Health, approvals, incidents, activity', icon: Activity, accent: 'text-blue-700' },
  { title: 'Projects', href: '/dashboard/projects', description: 'Service and repository inventory', icon: Layers, accent: 'text-amber-600' },
  { title: 'Deployments', href: '/dashboard/deployments', description: 'Release records and worker status', icon: GitMerge, accent: 'text-blue-700' },
  { title: 'Jenkins', href: '/dashboard/integrations/jenkins', description: 'Governed build triggers', icon: Hammer, accent: 'text-amber-600' },
  { title: 'Docker', href: '/dashboard/integrations/docker', description: 'Container inventory and safe controls', icon: Container, accent: 'text-blue-700' },
  { title: 'Kubernetes', href: '/dashboard/integrations/kubernetes', description: 'Workloads, pods, services, rollout controls', icon: Boxes, accent: 'text-amber-600' },
];

const pillars = [
  'Real operation status monitoring',
  'RBAC approval separation',
  'Worker-backed execution',
  'Incident runbooks',
  'Safe recovery paths',
  'No fake metrics or secrets',
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('refresh_token');

  return (
    <main className="min-h-screen bg-white text-[#16191f]">
      <div className="bg-[#232f3e] text-white">
        <div className="mx-auto flex h-11 max-w-[1700px] items-center justify-end gap-8 px-6 text-sm font-semibold">
          <span>Local runtime</span>
          <span>Support</span>
          <span>My account</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70">AO</span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-[#d5dbdb] bg-white">
        <div className="mx-auto flex h-[86px] max-w-[1700px] items-center gap-9 px-6">
          <Link href="/" className="flex items-end gap-2 text-4xl font-bold tracking-tight text-[#111827]">
            <span>autoops</span>
            <span className="mb-2 h-1.5 w-12 rounded-full bg-[#ff9900]" />
          </Link>
          <nav className="hidden items-center gap-8 text-base font-semibold text-[#16191f] lg:flex">
            <a href="#services" className="hover:text-[#0972d3]">Services</a>
            <a href="#solutions" className="hover:text-[#0972d3]">Solutions</a>
            <a href="#governance" className="hover:text-[#0972d3]">Governance</a>
            <a href="#resources" className="hover:text-[#0972d3]">Resources</a>
          </nav>
          <div className="ml-auto hidden items-center gap-8 text-base font-semibold lg:flex">
            <button className="inline-flex items-center gap-2 text-[#16191f]"><Search className="h-5 w-5" /> Search</button>
            <Link href="/login" className="text-[#16191f] hover:text-[#0972d3]">Sign in to console</Link>
            <Link href="/register" className="rounded-full bg-[#16191f] px-8 py-4 text-white hover:bg-[#31465f]">Create account</Link>
          </div>
        </div>
      </header>

      <section className="bg-[linear-gradient(120deg,#f7fff0_0%,#d9ffd9_36%,#f7fbff_72%,#ffffff_100%)]">
        <div className="mx-auto max-w-[1650px] px-6 py-7">
          <div className="rounded-2xl border border-[#d5dbdb] bg-white px-10 py-7 shadow-[0_4px_20px_rgba(22,25,31,0.08)]">
            <nav className="flex flex-wrap items-center gap-x-12 gap-y-4 text-lg font-semibold text-[#232f3e]">
              <span>AutoOps Console</span>
              <a href="#overview" className="hover:text-[#0972d3]">Overview</a>
              <a href="#services" className="hover:text-[#0972d3]">Service categories</a>
              <a href="#governance" className="hover:text-[#0972d3]">Governed operations</a>
              <a href="#resources" className="hover:text-[#0972d3]">Runbooks</a>
            </nav>
          </div>

          <div id="overview" className="px-0 py-20 lg:px-16">
            <p className="text-lg font-semibold text-[#0972d3]">AutoOps</p>
            <h1 className="mt-8 max-w-4xl text-6xl font-bold leading-tight tracking-tight text-[#16191f] lg:text-7xl">
              Operate DevOps control workflows from one clean console.
            </h1>
            <p className="mt-7 max-w-4xl text-2xl leading-10 text-[#232f3e]">
              Discover services, observe health, approve risky actions, respond to incidents, and recover failed operations with real backend data and safe controls.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href={isAuthenticated ? '/dashboard' : '/login'} className="rounded-full bg-[#16191f] px-9 py-4 text-lg font-bold text-white hover:bg-[#31465f]">
                {isAuthenticated ? 'Open console' : 'Sign in to console'}
              </Link>
              <Link href="/register" className="rounded-full border-2 border-[#16191f] bg-white px-9 py-4 text-lg font-bold text-[#16191f] hover:bg-[#f2f3f3]">
                Create account
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="bg-white py-16">
        <div className="mx-auto max-w-[1500px] px-6">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-[#0972d3]">Console services</p>
              <h2 className="mt-2 text-4xl font-bold text-[#16191f]">Find every AutoOps module quickly</h2>
            </div>
            <Link href="/login" className="text-base font-bold text-[#0972d3] hover:underline">View all services</Link>
          </div>
          <div className="grid grid-cols-1 overflow-hidden rounded border border-[#d5dbdb] md:grid-cols-2 xl:grid-cols-3">
            {services.map(({ title, href, description, icon: Icon, accent }) => (
              <Link key={title} href={isAuthenticated ? href : '/login'} className="group border-b border-r border-[#eaeded] bg-white p-6 transition hover:bg-[#f2f8fd]">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded bg-[#f1f3f3]">
                    <Icon className={`h-5 w-5 ${accent}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0972d3] group-hover:underline">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#5f6b7a]">{description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="governance" className="bg-[#f7f8f8] py-16">
        <div className="mx-auto max-w-[1500px] px-6">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-[#ff9900]">Governance built in</p>
              <h2 className="mt-3 text-4xl font-bold text-[#16191f]">Clear actions, fewer boxes, safer decisions.</h2>
              <p className="mt-5 text-lg leading-8 text-[#414d5c]">
                AutoOps keeps the console focused on what an operator needs next: status, action required, recent failures, incidents, and approved recovery.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-[#d5dbdb] bg-[#d5dbdb] md:grid-cols-2">
              {pillars.map((item) => (
                <div key={item} className="flex items-center gap-3 bg-white p-5">
                  <CheckCircle2 className="h-5 w-5 text-[#037f0c]" />
                  <span className="font-semibold text-[#232f3e]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="resources" className="bg-white py-16">
        <div className="mx-auto max-w-[1500px] px-6">
          <div className="rounded-2xl bg-[#16191f] p-8 text-white lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
              <div>
                <Cloud className="h-9 w-9 text-[#ff9900]" />
                <h2 className="mt-6 text-4xl font-bold">Company-grade operations without fake control.</h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  The console shows only real resources, real health, real incidents, and governed actions. No demo-only execution path, no secret exposure, and no unsafe shell controls.
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/10 p-6">
                <ShieldCheck className="h-8 w-8 text-[#7dceff]" />
                <p className="mt-4 text-xl font-bold">Ready for controlled pilot workflows</p>
                <Link href="/login" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#ff9900] px-6 py-3 font-bold text-[#16191f] hover:bg-[#ffb84d]">
                  Start local demo <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
