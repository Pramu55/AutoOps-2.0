'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Container,
  Database,
  Gauge,
  Github,
  GitMerge,
  Hammer,
  Layers,
  LogOut,
  Menu,
  Network,
  Search,
  Server,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAuthSession } from '@/lib/auth-session';
import { cn } from '@/lib/cn';
import { getQueryClient } from '@/lib/query-client';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';
import { getPrimaryOrganizationRole, isAdminConsoleRole, type ConsoleRole } from '@/lib/role';

type CommandItem = {
  group: 'Pages' | 'Integrations' | 'Operations' | 'Incidents' | 'Actions';
  label: string;
  description: string;
  href: string;
  icon: ElementType;
  keywords: string[];
};

type NavItem = {
  href: string;
  label: string;
  icon: ElementType;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const COMMANDS: CommandItem[] = [
  {
    group: 'Pages',
    label: 'Overview',
    description: 'AutoOps console landing page',
    href: '/dashboard',
    icon: Server,
    keywords: ['home', 'dashboard', 'overview'],
  },
  {
    group: 'Operations',
    label: 'Operations Hub',
    description: 'Runtime health, approvals, incidents, failures, and activity',
    href: '/dashboard/operations',
    icon: Activity,
    keywords: ['ops', 'operations', 'activity', 'approvals', 'runtime'],
  },
  {
    group: 'Incidents',
    label: 'Incidents',
    description: 'Failed operation incidents and runbooks',
    href: '/dashboard/incidents',
    icon: AlertTriangle,
    keywords: ['incident', 'runbook', 'respond'],
  },
  {
    group: 'Pages',
    label: 'Projects',
    description: 'Project inventory',
    href: '/dashboard/projects',
    icon: Layers,
    keywords: ['projects', 'inventory'],
  },
  {
    group: 'Pages',
    label: 'Deployments',
    description: 'Deployment records and history',
    href: '/dashboard/deployments',
    icon: GitMerge,
    keywords: ['deployments', 'release'],
  },
  {
    group: 'Integrations',
    label: 'Jenkins Control Connector',
    description: 'Allowlisted build triggers and build activity',
    href: '/dashboard/integrations/jenkins',
    icon: Hammer,
    keywords: ['jenkins', 'ci', 'build'],
  },
  {
    group: 'Integrations',
    label: 'Docker Control Connector',
    description: 'Governed container start, stop, restart, logs, and inventory',
    href: '/dashboard/integrations/docker',
    icon: Container,
    keywords: ['docker', 'containers', 'images', 'logs'],
  },
  {
    group: 'Integrations',
    label: 'Kubernetes Control Connector',
    description: 'Cluster resources, workloads, scale, and rollout controls',
    href: '/dashboard/integrations/kubernetes',
    icon: Boxes,
    keywords: ['kubernetes', 'k8s', 'cluster', 'pods', 'workloads'],
  },
  {
    group: 'Integrations',
    label: 'Infrastructure Automation',
    description: 'Terraform/OpenTofu and Ansible governed automation center',
    href: '/dashboard/integrations/infrastructure',
    icon: Wrench,
    keywords: ['infrastructure', 'terraform', 'tofu', 'opentofu', 'ansible', 'iac'],
  },
  {
    group: 'Integrations',
    label: 'GitHub Actions',
    description: 'Read-only workflow and release gate status',
    href: '/dashboard/integrations/github-actions',
    icon: Github,
    keywords: ['github', 'actions', 'ci', 'workflow', 'release'],
  },
  {
    group: 'Integrations',
    label: 'Cloud Readiness',
    description: 'AWS, Azure, and GCP readiness without direct cloud writes',
    href: '/dashboard/integrations/cloud',
    icon: Cloud,
    keywords: ['cloud', 'aws', 'azure', 'gcp', 'readiness'],
  },
  {
    group: 'Integrations',
    label: 'AWS Deployments',
    description: 'Governed AWS ECS Fargate deployments',
    href: '/dashboard/integrations/aws',
    icon: Cloud,
    keywords: ['aws', 'deployments', 'ecs', 'fargate', 'terraform'],
  },
  {
    group: 'Integrations',
    label: 'Observability Integrations',
    description: 'Prometheus and Grafana readiness checks',
    href: '/dashboard/integrations/observability',
    icon: Gauge,
    keywords: ['prometheus', 'grafana', 'observability', 'metrics'],
  },
  {
    group: 'Integrations',
    label: 'DevOps Tools Readiness',
    description: 'Helm, Kustomize, kubectl, Terraform, Ansible, and runtime CLI checks',
    href: '/dashboard/integrations/devops-tools',
    icon: Wrench,
    keywords: ['helm', 'kustomize', 'kubectl', 'tools', 'devops'],
  },
  {
    group: 'Actions',
    label: 'Governance Center',
    description: 'Audit-style operation evidence and safe governance export',
    href: '/dashboard/governance',
    icon: ShieldCheck,
    keywords: ['governance', 'audit', 'evidence', 'compliance', 'export'],
  },
  {
    group: 'Actions',
    label: 'Pending Approvals',
    description: 'Jump to approval gates on Operations Hub',
    href: '/dashboard/operations#approvals',
    icon: ShieldCheck,
    keywords: ['approval', 'pending', 'governance'],
  },
  {
    group: 'Actions',
    label: 'Worker Runtime',
    description: 'Jump to worker runtime health on Operations Hub',
    href: '/dashboard/operations#runtime-health',
    icon: Wrench,
    keywords: ['worker', 'runtime', 'heartbeat'],
  },
  {
    group: 'Actions',
    label: 'Queue Health',
    description: 'Jump to queue health on Operations Hub',
    href: '/dashboard/operations#queue-health',
    icon: Database,
    keywords: ['queue', 'bullmq', 'redis'],
  },
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Command Center',
    items: [
      { href: '/dashboard', label: 'Overview', icon: Server },
      { href: '/dashboard/operations', label: 'Operations Hub', icon: Activity },
      { href: '/dashboard/incidents', label: 'Incidents', icon: AlertTriangle },
    ],
  },
  {
    label: 'Build & Deploy',
    items: [
      { href: '/dashboard/projects', label: 'Projects', icon: Layers },
      { href: '/dashboard/deployments', label: 'Deployments', icon: GitMerge },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { href: '/dashboard/integrations/jenkins', label: 'Jenkins', icon: Hammer },
      { href: '/dashboard/integrations/docker', label: 'Docker', icon: Container },
      { href: '/dashboard/integrations/kubernetes', label: 'Kubernetes', icon: Boxes },
      { href: '/dashboard/integrations/infrastructure', label: 'Infrastructure', icon: Wrench },
      { href: '/dashboard/integrations/github-actions', label: 'GitHub Actions', icon: Github },
      { href: '/dashboard/integrations/cloud', label: 'Cloud Readiness', icon: Cloud },
      { href: '/dashboard/integrations/aws', label: 'AWS Deployments', icon: Cloud },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/dashboard/governance', label: 'Governance Center', icon: ShieldCheck },
      { href: '/dashboard/operations#approvals', label: 'Pending Approvals', icon: ShieldCheck },
      { href: '/dashboard/operations#activity', label: 'Operation Activity', icon: Activity },
    ],
  },
  {
    label: 'Observability',
    items: [
      { href: '/dashboard/operations#runtime-health', label: 'Runtime Health', icon: Network },
      { href: '/dashboard/operations#queue-health', label: 'Queues', icon: Database },
      { href: '/dashboard/integrations/observability', label: 'Prometheus/Grafana', icon: Gauge },
      { href: '/dashboard/integrations/devops-tools', label: 'DevOps Tools', icon: Wrench },
    ],
  },
];

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Admin Center',
    items: [
      { href: '/dashboard', label: 'Control Center', icon: ShieldCheck },
      { href: '/dashboard/operations#approvals', label: 'Approval Queue', icon: ShieldCheck },
      { href: '/dashboard/incidents', label: 'Incident Command', icon: AlertTriangle },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/dashboard/governance', label: 'Governance Center', icon: ShieldCheck },
      { href: '/dashboard/operations#activity', label: 'Operation Audit', icon: Activity },
      { href: '/dashboard/projects', label: 'Project Access', icon: Layers },
      { href: '/dashboard/deployments', label: 'Deployment Records', icon: GitMerge },
    ],
  },
  {
    label: 'Runtime Oversight',
    items: [
      { href: '/dashboard/operations#runtime-health', label: 'Runtime Health', icon: Network },
      { href: '/dashboard/operations#queue-health', label: 'Queue Health', icon: Database },
      { href: '/dashboard/operations', label: 'Operations Hub', icon: Activity },
    ],
  },
  {
    label: 'Connector Oversight',
    items: [
      { href: '/dashboard/integrations/jenkins', label: 'Jenkins', icon: Hammer },
      { href: '/dashboard/integrations/docker', label: 'Docker', icon: Container },
      { href: '/dashboard/integrations/kubernetes', label: 'Kubernetes', icon: Boxes },
      { href: '/dashboard/integrations/infrastructure', label: 'Infrastructure', icon: Wrench },
      { href: '/dashboard/integrations/github-actions', label: 'GitHub Actions', icon: Github },
      { href: '/dashboard/integrations/cloud', label: 'Cloud Readiness', icon: Cloud },
      { href: '/dashboard/integrations/aws', label: 'AWS Deployments', icon: Cloud },
      { href: '/dashboard/integrations/observability', label: 'Observability', icon: Gauge },
      { href: '/dashboard/integrations/devops-tools', label: 'DevOps Tools', icon: Wrench },
    ],
  },
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCommandResults(query: string): CommandItem[] {
  const normalized = query.trim().toLowerCase();
  const base = normalized
    ? COMMANDS.filter((item) =>
        [item.label, item.description, item.group, ...item.keywords]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
    : COMMANDS;

  if (uuidPattern.test(query.trim())) {
    return [
      {
        group: 'Operations',
        label: `Open operation ${query.trim().slice(0, 8)}`,
        description: 'Navigate directly to operation detail by UUID',
        href: `/dashboard/operations/${query.trim()}`,
        icon: Activity,
        keywords: [],
      },
      ...base,
    ];
  }

  return base;
}

function isActive(pathname: string, href: string): boolean {
  const base = href.split('#')[0] ?? href;
  return base === '/dashboard' ? pathname === base : pathname.startsWith(base);
}

function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { isOpen, setIsOpen, query, setQuery };
}

function CommandPalette({
  isOpen,
  query,
  setQuery,
  onClose,
}: {
  isOpen: boolean;
  query: string;
  setQuery: (value: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => getCommandResults(query), [query]);
  const activeResult = results[activeIndex] ?? results[0] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, isOpen]);

  function openCommand(item: CommandItem | null) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  if (!isOpen) return null;

  const groups = Array.from(new Set(results.map((item) => item.group)));
  let resultIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-16 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                openCommand(activeResult);
              }
            }}
            placeholder="Search pages, integrations, actions, or paste an operation UUID"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
          />
          <span className="hidden rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 sm:inline">Enter opens</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900" aria-label="Close command palette">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-3">
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
              No command results. Route search does not invent resource data.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group} className="mb-3 last:mb-0">
                <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                <div className="space-y-1">
                  {results
                    .filter((item) => item.group === group)
                    .map((item) => {
                      resultIndex += 1;
                      const currentIndex = resultIndex;
                      const isActiveCommand = currentIndex === activeIndex;
                      const Icon = item.icon;
                      return (
                        <button
                          key={`${item.group}-${item.href}-${item.label}`}
                          type="button"
                          onMouseEnter={() => setActiveIndex(currentIndex)}
                          onClick={() => openCommand(item)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition',
                            isActiveCommand ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50',
                          )}
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{item.label}</span>
                            <span className="block truncate text-xs text-slate-500">{item.description}</span>
                          </span>
                          {isActiveCommand ? (
                            <span className="ml-auto hidden rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 sm:inline">
                              Enter
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function ConsoleSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const user = useAuthStore((state) => state.user);
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);

  useEffect(() => {
    setConsoleRole(getPrimaryOrganizationRole());
  }, [user?.email]);

  const navGroups = isAdminConsoleRole(consoleRole) ? ADMIN_NAV_GROUPS : NAV_GROUPS;

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r border-[#31465f] bg-[#16191f] transition-[width] duration-200 md:block',
        isCollapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
        <button
          type="button"
          onClick={() => setIsCollapsed((value) => !value)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-[#16191f] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#ff9900]/60 hover:bg-[#31465f]"
          aria-label={isCollapsed ? 'Expand service navigation' : 'Collapse service navigation'}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {isCollapsed ? null : <span>Collapse navigation</span>}
        </button>
        {navGroups.map((group) => (
          <div key={group.label} className="mb-6">
            {isCollapsed ? null : (
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
            )}
            <nav className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    className={cn(
                      'flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition',
                      isCollapsed && 'justify-center px-2',
                      active
                        ? 'border-blue-400/30 bg-blue-500/15 text-white'
                        : 'text-slate-300 hover:border-slate-700 hover:bg-[#31465f] hover:text-white',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-blue-300' : 'text-slate-400')} />
                    {isCollapsed ? null : label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const resetWorkspace = useWorkspaceStore((state) => state.reset);
  const currentOrg = useWorkspaceStore((state) => state.currentOrg);
  const { isOpen, setIsOpen, query, setQuery } = useCommandPalette();
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConsoleRole(getPrimaryOrganizationRole());
  }, [user?.email]);

  function handleLogout() {
    disconnectSocket();
    clearAuthSession();
    clearAuth();
    resetWorkspace();
    getQueryClient().clear();
    router.replace('/login');
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AO';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#d5dbdb] bg-white shadow-sm">
        <div className="flex h-14 items-center gap-3 px-3 lg:px-4">
          <button
            type="button"
            onClick={() => setIsServicesOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition hover:border-blue-500 hover:bg-blue-50 md:hidden"
          >
            <Menu className="h-4 w-4" />
            Services
          </button>
          <Link href="/dashboard" className="flex w-[15.25rem] shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0972d3] text-white shadow-sm">
              <Zap className="h-4 w-4" />
            </div>
            <div className="hidden min-[430px]:block">
              <p className="text-sm font-semibold text-slate-950">
                {isAdminConsoleRole(consoleRole) ? 'AutoOps Admin' : 'AutoOps Console'}
              </p>
              <p className="text-[11px] text-slate-500">{currentOrg?.name ?? 'Local runtime'}</p>
            </div>
          </Link>

          <div className="relative flex h-9 min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm transition focus-within:border-[#0972d3] focus-within:ring-2 focus-within:ring-blue-100 lg:max-w-3xl">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              ref={searchInputRef}
              value={query}
              onFocus={() => {
                if (query.trim()) setIsOpen(true);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(event.target.value.trim().length > 0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const [firstResult] = getCommandResults(query);
                  if (firstResult) {
                    setIsOpen(false);
                    router.push(firstResult.href);
                  } else {
                    setIsOpen(true);
                  }
                }
              }}
              placeholder="Search services, operations, incidents, or paste UUID"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => {
                setIsOpen(true);
                searchInputRef.current?.focus();
              }}
              className="hidden shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 sm:inline"
            >
              Ctrl K
            </button>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            Runtime
          </div>
          <div className="hidden rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 xl:block">
            {isAdminConsoleRole(consoleRole) ? 'Admin control' : 'Local runtime'}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-slate-300 bg-white py-1 pl-1 pr-3 shadow-sm sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#232f3e] text-xs font-semibold text-white">{initials}</div>
            <div className="hidden max-w-40 lg:block">
              <p className="truncate text-xs font-medium text-slate-900">{user?.name ?? 'Operator'}</p>
              <p className="truncate text-[10px] text-slate-500">{user?.email ?? 'autoops'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={handleLogout} className="rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {isServicesOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true">
          <div className="h-full w-[min(22rem,86vw)] overflow-y-auto border-r border-[#31465f] bg-[#16191f] p-4 shadow-2xl shadow-black/50">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Services</p>
                <p className="text-xs text-slate-400">Navigate AutoOps modules</p>
              </div>
              <button
                type="button"
                onClick={() => setIsServicesOpen(false)}
                className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-[#31465f] hover:text-white"
                aria-label="Close services navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(isAdminConsoleRole(consoleRole) ? ADMIN_NAV_GROUPS : NAV_GROUPS).map((group) => (
              <div key={group.label} className="mb-6">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                <nav className="space-y-1">
                  {group.items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsServicesOpen(false)}
                      className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm text-slate-200 transition hover:border-blue-400/30 hover:bg-blue-500/10"
                    >
                      <Icon className="h-4 w-4 text-blue-300" />
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <CommandPalette
        isOpen={isOpen}
        query={query}
        setQuery={setQuery}
        onClose={() => {
          setIsOpen(false);
          setQuery('');
        }}
      />
    </>
  );
}
