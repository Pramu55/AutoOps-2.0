'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { CreateProjectInput, Project } from '@autoops/types';
import { ProjectVisibility } from '@autoops/types';
import {
  AlertCircle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Code2,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  FolderDot
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';
import { EmptyState } from '@/components/layout/empty-state';
import { EvidencePanel } from '@/components/layout/evidence-panel';
import { cn } from '@/lib/cn';

type ProjectsResponse = { data: Project[] };
type ProjectResponse = { data: Project };

type ProjectFormState = {
  name: string;
  slug: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
};

const initialFormState: ProjectFormState = {
  name: '',
  slug: '',
  description: '',
  repositoryUrl: '',
  defaultBranch: 'main',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') {
    return 'Session expired. Please sign in again.';
  }
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong while loading projects.';
}

export function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(initialFormState);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadProjects = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setIsLoading(true);
    else setIsRefreshing(true);
    setLoadError(null);

    try {
      const response = await api.get<ProjectsResponse>('/v1/projects');
      setProjects(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects('initial');
  }, [loadProjects]);

  const repositoryCount = useMemo(
    () => projects.filter((project) => Boolean(project.repositoryUrl)).length,
    [projects],
  );

  function updateName(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugEdited ? current.slug : slugify(value),
    }));
  }

  function updateSlug(value: string) {
    setSlugEdited(true);
    setForm((current) => ({ ...current, slug: slugify(value) }));
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSuccessMessage(null);

    const payload: CreateProjectInput = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || undefined,
      visibility: ProjectVisibility.ORG,
      repositoryUrl: form.repositoryUrl.trim() || undefined,
      defaultBranch: form.defaultBranch.trim() || 'main',
    };

    setIsCreating(true);

    try {
      const response = await api.post<ProjectResponse>('/v1/projects', payload);
      setProjects((current) => [response.data, ...current]);
      setForm(initialFormState);
      setSlugEdited(false);
      setShowCreateForm(false);
      setSuccessMessage(`Project "${response.data.name}" created. Open it from the list to manage details.`);
    } catch (error) {
      setCreateError(getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <WorkspaceHeader
        title="Projects Workspace"
        purpose="Delivery projects, service ownership, and deployment tracking."
        icon={<FolderDot className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Command', href: '/dashboard' }, { label: 'Projects' }]}
        statusSummary={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadProjects()}
              disabled={isLoading || isRefreshing}
              className="bg-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {loadError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {loadError}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {successMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Active Projects</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{isLoading ? '...' : projects.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Connected Repos</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{isLoading ? '...' : repositoryCount}</p>
          </div>
        </div>

        {showCreateForm && (
          <EvidencePanel title="Create Project" icon={<ShieldCheck className="h-4 w-4 text-blue-600" />}>
             <form className="space-y-5" onSubmit={handleCreateProject}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-sm">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Name</Label>
                  <Input id="project-name" required minLength={2} maxLength={120} value={form.name} placeholder="Payments API" onChange={(event) => updateName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-slug">Slug</Label>
                  <Input id="project-slug" required value={form.slug} placeholder="payments-api" onChange={(event) => updateSlug(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repository-url">Repository URL</Label>
                  <Input id="repository-url" type="url" value={form.repositoryUrl} placeholder="https://github.com/org/service" onChange={(event) => setForm((current) => ({ ...current, repositoryUrl: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-branch">Default Branch</Label>
                  <Input id="default-branch" maxLength={120} value={form.defaultBranch} placeholder="main" onChange={(event) => setForm((current) => ({ ...current, defaultBranch: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <Label htmlFor="project-description">Description</Label>
                <textarea
                  id="project-description"
                  maxLength={2000}
                  value={form.description}
                  placeholder="Service purpose, ownership, or operational context"
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="w-full min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {createError && (
                <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4" />
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                 <Button type="button" variant="outline" onClick={() => { setShowCreateForm(false); setCreateError(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} className="bg-slate-900 text-white hover:bg-slate-800">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {isCreating ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </EvidencePanel>
        )}

        <WorkQueue
          title="Project Inventory"
          description="Deployable services and repositories backed by real API records."
          isEmpty={projects.length === 0}
          emptyState={
            <EmptyState 
              title="No projects found" 
              description="Create the first project record to connect service ownership, repository metadata, and future environment workflows." 
              icon={<Boxes className="text-slate-400" />} 
              variant="compact" 
            />
          }
        >
          {projects.map((project) => (
            <div key={project.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition">
              <div className="flex-1 min-w-0 pr-4">
                 <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-semibold text-slate-900 truncate">{project.name}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider border border-slate-200">
                      {project.visibility}
                    </span>
                 </div>
                 <p className="text-xs text-slate-500 mb-3 font-mono">/{project.slug}</p>
                 <p className="text-sm text-slate-600 line-clamp-2 max-w-3xl mb-4">
                   {project.description || 'No description provided.'}
                 </p>
                 
                 <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                   <span className="flex items-center gap-1.5">
                     <GitBranch className="h-3.5 w-3.5" />
                     {project.repositoryUrl ? 'Repo connected' : 'No repo'}
                   </span>
                   <span className="flex items-center gap-1.5">
                     <Code2 className="h-3.5 w-3.5" />
                     Branch {project.defaultBranch}
                   </span>
                   <span className="flex items-center gap-1.5">
                     <CalendarClock className="h-3.5 w-3.5" />
                     Created {formatDate(project.createdAt)}
                   </span>
                 </div>

                 {project.repositoryUrl && (
                    <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                      <span className="truncate">{project.repositoryUrl}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
              </div>
              <div className="mt-4 sm:mt-0 shrink-0">
                <Button asChild variant="outline" size="sm" className="bg-white">
                  <Link href={`/dashboard/projects/${project.id}`}>View Details</Link>
                </Button>
              </div>
            </div>
          ))}
        </WorkQueue>

      </div>
    </div>
  );
}
