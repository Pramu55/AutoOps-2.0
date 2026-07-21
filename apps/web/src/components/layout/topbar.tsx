'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Container,
  Database,
  Gauge,
  Github,
  GitMerge,
  Grid3X3,
  Hammer,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { clearAuthSession } from '@/lib/auth-session';
import { cn } from '@/lib/cn';
import { getQueryClient } from '@/lib/query-client';
import { getPrimaryOrganizationRole, isAdminConsoleRole, type ConsoleRole } from '@/lib/role';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';

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

const SIDEBAR_STORAGE_KEY = 'autoops-console-sidebar-collapsed';

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
    group: 'Pages',
    label: 'Integrations Hub',
    description: 'Control plane connector status',
    href: '/dashboard/integrations',
    icon: Network,
    keywords: ['integrations', 'connectors', 'status', 'hub'],
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
    group: 'Pages',
    label: 'Resource Graph',
    description: 'Tenant-scoped resource topology read model',
    href: '/dashboard/resources',
    icon: Boxes,
    keywords: ['resources', 'graph', 'topology', 'urn'],
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
      { href: '/dashboard/resources', label: 'Resource Graph', icon: Boxes },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { href: '/dashboard/integrations', label: 'Integrations Hub', icon: Network },
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
      { href: '/dashboard/resources', label: 'Resource Graph', icon: Boxes },
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
      { href: '/dashboard/integrations', label: 'Integrations Hub', icon: Network },
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

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Command Workspace',
  '/dashboard/operations': 'Operations Hub',
  '/dashboard/incidents': 'Incidents',
  '/dashboard/projects': 'Projects',
  '/dashboard/deployments': 'Deployments',
  '/dashboard/resources': 'Resource Graph',
  '/dashboard/integrations': 'Integrations Hub',
  '/dashboard/integrations/jenkins': 'Jenkins',
  '/dashboard/integrations/docker': 'Docker',
  '/dashboard/integrations/kubernetes': 'Kubernetes',
  '/dashboard/integrations/infrastructure': 'Infrastructure Automation',
  '/dashboard/integrations/github-actions': 'GitHub Actions',
  '/dashboard/integrations/cloud': 'Cloud Readiness',
  '/dashboard/integrations/aws': 'AWS Deployments',
  '/dashboard/integrations/observability': 'Observability',
  '/dashboard/integrations/devops-tools': 'DevOps Tools',
  '/dashboard/governance': 'Governance Center',
  '/dashboard/signals': 'Signal Ingest',
};

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

function routeTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments.at(-1) ?? 'dashboard';
  if (uuidPattern.test(lastSegment)) {
    if (pathname.includes('/operations/')) return 'Operation Detail';
    if (pathname.includes('/incidents/')) return 'Incident Record';
    return 'Record Detail';
  }
  return lastSegment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function routeCrumbs(pathname: string): Array<{ label: string; href?: string }> {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: 'Console', href: '/dashboard' },
  ];
  let href = '';

  for (const segment of segments) {
    href += `/${segment}`;
    if (segment === 'dashboard') continue;
    crumbs.push({
      label: uuidPattern.test(segment) ? 'Record' : routeTitle(href),
      href: uuidPattern.test(segment) ? undefined : href,
    });
  }

  return crumbs.length === 1 ? [{ label: 'Console' }, { label: routeTitle(pathname) }] : crumbs;
}

function useConsoleRole() {
  const user = useAuthStore((state) => state.user);
  const [consoleRole, setConsoleRole] = useState<ConsoleRole | null>(null);

  useEffect(() => {
    setConsoleRole(getPrimaryOrganizationRole());
  }, [user?.email]);

  return consoleRole;
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
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')
      ) {
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

function navGroupsForRole(role: ConsoleRole | null) {
  return isAdminConsoleRole(role) ? ADMIN_NAV_GROUPS : NAV_GROUPS;
}

function filterNavGroups(groups: NavGroup[], query: string): NavGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [group.label, item.label, item.href].join(' ').toLowerCase().includes(normalized),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

function ShellIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-300 transition hover:border-[#5f6b7a] hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
    >
      {children}
    </button>
  );
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
      className="fixed inset-0 z-[70] bg-slate-950/60 px-3 py-14 backdrop-blur-sm sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Global command search"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl shadow-slate-950/30">
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
            placeholder="Search services, operations, incidents, projects, resources..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
          />
          <span className="hidden rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-500 sm:inline">
            Enter opens
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ScrollArea className="max-h-[65vh]">
          <div className="p-3">
            {results.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
                No command results. Route search does not invent resource data.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group}
                  </p>
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
                              'flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500',
                              isActiveCommand
                                ? 'bg-blue-50 ring-1 ring-blue-200'
                                : 'hover:bg-slate-50',
                            )}
                          >
                            <span className="flex h-9 w-9 items-center justify-center rounded border border-blue-100 bg-blue-50 text-blue-700">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">
                                {item.label}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {item.description}
                              </span>
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
        </ScrollArea>
      </div>
    </div>
  );
}

function NavigationContent({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-8 bg-slate-700" title={group.label} />
          ) : (
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </p>
          )}
          <nav className="space-y-1" aria-label={group.label}>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  aria-label={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'group relative flex min-h-9 items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]',
                    collapsed && 'justify-center px-2',
                    active
                      ? 'border-white/10 bg-[#233244] text-white shadow-[inset_3px_0_0_#ffb454]'
                      : 'text-slate-300 hover:border-white/10 hover:bg-[#233244] hover:text-white',
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 shrink-0', active ? 'text-[#8ab4ff]' : 'text-slate-400')}
                  />
                  {collapsed ? (
                    <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] z-50 hidden whitespace-nowrap rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block group-focus:block">
                      {label}
                    </span>
                  ) : (
                    <span className="truncate">{label}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </section>
      ))}
    </div>
  );
}

export function ConsoleSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const consoleRole = useConsoleRole();
  const navGroups = navGroupsForRole(consoleRole);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setIsCollapsed(stored === 'true');
    setIsHydrated(true);
  }, []);

  function toggleCollapsed() {
    setIsCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 border-r border-[#263241] bg-[#16191f] text-slate-200 shadow-xl transition-[width] duration-200 md:block',
        isCollapsed && isHydrated ? 'w-[4.5rem]' : 'w-[16.5rem]',
      )}
      aria-label="Primary console navigation"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
          {isCollapsed && isHydrated ? (
            <span className="sr-only">AutoOps services</span>
          ) : (
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Services
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
            aria-label={isCollapsed ? 'Expand service navigation' : 'Collapse service navigation'}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-4">
            <NavigationContent groups={navGroups} collapsed={isCollapsed && isHydrated} />
          </div>
        </ScrollArea>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/dashboard/governance"
            title="Governance Center"
            className={cn(
              'flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]',
              isCollapsed && isHydrated && 'justify-center px-2',
            )}
          >
            <ShieldCheck className="h-4 w-4 text-[#8ab4ff]" />
            {isCollapsed && isHydrated ? null : <span>Audit evidence</span>}
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function PageContextBar() {
  const pathname = usePathname();
  const currentOrg = useWorkspaceStore((state) => state.currentOrg);
  const title = routeTitle(pathname);
  const crumbs = routeCrumbs(pathname);

  return (
    <div className="border-b border-slate-200 bg-white/85 px-3 py-2 backdrop-blur sm:px-5 lg:px-7">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav
            className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
            aria-label="Breadcrumb"
          >
            <Home className="mr-1 h-3.5 w-3.5 text-slate-400" />
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
                {crumb.href && index < crumbs.length - 1 ? (
                  <Link href={crumb.href} className="hover:text-slate-900 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="truncate text-base font-bold text-slate-950">{title}</h1>
        </div>
        <div className="hidden items-center gap-2 text-xs font-semibold text-slate-600 sm:flex">
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
            {currentOrg?.name ?? 'Workspace not selected'}
          </span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">Console</span>
        </div>
      </div>
    </div>
  );
}

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const resetWorkspace = useWorkspaceStore((state) => state.reset);
  const currentOrg = useWorkspaceStore((state) => state.currentOrg);
  const orgs = useWorkspaceStore((state) => state.orgs);
  const setCurrentOrg = useWorkspaceStore((state) => state.setCurrentOrg);
  const { isOpen, setIsOpen, query, setQuery } = useCommandPalette();
  const [isServicesOpen, setIsServicesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const consoleRole = useConsoleRole();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const moduleSearchRef = useRef<HTMLInputElement | null>(null);
  const navGroups = navGroupsForRole(consoleRole);
  const filteredModuleGroups = useMemo(
    () => filterNavGroups(navGroups, moduleSearch),
    [navGroups, moduleSearch],
  );

  useEffect(() => {
    if (!isServicesOpen && !isProfileOpen && !isWorkspaceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsServicesOpen(false);
        setIsProfileOpen(false);
        setIsWorkspaceOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isServicesOpen, isProfileOpen, isWorkspaceOpen]);

  useEffect(() => {
    if (!isServicesOpen) {
      setModuleSearch('');
      return;
    }

    const timeoutId = window.setTimeout(() => moduleSearchRef.current?.focus(), 50);
    return () => window.clearTimeout(timeoutId);
  }, [isServicesOpen]);

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
      <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-[#263241] bg-[#111827] text-slate-100 shadow-lg shadow-slate-950/20">
        <div className="flex h-full items-center gap-2 px-3 sm:gap-3 lg:px-5">
          <ShellIconButton label="Open services navigation" onClick={() => setIsServicesOpen(true)}>
            <Menu className="h-4 w-4 md:hidden" />
            <Grid3X3 className="hidden h-4 w-4 md:block" />
          </ShellIconButton>

          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 pr-1 sm:pr-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0972d3] text-white shadow-sm">
              <Zap className="h-4 w-4" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-extrabold leading-4 text-white">
                AutoOps
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Control Platform
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setIsServicesOpen(true)}
            className="hidden h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff] lg:inline-flex"
          >
            <Grid3X3 className="h-4 w-4" />
            Services
          </button>

          <div className="mx-1 hidden h-6 w-px bg-white/10 lg:block" />

          <div className="relative min-w-0 flex-1">
            <div className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-white px-3 text-sm shadow-sm transition focus-within:border-[#7aa7ff] focus-within:ring-2 focus-within:ring-[#1f4f82]">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input
                ref={searchInputRef}
                value={query}
                onFocus={() => setIsOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const [firstResult] = getCommandResults(query);
                    if (firstResult) {
                      setIsOpen(false);
                      router.push(firstResult.href);
                    }
                  }
                }}
                placeholder="Search services, operations, incidents, projects, resources..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-950 outline-none placeholder:text-slate-500"
                aria-label="Search services, operations, incidents, projects, resources"
              />
              <button
                type="button"
                onClick={() => {
                  setIsOpen(true);
                  searchInputRef.current?.focus();
                }}
                className="hidden rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 sm:inline"
                aria-label="Open command search"
              >
                Ctrl K
              </button>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-bold text-emerald-200 lg:flex">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Console
          </div>

          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setIsWorkspaceOpen((value) => !value)}
              className="flex h-9 max-w-[13rem] items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
              aria-haspopup="menu"
              aria-expanded={isWorkspaceOpen}
            >
              <span className="truncate">{currentOrg?.name ?? 'Workspace'}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>
            {isWorkspaceOpen ? (
              <div className="absolute right-0 top-11 z-[65] w-64 rounded-md border border-slate-700 bg-[#1f2937] p-2 shadow-xl">
                <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Workspace
                </p>
                {orgs.length > 0 ? (
                  orgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => {
                        setCurrentOrg(org);
                        setIsWorkspaceOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm text-slate-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
                    >
                      <span className="truncate">{org.name}</span>
                      {currentOrg?.id === org.id ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-2 text-sm text-slate-300">No workspace loaded</p>
                )}
              </div>
            ) : null}
          </div>

          <ShellIconButton label="Notifications">
            <Bell className="h-4 w-4" />
          </ShellIconButton>
          <ShellIconButton label="Help">
            <HelpCircle className="h-4 w-4" />
          </ShellIconButton>
          <ShellIconButton label="Open settings" onClick={() => router.push('/dashboard/settings')}>
            <Settings className="h-4 w-4" />
          </ShellIconButton>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileOpen((value) => !value)}
              className="flex h-9 items-center gap-2 rounded-md border border-white/10 px-1.5 pr-2 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
              aria-label="Open profile menu"
              aria-haspopup="menu"
              aria-expanded={isProfileOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded bg-[#31465f] text-xs font-bold text-white">
                {initials}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
            </button>
            {isProfileOpen ? (
              <div className="absolute right-0 top-11 z-[65] w-72 rounded-md border border-slate-700 bg-[#1f2937] p-2 shadow-xl">
                <div className="border-b border-white/10 px-2 py-3">
                  <p className="truncate text-sm font-semibold text-white">
                    {user?.name ?? 'Operator'}
                  </p>
                  <p className="truncate text-xs text-slate-400">{user?.email ?? 'autoops'}</p>
                  <p className="mt-1 text-xs font-medium text-slate-300">
                    {isAdminConsoleRole(consoleRole) ? 'Admin console role' : 'Console role'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {isServicesOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Services navigation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsServicesOpen(false);
          }}
        >
          <div className="flex h-full w-[min(42rem,92vw)] flex-col border-r border-[#31465f] bg-[#16191f] shadow-2xl shadow-black/50">
            <div className="flex min-h-14 items-center justify-between border-b border-white/10 px-4">
              <div>
                <p className="text-sm font-semibold text-white">AutoOps services</p>
                <p className="text-xs text-slate-400">Existing console destinations</p>
              </div>
              <button
                type="button"
                onClick={() => setIsServicesOpen(false)}
                className="rounded-md border border-slate-700 p-2 text-slate-300 hover:bg-[#31465f] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7aa7ff]"
                aria-label="Close services navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-white/10 p-4">
              <label className="sr-only" htmlFor="autoops-module-search">
                Filter AutoOps services
              </label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-slate-600 bg-white px-3">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  id="autoops-module-search"
                  ref={moduleSearchRef}
                  value={moduleSearch}
                  onChange={(event) => setModuleSearch(event.target.value)}
                  placeholder="Filter services, operations, integrations..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-950 outline-none placeholder:text-slate-500"
                />
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {filteredModuleGroups.length > 0 ? (
                  <NavigationContent
                    groups={filteredModuleGroups}
                    onNavigate={() => setIsServicesOpen(false)}
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-slate-600 bg-white/[0.03] p-6 text-sm text-slate-300">
                    No existing AutoOps destination matches that filter.
                  </div>
                )}
              </div>
            </ScrollArea>
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
