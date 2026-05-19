'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  CreateEnvironmentInput,
  Environment,
  Project,
  UpdateEnvironmentInput,
  UpdateProjectInput,
} from '@autoops/types';
import { EnvironmentKind } from '@autoops/types';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProjectResponse = {
  data: Project;
};

type EnvironmentsResponse = {
  data: Environment[];
};

type EnvironmentResponse = {
  data: Environment;
};

type ProjectFormState = {
  name: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
};

type EnvironmentFormState = {
  name: string;
  slug: string;
  kind: EnvironmentKind;
  description: string;
  url: string;
};

const initialEnvironmentForm: EnvironmentFormState = {
  name: '',
  slug: '',
  kind: EnvironmentKind.DEVELOPMENT,
  description: '',
  url: '',
};

const environmentKinds = [
  EnvironmentKind.DEVELOPMENT,
  EnvironmentKind.STAGING,
  EnvironmentKind.PRODUCTION,
  EnvironmentKind.PREVIEW,
  EnvironmentKind.CUSTOM,
] as const;

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
  return 'Something went wrong.';
}

function toFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    repositoryUrl: project.repositoryUrl ?? '',
    defaultBranch: project.defaultBranch,
  };
}

function toEnvironmentFormState(environment: Environment): EnvironmentFormState {
  return {
    name: environment.name,
    slug: environment.slug,
    kind: environment.kind,
    description: environment.description ?? '',
    url: environment.url ?? '',
  };
}

function StatusCard({
  title,
  status,
  description,
  icon,
}: {
  title: string;
  status: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="glass rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-2 text-sm font-medium text-primary">{status}</p>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
    </section>
  );
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [form, setForm] = useState<ProjectFormState | null>(null);
  const [environmentForm, setEnvironmentForm] =
    useState<EnvironmentFormState>(initialEnvironmentForm);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [environmentSlugEdited, setEnvironmentSlugEdited] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isSavingEnvironment, setIsSavingEnvironment] = useState(false);
  const [archivingEnvironmentId, setArchivingEnvironmentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [projectResponse, environmentsResponse] = await Promise.all([
        api.get<ProjectResponse>(`/v1/projects/${projectId}`),
        api.get<EnvironmentsResponse>(`/v1/projects/${projectId}/environments`),
      ]);
      setProject(projectResponse.data);
      setForm(toFormState(projectResponse.data));
      setEnvironments(environmentsResponse.data);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setIsSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    const payload: UpdateProjectInput = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      repositoryUrl: form.repositoryUrl.trim() || undefined,
      defaultBranch: form.defaultBranch.trim() || 'main',
    };

    try {
      const response = await api.patch<ProjectResponse>(`/v1/projects/${projectId}`, payload);
      setProject(response.data);
      setForm(toFormState(response.data));
      setSuccessMessage('Project settings saved.');
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    setIsArchiving(true);
    setArchiveError(null);

    try {
      await api.delete<ProjectResponse>(`/v1/projects/${projectId}`);
      router.replace('/dashboard/projects');
    } catch (error) {
      setArchiveError(getErrorMessage(error));
      setIsArchiving(false);
    }
  }

  function updateEnvironmentName(value: string) {
    setEnvironmentForm((current) => ({
      ...current,
      name: value,
      slug: environmentSlugEdited ? current.slug : slugify(value),
    }));
  }

  function resetEnvironmentForm() {
    setEnvironmentForm(initialEnvironmentForm);
    setEditingEnvironmentId(null);
    setEnvironmentSlugEdited(false);
    setEnvironmentError(null);
  }

  async function handleSaveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSavingEnvironment(true);
    setEnvironmentError(null);
    setSuccessMessage(null);

    const payload: CreateEnvironmentInput | UpdateEnvironmentInput = {
      name: environmentForm.name.trim(),
      slug: environmentForm.slug.trim(),
      kind: environmentForm.kind,
      description: environmentForm.description.trim() || undefined,
      url: environmentForm.url.trim() || undefined,
    };

    try {
      if (editingEnvironmentId) {
        const response = await api.patch<EnvironmentResponse>(
          `/v1/projects/${projectId}/environments/${editingEnvironmentId}`,
          payload,
        );
        setEnvironments((current) =>
          current.map((environment) =>
            environment.id === response.data.id ? response.data : environment,
          ),
        );
        setSuccessMessage(`Environment "${response.data.name}" saved.`);
      } else {
        const response = await api.post<EnvironmentResponse>(
          `/v1/projects/${projectId}/environments`,
          payload,
        );
        setEnvironments((current) => [response.data, ...current]);
        setSuccessMessage(`Environment "${response.data.name}" created.`);
      }

      resetEnvironmentForm();
    } catch (error) {
      setEnvironmentError(getErrorMessage(error));
    } finally {
      setIsSavingEnvironment(false);
    }
  }

  async function handleArchiveEnvironment(environmentId: string) {
    setArchivingEnvironmentId(environmentId);
    setEnvironmentError(null);
    setSuccessMessage(null);

    try {
      await api.delete<EnvironmentResponse>(`/v1/projects/${projectId}/environments/${environmentId}`);
      setEnvironments((current) =>
        current.filter((environment) => environment.id !== environmentId),
      );
      setSuccessMessage('Environment archived.');
      if (editingEnvironmentId === environmentId) {
        resetEnvironmentForm();
      }
    } catch (error) {
      setEnvironmentError(getErrorMessage(error));
    } finally {
      setArchivingEnvironmentId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/60 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading project details...
      </div>
    );
  }

  if (loadError || !project || !form) {
    const sessionExpired = loadError?.includes('Session expired');

    return (
      <div className="space-y-4">
        <Button asChild type="button" variant="ghost">
          <Link href="/dashboard/projects">
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
        </Button>
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h1 className="text-base font-semibold text-destructive">
                {sessionExpired ? 'Session expired' : 'Unable to load project'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {loadError ?? 'The project was not found or is no longer available.'}
              </p>
              {!sessionExpired ? (
                <Button className="mt-4" type="button" variant="outline" onClick={() => void loadProject()}>
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild type="button" variant="ghost" className="-ml-3 mb-3">
            <Link href="/dashboard/projects">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Link>
          </Button>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Project Details</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">/{project.slug}</p>
        </div>
        <Button type="button" variant="destructive" onClick={handleArchive} disabled={isArchiving}>
          {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
          {isArchiving ? 'Archiving...' : 'Archive Project'}
        </Button>
      </div>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-background/35 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Visibility</p>
            <p className="mt-2 text-sm font-medium text-foreground">{project.visibility}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/35 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Default Branch</p>
            <p className="mt-2 text-sm font-medium text-foreground">{project.defaultBranch}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/35 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
            <p className="mt-2 text-sm font-medium text-foreground">{formatDate(project.createdAt)}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/35 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Repository</p>
            {project.repositoryUrl ? (
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
              >
                <span className="truncate">{project.repositoryUrl}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Not connected</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatusCard
          title="Repository Readiness"
          status={project.repositoryUrl ? 'Repository connected' : 'Repository pending'}
          description="Source metadata is ready for future build pipeline wiring."
          icon={<GitBranch className="h-5 w-5" />}
        />
        <StatusCard
          title="Environment Integration"
          status={`${environments.length} configured`}
          description="Real deploy targets are managed here before deployment pipeline wiring."
          icon={<Cloud className="h-5 w-5" />}
        />
        <StatusCard
          title="Deployment Readiness"
          status="Pending Deployment Pipeline"
          description="No deployment trigger or lifecycle execution is connected here."
          icon={<GitMerge className="h-5 w-5" />}
        />
        <StatusCard
          title="Security and Ownership"
          status="Project scoped"
          description="Governance fields are limited to the current Projects API contract."
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Environments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Real project deploy targets from GET /api/v1/projects/:projectId/environments.
            </p>
          </div>
          <Cloud className="h-5 w-5 text-primary" />
        </div>

        <form className="mt-5 space-y-5 rounded-lg border border-border bg-background/35 p-4" onSubmit={handleSaveEnvironment}>
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingEnvironmentId ? 'Edit Environment' : 'Create Environment'}
            </h3>
            {editingEnvironmentId ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetEnvironmentForm}>
                <X className="h-4 w-4" />
                Cancel Edit
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="environment-name">Name</Label>
              <Input
                id="environment-name"
                required
                maxLength={60}
                value={environmentForm.name}
                placeholder="Staging"
                onChange={(event) => updateEnvironmentName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="environment-slug">Slug</Label>
              <Input
                id="environment-slug"
                required
                value={environmentForm.slug}
                placeholder="staging"
                onChange={(event) => {
                  setEnvironmentSlugEdited(true);
                  setEnvironmentForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="environment-kind">Kind</Label>
              <select
                id="environment-kind"
                value={environmentForm.kind}
                onChange={(event) =>
                  setEnvironmentForm((current) => ({
                    ...current,
                    kind: event.target.value as EnvironmentKind,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-ring"
              >
                {environmentKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="environment-url">URL</Label>
              <Input
                id="environment-url"
                type="url"
                value={environmentForm.url}
                placeholder="https://staging.example.com"
                onChange={(event) =>
                  setEnvironmentForm((current) => ({ ...current, url: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="environment-description">Description</Label>
              <Input
                id="environment-description"
                maxLength={2000}
                value={environmentForm.description}
                placeholder="Pre-production validation target"
                onChange={(event) =>
                  setEnvironmentForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
          </div>

          {environmentError ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {environmentError}
            </div>
          ) : null}

          <Button type="submit" disabled={isSavingEnvironment}>
            {isSavingEnvironment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSavingEnvironment
              ? 'Saving...'
              : editingEnvironmentId
                ? 'Save Environment'
                : 'Create Environment'}
          </Button>
        </form>

        <div className="mt-5">
          {environments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/30 p-8 text-center">
              <p className="text-sm font-medium text-foreground">No environments configured</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                Create development, staging, production, preview, or custom deploy targets before
                deployment pipeline work begins.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {environments.map((environment) => (
                <article key={environment.id} className="rounded-xl border border-border bg-background/35 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {environment.name}
                        </h3>
                        <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {environment.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">/{environment.slug}</p>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {environment.description ?? 'No description provided.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingEnvironmentId(environment.id);
                          setEnvironmentForm(toEnvironmentFormState(environment));
                          setEnvironmentSlugEdited(true);
                          setEnvironmentError(null);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={archivingEnvironmentId === environment.id}
                        onClick={() => void handleArchiveEnvironment(environment.id)}
                      >
                        {archivingEnvironmentId === environment.id ? 'Archiving...' : 'Archive'}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">URL</p>
                      {environment.url ? (
                        <a
                          href={environment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <span className="truncate">{environment.url}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Not set</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatDate(environment.createdAt)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Readiness</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        Ready for deployment pipeline
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Editable Project Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Updates only fields supported by PATCH /api/v1/projects/:projectId.
            </p>
          </div>
          <LockKeyhole className="h-5 w-5 text-primary" />
        </div>

        <form className="mt-5 space-y-5" onSubmit={handleSave}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm((current) => current && { ...current, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-branch">Default Branch</Label>
              <Input
                id="default-branch"
                maxLength={120}
                value={form.defaultBranch}
                onChange={(event) =>
                  setForm((current) => current && { ...current, defaultBranch: event.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repository-url">Repository URL</Label>
            <Input
              id="repository-url"
              type="url"
              value={form.repositoryUrl}
              placeholder="https://github.com/org/service"
              onChange={(event) =>
                setForm((current) => current && { ...current, repositoryUrl: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              maxLength={2000}
              value={form.description}
              onChange={(event) =>
                setForm((current) => current && { ...current, description: event.target.value })
              }
              className="min-h-24 w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {successMessage ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          ) : null}

          {saveError ? (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </div>
          ) : null}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </section>

      <section className="glass rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <ServerCog className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Future Execution Surfaces</h2>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
            Terraform/IaC state and plan review are not implemented yet.
          </div>
          <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
            Kubernetes executor configuration is not implemented yet.
          </div>
          <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-sm text-muted-foreground">
            Deployment pipeline controls are not implemented yet.
          </div>
        </div>
      </section>

      {archiveError ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {archiveError}
        </div>
      ) : null}
    </div>
  );
}
