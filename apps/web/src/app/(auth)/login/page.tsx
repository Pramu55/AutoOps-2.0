'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import type { AuthSession } from '@autoops/types';
import { api, ApiError } from '@/lib/api';
import { setAuthSession } from '@/lib/auth-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type LoginResponse = {
  data: AuthSession;
};

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

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('bullmq-test@example.com');
  const [password, setPassword] = useState('StrongPass123');
  const [error, setError] = useState<string | null>(null);
  const [registeredUser, setRegisteredUser] = useState<{ name: string; email: string } | null>(null);
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

    if (!password) {
      setError('Password is required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<LoginResponse>('/v1/auth/login', {
        email: normalizedEmail,
        password,
      });

      setAuthSession(response.data);
      router.replace(getRedirectTarget());
      router.refresh();
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#17182e] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(28,36,76,0.92),rgba(52,40,88,0.76)_48%,rgba(102,22,76,0.78))]" />
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(30deg,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(150deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:96px_96px]" />
      <div className="absolute inset-y-0 left-0 w-[26vw] bg-slate-950/35 [clip-path:polygon(0_0,62%_0,100%_100%,0_100%)]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1120px] grid-cols-1 gap-10 px-5 py-8 md:grid-cols-[0.95fr_1fr] md:items-center md:px-8 lg:gap-16">
        <section className="flex min-h-[280px] flex-col justify-center md:min-h-0">
          <Link href="/" className="mb-10 inline-flex items-center gap-3 text-lg font-semibold">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-xl shadow-blue-950/40">
              <Zap className="h-7 w-7" />
            </span>
            AutoOps
          </Link>

          <div className="max-w-[420px]">
            <div className="mb-7 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl backdrop-blur">
              <Zap className="h-16 w-16 text-white" />
            </div>
            <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">AUTOOPS</h1>
            <p className="mt-6 max-w-sm text-base leading-7 text-white/75">
              AI-native DevOps control plane for projects, environments, deployments, worker queues,
              and simulation timelines.
            </p>
            <div className="mt-8 grid max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
              {['API ready', 'Worker healthy', 'Queue-backed', 'Simulation active'].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white/85">
                  <CheckCircle2 className="h-3.5 w-3.5 text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full md:justify-self-end">
          <div className="mx-auto w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-light tracking-tight text-white">Log in to AutoOps</h2>
              <button type="button" className="inline-flex items-center gap-2 text-sm font-medium text-white/75">
                AutoOps Cloud
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-8 flex items-center gap-4 text-sm">
              <span className="font-semibold text-white">New user?</span>
              <Link href="/register" className="inline-flex items-center gap-2 font-semibold text-blue-300 hover:text-blue-200">
                Create account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {registeredUser ? (
              <div className="mb-5 rounded border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-50">
                <span className="font-semibold">{registeredUser.name}</span> registered successfully.
                Please log in with <span className="font-semibold">{registeredUser.email}</span>.
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
                className="h-12 rounded border-white/20 bg-[#11131f]/90 text-base text-white placeholder:text-white/45 focus-visible:ring-blue-400"
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
                className="h-12 rounded border-white/20 bg-[#11131f]/90 text-base text-white placeholder:text-white/45 focus-visible:ring-blue-400"
              />

              {error ? (
                <div className="rounded border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <Button
                className="h-12 w-full rounded bg-blue-500 text-base font-semibold text-white hover:bg-blue-400"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Logging in...' : 'Log in'}
              </Button>
            </form>

            <Link href="/" className="mt-5 inline-block text-sm font-medium text-blue-300 hover:text-blue-200">
              Back to site
            </Link>

            <div className="mt-8 border-t border-white/20 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Demo credentials</p>
              <p className="mt-2 break-all text-sm text-white/75">bullmq-test@example.com</p>
              <p className="mt-1 text-sm text-white/75">StrongPass123</p>
            </div>
          </div>
        </section>
      </div>

      <footer className="pointer-events-none absolute bottom-5 left-0 right-0 hidden text-center text-xs text-white/45 md:block">
        AutoOps Control Plane 2026 - Simulation executor enabled - Real infrastructure execution is not active
      </footer>
    </main>
  );
}
