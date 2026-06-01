import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  Activity, ArrowRight, Boxes, CheckCircle2, Cloud, Container, GitMerge, Hammer, Layers, Search, ShieldCheck,
  AlertTriangle, Server, Github, Anchor
} from 'lucide-react';

const capabilities = [
  { title: 'Incident Workspace', description: 'Tenant-scoped failure records and event timelines.', icon: AlertTriangle, accent: 'text-red-600' },
  { title: 'Recommended Remediation', description: 'Deterministic suggestions derived from incident evidence.', icon: Search, accent: 'text-[#ff9900]' },
  { title: 'Governed Operation Preparation', description: 'Safe mapping of recommendations to the approval pipeline.', icon: ShieldCheck, accent: 'text-emerald-600' },
  { title: 'Operations Hub', description: 'Centralized command center for queues, failures, and approvals.', icon: Activity, accent: 'text-[#0972d3]' },
  { title: 'Governance Center', description: 'Immutable, audit-ready evidence log of all operations.', icon: CheckCircle2, accent: 'text-purple-600' },
  { title: 'Resource Graph', description: 'Database-backed read-only topology mapping.', icon: Layers, accent: 'text-teal-600' },
  { title: 'Provider Integrations', description: 'Connectors for Kubernetes, Docker, AWS, and Jenkins.', icon: Server, accent: 'text-[#16191f]' },
  { title: 'Deployments', description: 'Tenant-isolated structures defining deployment lifecycles.', icon: GitMerge, accent: 'text-blue-500' },
];

const integrations = [
  { title: 'Docker', icon: Container },
  { title: 'Kubernetes', icon: Boxes },
  { title: 'Jenkins', icon: Hammer },
  { title: 'GitHub Actions', icon: Github },
  { title: 'AWS', icon: Cloud },
  { title: 'Prometheus / Grafana', icon: Activity },
  { title: 'Argo CD / GitOps', icon: Anchor },
];

const safetyPoints = [
  'Confirmation tokens',
  'Approval workflow',
  'Worker queue execution',
  'Audit evidence',
  'Tenant isolation',
  'No autonomous remediation',
  'No fake provider data',
];

const demoSteps = [
  'Login',
  'Open Command Workspace',
  'Review Operations Hub',
  'Open Incidents',
  'Open incident detail',
  'Review Recommended Remediation',
  'Review Governance Center',
  'Inspect Docker/Kubernetes/Jenkins integrations',
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('refresh_token');

  return (
    <main className="min-h-screen bg-white text-[#16191f] font-sans">
      
      {/* 1. Header */}
      <header className="sticky top-0 z-40 border-b border-[#d5dbdb] bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-6">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex flex-col items-start gap-0">
              <span className="text-3xl font-extrabold tracking-tight text-[#16191f] leading-none">autoops</span>
              <span className="h-1 w-12 rounded-full bg-[#ff9900] mt-0.5" />
            </Link>
            <nav className="hidden items-center gap-8 text-[15px] font-semibold text-[#16191f] lg:flex">
              <Link href="#services" className="hover:text-[#0972d3]">Services</Link>
              <Link href="#solutions" className="hover:text-[#0972d3]">Solutions</Link>
              <Link href="#governance" className="hover:text-[#0972d3]">Governance</Link>
              <Link href="#resources" className="hover:text-[#0972d3]">Resources</Link>
            </nav>
          </div>
          <div className="flex items-center gap-6 text-[15px] font-semibold">
            <button className="hidden sm:flex items-center gap-2 text-[#16191f] hover:text-[#0972d3]">
              <Search className="h-[18px] w-[18px]" /> Search
            </button>
            <Link href={isAuthenticated ? "/dashboard" : "/login"} className="hidden sm:block text-[#16191f] hover:text-[#0972d3]">
              Sign in to console
            </Link>
            <Link href="/register" className="rounded-full bg-[#16191f] px-6 py-2.5 text-white hover:bg-[#232f3e] transition-colors">
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with secondary nav */}
      <section className="bg-[linear-gradient(120deg,#f7fff0_0%,#d9ffd9_36%,#f7fbff_72%,#ffffff_100%)] pb-24">
        <div className="mx-auto max-w-[1600px] px-6 pt-6">
          
          {/* 2. Secondary navigation bar */}
          <div className="mb-16 rounded-xl border border-[#d5dbdb] bg-white px-8 py-5 shadow-sm overflow-x-auto whitespace-nowrap">
            <nav className="flex items-center gap-10 text-[16px] font-bold text-[#16191f]">
              <span className="text-[#0972d3]">AutoOps Console</span>
              <Link href="#overview" className="hover:text-[#0972d3] font-semibold">Overview</Link>
              <Link href="#services" className="hover:text-[#0972d3] font-semibold">Service categories</Link>
              <Link href="#governance" className="hover:text-[#0972d3] font-semibold">Governed operations</Link>
              <Link href="#resources" className="hover:text-[#0972d3] font-semibold">Runbooks</Link>
            </nav>
          </div>

          {/* 3. Hero section content */}
          <div id="overview" className="max-w-[900px] py-10">
            <p className="text-[15px] font-bold tracking-wide text-[#0972d3] uppercase mb-4">AutoOps</p>
            <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.15] tracking-tight text-[#16191f]">
              Operate DevOps control workflows from one clean console.
            </h1>
            <p className="mt-6 text-xl sm:text-2xl leading-[1.6] text-[#232f3e] max-w-3xl">
              Discover services, observe health, approve risky actions, respond to incidents, and recover failed operations with real backend data and safe controls.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href={isAuthenticated ? '/dashboard' : '/login'} className="rounded-full bg-[#ff9900] px-8 py-4 text-[17px] font-bold text-[#16191f] hover:bg-[#ffb84d] transition-colors flex items-center gap-2">
                Open Demo Console <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="https://github.com/Pramu55/AutoOps-2.0" target="_blank" className="rounded-full border-2 border-[#16191f] bg-transparent px-8 py-4 text-[17px] font-bold text-[#16191f] hover:bg-[#16191f] hover:text-white transition-colors flex items-center gap-2">
                <Github className="h-5 w-5" /> View GitHub
              </Link>
              <Link href="/dashboard" className="rounded-full bg-white border border-[#d5dbdb] px-8 py-4 text-[17px] font-bold text-[#16191f] hover:bg-slate-50 transition-colors">
                View Documentation
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Service cards section */}
      <section id="services" className="bg-white py-24 border-y border-[#d5dbdb]">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-[#16191f]">Explore Platform Services</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map(({ title, description, icon: Icon, accent }) => (
              <div key={title} className="group relative rounded-lg border border-[#eaeded] bg-white p-6 shadow-sm hover:shadow-md hover:border-[#0972d3] transition-all cursor-pointer flex flex-col">
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded bg-[#f2f8fd] ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-[#0972d3] group-hover:underline mb-2">{title}</h3>
                <p className="text-[15px] text-[#5f6b7a] leading-relaxed flex-grow">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Provider integrations section */}
      <section className="bg-[#f8f9fa] py-24">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-[#16191f]">Provider Integrations</h2>
            <p className="mt-4 text-[17px] text-[#5f6b7a]">Connect to your existing toolchain.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {integrations.map(({ title, icon: Icon }) => (
              <div key={title} className="flex items-center gap-3 rounded-lg border border-[#eaeded] bg-white px-6 py-4 shadow-sm hover:border-[#0972d3] transition-colors cursor-pointer">
                <Icon className="h-5 w-5 text-[#232f3e]" />
                <span className="font-bold text-[#16191f]">{title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Governance section */}
      <section id="governance" className="bg-white py-24 border-y border-[#d5dbdb]">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <p className="text-[15px] font-bold tracking-wide text-[#ff9900] uppercase mb-3">Governance Built In</p>
              <h2 className="text-4xl font-extrabold text-[#16191f] leading-tight">
                Clear actions, fewer boxes, safer decisions.
              </h2>
              <p className="mt-6 text-[18px] leading-relaxed text-[#232f3e]">
                AutoOps keeps the console focused on what an operator needs next: status, action required, recent failures, incidents, approvals, and audited recovery.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {safetyPoints.map((point) => (
                <div key={point} className="flex items-center gap-3 rounded border border-[#eaeded] bg-white p-4 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-[#037f0c] shrink-0" />
                  <span className="font-semibold text-[#16191f]">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Demo walkthrough section */}
      <section id="solutions" className="bg-[#232f3e] py-24 text-white">
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold">Evaluator Demo Path</h2>
            <p className="mt-4 text-[17px] text-[#eaeded]">Follow these steps to evaluate the core mechanics of the platform.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {demoSteps.map((step, idx) => (
              <div key={step} className="relative rounded-lg border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors">
                <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#ff9900] text-sm font-bold text-[#16191f]">
                  {idx + 1}
                </div>
                <div className="font-semibold text-[15px] text-[#eaeded]">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="bg-white py-12 border-t border-[#d5dbdb]">
        <div className="mx-auto max-w-[1600px] px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[#16191f]">AutoOps</span>
              <span className="rounded bg-[#f2f8fd] px-2 py-0.5 text-[12px] font-bold text-[#0972d3]">v1.4.1</span>
            </div>
            <span className="text-[14px] text-[#5f6b7a]">Final platform release</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-[14px] font-medium text-[#5f6b7a]">
            <span>No secrets</span>
            <span className="hidden md:inline text-[#d5dbdb]">|</span>
            <span>No fake data</span>
            <span className="hidden md:inline text-[#d5dbdb]">|</span>
            <span>No autonomous remediation</span>
          </div>
          <Link href="https://github.com/Pramu55/AutoOps-2.0" target="_blank" className="flex items-center gap-2 text-[14px] font-bold text-[#16191f] hover:text-[#0972d3] transition-colors">
            <Github className="h-5 w-5" /> GitHub Repository
          </Link>
        </div>
      </footer>
    </main>
  );
}
