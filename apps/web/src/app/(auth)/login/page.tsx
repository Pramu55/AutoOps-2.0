'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import type { AuthSession } from '@autoops/types';
import { api, ApiError } from '@/lib/api';
import { setAuthSession } from '@/lib/auth-session';
import { getQueryClient } from '@/lib/query-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAdminConsoleRole } from '@/lib/role';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';

type LoginResponse = {
  data: AuthSession;
};

const LOCAL_DEMO_ACCOUNTS = [
  {
    label: 'Operator / Requester',
    description: 'Can trigger controlled operations and request approvals.',
    email: 'pramod.local@autoops.dev',
    password: 'StrongPass123',
    buttonLabel: 'Use Operator account',
  },
  {
    label: 'Admin / Approver',
    description: 'Can review, approve, or reject pending operations.',
    email: 'approver.local@autoops.dev',
    password: 'StrongPass123',
    buttonLabel: 'Use Admin account',
  },
  {
    label: 'Isolated Tenant User',
    description: 'Separate local-only organization for tenant isolation testing.',
    email: 'isolated.local@autoops.dev',
    password: 'StrongPass123',
    buttonLabel: 'Use Isolated account',
  },
] as const;

function getRedirectTarget(): string {
  if (typeof window === 'undefined') return '/dashboard';

  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');

  if (!from || from === '/' || !from.startsWith('/') || from.startsWith('//')) {
    return '/dashboard';
  }

  return from;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getLoginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (
      err.status === 401 ||
      err.status === 403 ||
      err.code === 'UNAUTHENTICATED' ||
      err.message.toLowerCase().includes('invalid credentials') ||
      err.message.toLowerCase().includes('internal server error')
    ) {
      return 'Password is incorrect. Please check your password and try again.';
    }

    return err.message;
  }

  return 'Unable to sign in. Please try again.';
}

function validateLoginPassword(value: string): string | null {
  if (!value) return 'Password is required.';
  if (value.length > 128) return 'Password must be 128 characters or fewer.';
  if (/\s/.test(value)) return 'Password cannot contain spaces.';
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const resetWorkspace = useWorkspaceStore((state) => state.reset);
  const setCurrentOrg = useWorkspaceStore((state) => state.setCurrentOrg);
  const setOrgs = useWorkspaceStore((state) => state.setOrgs);

  const [email, setEmail] = useState('pramod.local@autoops.dev');
  const [password, setPassword] = useState('StrongPass123');
  const [error, setError] = useState<string | null>(null);
  const [registeredUser, setRegisteredUser] = useState<{ name: string; email: string } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const registeredName = params.get('registeredName');
    const registeredEmail = params.get('email');

    if (registeredName && registeredEmail) {
      setRegisteredUser({ name: registeredName, email: registeredEmail });
      setEmail(registeredEmail);
      setPassword('');
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    const passwordError = validateLoginPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      clearAuth();
      resetWorkspace();
      getQueryClient().clear();
      const response = await api.post<LoginResponse>('/v1/auth/login', {
        email: normalizedEmail,
        password,
      });

      setAuthSession(response.data);
      setAuth(response.data.user, response.data.tokens.accessToken);
      const orgs = response.data.organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
      }));
      setOrgs(orgs);
      if (orgs[0]) setCurrentOrg(orgs[0]);
      const role = response.data.organizations[0]?.role ?? null;
      const target = isAdminConsoleRole(role) ? '/dashboard' : getRedirectTarget();
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectDemoAccount(account: (typeof LOCAL_DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(120deg,#f7fff0_0%,#d9ffd9_36%,#f7fbff_72%,#ffffff_100%)] text-[#16191f]">
      <div className="border-b border-[#d5dbdb] bg-white">
        <div className="mx-auto flex min-h-20 max-w-[1280px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-end gap-2 text-3xl font-bold tracking-tight text-[#111827]"
          >
            <span>autoops</span>
            <span className="mb-1.5 h-1.5 w-10 rounded-full bg-[#ff9900]" />
          </Link>
          <span className="hidden text-sm font-semibold text-[#5f6b7a] sm:inline">
            Local demo console
          </span>
        </div>
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1280px] grid-cols-1 gap-10 px-6 py-12 md:grid-cols-[0.95fr_1fr] md:items-center lg:gap-16">
        <section className="flex min-h-[280px] flex-col justify-center md:min-h-0">
          <Link href="/" className="mb-10 inline-flex items-center gap-3 text-lg font-bold">
            <span className="flex h-12 w-12 items-center justify-center rounded bg-[#16191f]">
              <Zap className="h-7 w-7 text-white" />
            </span>
            AutoOps
          </Link>

          <div className="max-w-[420px]">
            <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-[#d5dbdb] bg-white shadow-2xl backdrop-blur">
              <Zap className="h-16 w-16 text-[#0972d3]" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-[#16191f] sm:text-6xl">
              AUTOOPS
            </h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-[#414d5c]">
              AI-native DevOps control plane for projects, environments, deployments, worker queues,
              and simulation timelines.
            </p>
            <div className="mt-8 grid max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
              {['API ready', 'Worker healthy', 'Queue-backed', 'Simulation active'].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-md border border-[#d5dbdb] bg-white px-3 py-2 text-xs font-medium text-[#232f3e]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#0972d3]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full md:justify-self-end">
          <div className="mx-auto w-full max-w-[460px]">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-4xl font-bold tracking-tight text-[#16191f]">
                Log in to AutoOps
              </h2>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#414d5c]"
              >
                AutoOps Cloud
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-8 flex items-center gap-4 text-sm">
              <span className="font-bold text-[#16191f]">New user?</span>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 font-semibold text-[#0972d3] hover:underline"
              >
                Create account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {registeredUser ? (
              <div className="mb-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="font-semibold">{registeredUser.name}</span> registered
                successfully. Please log in with{' '}
                <span className="font-semibold">{registeredUser.email}</span>.
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={onSubmit} noValidate>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder="Username/Email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                className="h-12 rounded border-[#879596] bg-white text-base text-[#16191f] placeholder:text-[#697586] focus-visible:ring-[#0972d3]"
              />

              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                placeholder="Password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                className="h-12 rounded border-[#879596] bg-white text-base text-[#16191f] placeholder:text-[#697586] focus-visible:ring-[#0972d3]"
              />

              {error ? (
                <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              <Button
                className="h-12 w-full rounded bg-blue-500 text-base font-bold text-[#16191f] hover:bg-blue-400"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Logging in...' : 'Log in'}
              </Button>
            </form>

            <Link
              href="/"
              className="mt-5 inline-block text-sm font-medium text-[#0972d3] hover:underline"
            >
              Back to site
            </Link>

            <div className="mt-8 border-t border-[#d5dbdb] pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6b7a]">
                Local demo accounts
              </p>
              <p className="mt-2 text-sm leading-6 text-[#414d5c]">
                Use these accounts to test the requester and approver workflow locally. In
                production, use real organization invites and managed users.
              </p>

              <div className="mt-4 grid gap-3">
                {LOCAL_DEMO_ACCOUNTS.map((account) => (
                  <div
                    key={account.email}
                    className="rounded border border-[#d5dbdb] bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#16191f]">{account.label}</p>
                        <p className="mt-1 text-xs leading-5 text-[#5f6b7a]">
                          {account.description}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 shrink-0 rounded bg-white/12 px-3 text-xs font-bold text-[#16191f] hover:bg-white/18"
                        onClick={() => selectDemoAccount(account)}
                      >
                        {account.buttonLabel}
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[#414d5c]">
                      <p className="break-all">
                        <span className="text-[#5f6b7a]">Email:</span> {account.email}
                      </p>
                      <p>
                        <span className="text-[#5f6b7a]">Password:</span> {account.password}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="pointer-events-none absolute bottom-5 left-0 right-0 hidden text-center text-xs text-[#5f6b7a] md:block">
        AutoOps Control Plane 2026 - Local runtime - Real connector data with governed controls
      </footer>
    </main>
  );
}
