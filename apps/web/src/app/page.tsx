import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  Activity,
  ArrowRight,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Database,
  GitMerge,
  Layers,
  Network,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';

const productAreas = [
  {
    title: 'Project Operations',
    description: 'Model deployable services, repositories, ownership, and operational metadata.',
    icon: Boxes,
  },
  {
    title: 'Environment Management',
    description: 'Define development, staging, production, preview, and custom deployment targets.',
    icon: Layers,
  },
  {
    title: 'Deployment Orchestration',
    description: 'Create deployment records, emit lifecycle events, and route execution through workers.',
    icon: GitMerge,
  },
  {
    title: 'Worker and Queue Runtime',
    description: 'Coordinate background execution with Redis-backed BullMQ workers and safe retries.',
    icon: RadioTower,
  },
  {
    title: 'Observability and Health',
    description: 'Track readiness surfaces, events, runtime state, and future metrics integrations.',
    icon: Activity,
  },
  {
    title: 'Future Cloud Control',
    description: 'Architecture prepared for Docker, Terraform, Kubernetes, and provider workflows.',
    icon: Cloud,
  },
];

const workflowSteps = [
  'Connect project',
  'Define environment',
  'Trigger deployment',
  'Worker runs simulation',
  'Timeline records events',
  'Observe health',
];

const features = [
  'Multi-tenant platform foundation',
  'Strict deployment lifecycle',
  'BullMQ worker orchestration',
  'PostgreSQL and Prisma persistence',
  'Redis-backed queue runtime',
  'Safe simulation executor now',
  'Future Docker executor path',
  'Terraform and Kubernetes-ready architecture',
];

const platformPreviewCards = [
  { title: 'Project inventory', description: 'Real CRUD-backed records', icon: Boxes },
  { title: 'Environment targets', description: 'Project-scoped deploy targets', icon: Network },
  { title: 'Deployment timeline', description: 'Queued, enqueued, started, simulated', icon: Workflow },
  { title: 'Runtime readiness', description: 'API, worker, Redis, Postgres surfaces', icon: Database },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('refresh_token');

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
              <Zap className="h-5 w-5 text-cyan-300" />
            </div>
            <span className="text-base font-semibold tracking-tight">AutoOps</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            {['Product', 'Solutions', 'Platform', 'Pricing', 'Docs'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="transition hover:text-slate-950">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-md px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 sm:inline-flex"
            >
              Login
            </Link>
            <Link
              href={isAuthenticated ? '/dashboard' : '/login'}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:scale-[1.01] hover:shadow-blue-600/30"
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.16),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(124,58,237,0.18),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 items-center gap-12 px-5 py-16 lg:grid-cols-[1fr_0.92fr] lg:px-8">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Sparkles className="h-4 w-4" />
              AI-native DevOps control plane
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Operate projects, environments, and deployments from one control plane.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              AutoOps helps modern teams manage deployment workflows, queue-backed workers,
              simulation execution, and operational timelines without pretending unfinished
              infrastructure integrations are live.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={isAuthenticated ? '/dashboard' : '/login'}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-gradient-to-r from-blue-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-xl shadow-blue-700/20 transition hover:scale-[1.01]"
              >
                {isAuthenticated ? 'Open Dashboard' : 'Get Started'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                View Demo / Login
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-violet-500/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-medium text-slate-400">AutoOps Control Plane</span>
              </div>
              <div className="grid gap-4 p-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-cyan-300">Deployment</p>
                      <p className="mt-2 text-lg font-semibold text-white">payments-api to staging</p>
                    </div>
                    <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                      SUCCEEDED
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-5 gap-2">
                    {['Queued', 'Enqueued', 'Started', 'Simulated', 'Succeeded'].map((item) => (
                      <div key={item} className="rounded-lg bg-gradient-to-b from-white/10 to-white/[0.03] p-3">
                        <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                        <p className="mt-3 text-xs font-medium text-slate-300">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['Projects', 'Real API'],
                    ['Queues', 'BullMQ'],
                    ['Events', 'Timeline'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Product Surface</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              A control plane for the parts of DevOps teams operate every day.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {productAreas.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="group rounded-xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/[0.07]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/25 to-violet-500/25 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Platform Preview</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Designed for real read models, honest empty states, and future execution depth.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-600">
                The authenticated app already reads real projects, environments, deployments,
                deployment events, and simulation executor outcomes where APIs exist.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {platformPreviewCards.map(({ title, description, icon: Icon }) => (
                <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                  <Icon className="h-5 w-5 text-blue-700" />
                  <h3 className="mt-4 text-sm font-semibold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="solutions" className="bg-slate-100 py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">How AutoOps Works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              From project metadata to deployment timeline in one operational flow.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <div key={step} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="mt-5 text-sm font-semibold text-slate-950">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="docs" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Architecture</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Built for the execution layers that come next.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-slate-700">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 px-5 py-20 text-white lg:px-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-white/[0.04] to-violet-600/20 p-8 text-center shadow-2xl">
          <BrainCircuit className="mx-auto h-10 w-10 text-cyan-300" />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">Start operating with AutoOps</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Use the authenticated control plane to manage real projects, environments, deployments,
            simulation events, and readiness surfaces.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="inline-flex h-11 items-center rounded-md bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
              Login
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-md border border-white/15 px-5 text-sm font-semibold text-white transition hover:bg-white/10">
              Get Started
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-10 text-sm text-slate-600 md:grid-cols-4 lg:px-8">
          {['Product', 'Platform', 'Resources', 'Company'].map((group) => (
            <div key={group}>
              <p className="font-semibold text-slate-950">{group}</p>
              <div className="mt-3 space-y-2">
                {['Overview', 'Docs', 'Security'].map((item) => (
                  <a key={item} href="#" className="block transition hover:text-slate-950">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
