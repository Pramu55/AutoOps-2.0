import Link from 'next/link';
import { cookies } from 'next/headers';
import {
  Activity, ArrowRight, Boxes, CheckCircle2, Cloud, Container, GitMerge, Hammer, Layers, ShieldCheck,
  AlertTriangle, FileText, BarChart, Server, Github, Anchor, Radio, Search
} from 'lucide-react';

const capabilities = [
  { title: 'Incident Workspace', href: '/dashboard/incidents', description: 'Tenant-scoped failure records and event timelines.', icon: AlertTriangle, accent: 'text-red-600' },
  { title: 'Recommended Remediation', href: '/dashboard/incidents', description: 'Deterministic suggestions derived from incident evidence.', icon: Search, accent: 'text-amber-600' },
  { title: 'Governed Operation Preparation', href: '/dashboard/operations', description: 'Safe mapping of recommendations to the approval pipeline.', icon: ShieldCheck, accent: 'text-emerald-600' },
  { title: 'Operations Hub', href: '/dashboard/operations', description: 'Centralized command center for queues, failures, and approvals.', icon: Activity, accent: 'text-blue-700' },
  { title: 'Governance Center', href: '/dashboard/governance', description: 'Immutable, audit-ready evidence log of all operations.', icon: FileText, accent: 'text-purple-600' },
  { title: 'Resource Graph', href: '/dashboard/resources', description: 'Database-backed read-only topology mapping.', icon: Layers, accent: 'text-teal-600' },
  { title: 'Signals', href: '/dashboard/signals', description: 'Real-time telemetry ingest and normalized observation streams.', icon: Radio, accent: 'text-indigo-600' },
  { title: 'Deployments', href: '/dashboard/deployments', description: 'Tenant-isolated structures defining deployment lifecycles.', icon: GitMerge, accent: 'text-blue-500' },
  { title: 'Provider Integrations', href: '/dashboard/integrations', description: 'Connectors for Kubernetes, Docker, AWS, and Jenkins.', icon: Server, accent: 'text-slate-700' },
];

const safetyPillars = [
  'Confirmation tokens',
  'Approval workflow',
  'Worker queue execution',
  'Audit evidence',
  'Tenant isolation',
  'No autonomous remediation',
  'No fake provider data',
];

const integrations = [
  { title: 'Docker', icon: Container },
  { title: 'Kubernetes', icon: Boxes },
  { title: 'Jenkins', icon: Hammer },
  { title: 'GitHub Actions', icon: Github },
  { title: 'AWS', icon: Cloud },
  { title: 'Prometheus/Grafana', icon: BarChart },
  { title: 'Argo CD / GitOps', icon: Anchor },
];

const demoSteps = [
  'Login',
  'Open Command Workspace',
  'Review Operations Hub',
  'Open Incidents',
  'Open incident detail',
  'Review Recommended Remediation',
  'Check Governance Center',
  'Review provider pages',
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('refresh_token');

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-end gap-2 text-3xl font-bold tracking-tight text-slate-900">
            <span>autoops</span>
            <span className="mb-2 h-1.5 w-12 rounded-full bg-blue-600" />
          </Link>
          <div className="flex items-center gap-6 text-sm font-semibold">
            <Link href="https://github.com/Pramu55/AutoOps-2.0" target="_blank" className="text-slate-600 hover:text-blue-600">GitHub</Link>
            <Link href={isAuthenticated ? '/dashboard' : '/login'} className="rounded-full bg-slate-900 px-6 py-2.5 text-white hover:bg-slate-800 transition-colors">
              {isAuthenticated ? 'Go to Console' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white pt-24 pb-32">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 mb-8 ring-1 ring-inset ring-blue-700/10">
            <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
            AutoOps v1.4.0 — Governed DevOps Control Plane
          </div>
          <h1 className="mx-auto max-w-5xl text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl">
            Govern your operations with confidence.
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-xl leading-8 text-slate-600">
            Unify incidents, provider integrations, remediation recommendations, approvals, audit evidence, and worker-based operations across Docker, Kubernetes, Jenkins, GitHub Actions, AWS, and observability tooling.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="flex items-center justify-center rounded-full bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 w-full sm:w-auto transition-colors">
              Open Demo Console <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link href="https://github.com/Pramu55/AutoOps-2.0" target="_blank" className="flex items-center justify-center rounded-full bg-white px-8 py-4 text-lg font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 w-full sm:w-auto transition-all">
              View GitHub <Github className="ml-2 h-5 w-5" />
            </Link>
            <Link href="/dashboard" className="flex items-center justify-center rounded-full bg-slate-100 px-8 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-200 w-full sm:w-auto transition-colors">
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Platform capability cards */}
      <section className="bg-slate-50 py-24 border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Platform Capabilities</h2>
            <p className="mt-4 text-lg text-slate-600">Enterprise-grade tooling built directly into the control plane.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map(({ title, href, description, icon: Icon, accent }) => (
              <Link key={title} href={isAuthenticated ? href : '/login'} className="group relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 mb-6 group-hover:bg-blue-50 transition-colors">
                  <Icon className={`h-6 w-6 ${accent}`} />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{title}</h3>
                <p className="text-slate-600 leading-relaxed">{description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Safety model & Provider integrations */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Safety Model */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Safety Model</h2>
              </div>
              <p className="text-lg text-slate-600 mb-8">
                Designed to prioritize safety above all else. AutoOps ensures operations are explicitly authorized, never executing destructive changes autonomously.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {safetyPillars.map((item) => (
                  <div key={item} className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span className="font-medium text-slate-800">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Provider Integrations */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Server className="h-8 w-8 text-blue-600" />
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Provider Integrations</h2>
              </div>
              <p className="text-lg text-slate-600 mb-8">
                Connect natively to your existing infrastructure tooling to fetch state and execute governed actions safely.
              </p>
              <div className="flex flex-wrap gap-4">
                {integrations.map(({ title, icon: Icon }) => (
                  <div key={title} className="flex items-center gap-3 px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 shadow-sm">
                    <Icon className="h-5 w-5 text-slate-700" />
                    <span className="font-semibold text-slate-800">{title}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Demo walkthrough & Portfolio */}
      <section className="bg-slate-900 py-24 text-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Demo Walkthrough */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-4">Evaluator Demo Path</h2>
              <p className="text-slate-400 mb-8 text-lg">Follow this quick sequence to evaluate the platform's core mechanics.</p>
              <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-0.5 before:bg-slate-800">
                {demoSteps.map((step, idx) => (
                  <div key={step} className="flex items-center gap-6 relative z-10">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-slate-900 bg-blue-600 font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div className="rounded-lg bg-slate-800/80 border border-slate-700 px-5 py-3 w-full font-medium shadow-md">
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio Positioning */}
            <div className="flex flex-col justify-center">
              <div className="rounded-3xl border border-slate-700 bg-slate-800/50 p-10 shadow-xl">
                <h3 className="text-2xl font-bold mb-4 text-blue-400">Portfolio Project</h3>
                <p className="text-lg leading-relaxed text-slate-300">
                  AutoOps is a production-grade DevOps control-plane portfolio project designed to demonstrate backend engineering, cloud/DevOps workflows, distributed worker execution, governance, audit evidence, and safe remediation design.
                </p>
                <div className="mt-8 pt-8 border-t border-slate-700 flex flex-wrap gap-3">
                  {['Next.js', 'Express', 'TypeScript', 'PostgreSQL', 'Prisma', 'Redis', 'BullMQ', 'Docker', 'Kubernetes', 'Jenkins'].map((tech) => (
                     <span key={tech} className="px-3 py-1 rounded-md bg-slate-700/50 text-sm font-medium text-slate-300">{tech}</span>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-900">AutoOps</span>
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">v1.4.0</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-slate-500">
            <span>Final platform freeze</span>
            <span className="hidden md:inline">•</span>
            <span>No secrets</span>
            <span className="hidden md:inline">•</span>
            <span>No fake data</span>
            <span className="hidden md:inline">•</span>
            <span>No autonomous remediation</span>
          </div>
          <Link href="https://github.com/Pramu55/AutoOps-2.0" target="_blank" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
            <Github className="h-5 w-5" />
            GitHub Repository
          </Link>
        </div>
      </footer>
    </main>
  );
}
