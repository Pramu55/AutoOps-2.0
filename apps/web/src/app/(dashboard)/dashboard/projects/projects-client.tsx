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
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { WorkQueue } from '@/components/layout/work-queue';

type ProjectsResponse = {
  data: Project[];
};

type ProjectResponse = {
  data: Project;
};

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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Boxes className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">No projects found</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Create the first real project record to connect service ownership, repository metadata,
        and future environment/deployment workflows.
      </p>
      <Button className="mt-5" type="button" onClick={onCreate}>
        <Plus className="h-4 w-4" />
        New Project
      </Button>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-[#0972d3]/40 hover:bg-[#f2f8fd]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{project.name}</h3>
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {project.visibility}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">/{project.slug}</p>
          {project.description ? (
            <p className="mt-3 max-w-3xl text-sm text-foreground/85">{project.description}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No description provided.</p>
          )}
        </div>

        <Button asChild type="button" variant="outline" className="border-slate-200 bg-white hover:bg-slate-50">
          <Link href={`/dashboard/projects/${project.id}`}>View Details</Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#5f6b7a]">
        <span className="inline-flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{project.repositoryUrl ? 'Repository connected' : 'Repository not connected'}</span>
        <span className="inline-flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" />Branch {project.defaultBranch}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Created {formatDate(project.createdAt)}</span>
      </div>
      {project.repositoryUrl ? (
        <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-w-0 items-center gap-2 text-xs font-semibold text-[#0972d3] hover:underline">
          <span className="truncate">{project.repositoryUrl}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : null}
    </article>
  );
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

  const loadProjects = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const response = await api.get<ProjectsResponse>('/v1/projects');
      setProjects(response.data);
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
    <div className="animate-fade-in flex flex-col min-h-screen">
      <WorkspaceHeader
        title="Projects Workspace"
        purpose="Service and delivery inventory managed by AutoOps."
        icon={<Boxes className="h-6 w-6" />}
        primaryAction={
          <Button
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
            className="bg-gradient-to-r from-blue-600 to-violet-600 shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-violet-500"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        }
        secondaryAction={
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadProjects()}
            disabled={isLoading || isRefreshing}
            className="border-slate-200 bg-white hover:bg-slate-50"
          >
            <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        }
      />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {successMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      ) : null}

      <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:grid-cols-2">
        <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">Active projects</p>
          <p className="mt-2 text-2xl font-bold text-[#16191f]">{isLoading ? '...' : String(projects.length)}</p>
          <p className="mt-1 text-sm text-[#5f6b7a]">Real project records from the API.</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#5f6b7a]">Connected repositories</p>
          <p className="mt-2 text-2xl font-bold text-[#16191f]">{isLoading ? '...' : String(repositoryCount)}</p>
          <p className="mt-1 text-sm text-[#5f6b7a]">Projects with repository metadata present.</p>
        </div>
      </div>
      {showCreateForm ? (
        <section className="relative overflow-hidden rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Create Project</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Creates a real project with POST /api/v1/projects using the shared project schema.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>

          <form className="mt-5 space-y-5" onSubmit={handleCreateProject}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  placeholder="Payments API"
                  onChange={(event) => updateName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-slug">Slug</Label>
                <Input
                  id="project-slug"
                  required
                  value={form.slug}
                  placeholder="payments-api"
                  onChange={(event) => updateSlug(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repository-url">Repository URL</Label>
                <Input
                  id="repository-url"
                  type="url"
                  value={form.repositoryUrl}
                  placeholder="https://github.com/org/service"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, repositoryUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-branch">Default Branch</Label>
                <Input
                  id="default-branch"
                  maxLength={120}
                  value={form.defaultBranch}
                  placeholder="main"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, defaultBranch: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <textarea
                id="project-description"
                maxLength={2000}
                value={form.description}
                placeholder="Service purpose, ownership, or operational context"
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className="min-h-24 w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {createError ? (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {createError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isCreating ? 'Creating...' : 'Create Project'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <WorkQueue
        title="Project Inventory"
        description="Real project records returned by GET /api/v1/projects."
        count={projects.length}
        isEmpty={projects.length === 0 || isLoading || !!loadError}
        emptyState={
          isLoading ? (
            <div className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading projects from the API...
            </div>
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 mx-5 my-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {loadError.includes('Session expired') ? 'Session expired' : 'Unable to load projects'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                  <Button
                    className="mt-4"
                    type="button"
                    variant="outline"
                    onClick={() => void loadProjects()}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState onCreate={() => setShowCreateForm(true)} />
          )
        }
      >
        {projects.map((project) => (
          <div key={project.id} className="p-4 sm:p-5 hover:bg-slate-50 transition">
            <ProjectCard project={project} />
          </div>
        ))}
      </WorkQueue>
      </div>
    </div>
  );
}
