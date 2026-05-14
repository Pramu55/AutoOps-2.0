'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Zap } from 'lucide-react';
import type { RegisterInput } from '@autoops/types';
import { api, ApiError } from '@/lib/api';
import { clearAuthSession } from '@/lib/auth-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type RegisterResponse = { data: unknown };

type RegisterErrors = Partial<Record<'name' | 'email' | 'organizationName' | 'password' | 'confirmPassword' | 'form', string>>;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validatePassword(value: string): string | null {
  if (value.length < 12) return 'Password must be at least 12 characters.';
  if (value.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(value)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Password must contain an uppercase letter.';
  if (!/\d/.test(value)) return 'Password must contain a digit.';
  return null;
}

function isDuplicateRegistrationError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;

  const message = err.message.toLowerCase();
  return (
    err.status === 409 ||
    err.code === 'CONFLICT' ||
    message.includes('already exists') ||
    message.includes('already registered') ||
    message.includes('internal server error')
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordChecks = useMemo(
    () => [
      { label: '12+ characters', passed: password.length >= 12 },
      { label: 'Lowercase letter', passed: /[a-z]/.test(password) },
      { label: 'Uppercase letter', passed: /[A-Z]/.test(password) },
      { label: 'Number', passed: /\d/.test(password) },
    ],
    [password],
  );

  function validate(): RegisterErrors {
    const nextErrors: RegisterErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedOrg = organizationName.trim();

    if (!trimmedName) nextErrors.name = 'Name is required.';
    if (trimmedName.length > 120) nextErrors.name = 'Name must be 120 characters or fewer.';
    if (!isValidEmail(trimmedEmail)) nextErrors.email = 'Enter a valid email address.';
    if (trimmedOrg && trimmedOrg.length < 2) nextErrors.organizationName = 'Organization name must be at least 2 characters.';
    if (trimmedOrg.length > 120) nextErrors.organizationName = 'Organization name must be 120 characters or fewer.';

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';

    return nextErrors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: RegisterInput = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      organizationName: organizationName.trim() || undefined,
    };

    setIsSubmitting(true);
    setSuccessMessage(null);
    clearAuthSession();

    try {
      await api.post<RegisterResponse>('/v1/auth/register', payload);
      clearAuthSession();
      const loginParams = new URLSearchParams({
        email: payload.email,
        registeredName: payload.name,
      });
      setSuccessMessage(`${payload.name} registered successfully. Redirecting to login...`);
      window.setTimeout(() => {
        router.replace(`/login?${loginParams.toString()}`);
      }, 900);
    } catch (err) {
      if (isDuplicateRegistrationError(err)) {
        setErrors({
          email: 'User already registered.',
          form: 'User already registered.',
        });
        return;
      }

      setErrors({
        form:
          err instanceof ApiError && err.message === 'Internal Server Error'
            ? 'Unable to create account. If this email is already registered, use the login page.'
            : err instanceof ApiError
              ? err.message
              : 'Unable to create account. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#17182e] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(28,36,76,0.92),rgba(52,40,88,0.76)_48%,rgba(102,22,76,0.78))]" />
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(30deg,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(150deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:96px_96px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1120px] grid-cols-1 gap-10 px-5 py-8 md:grid-cols-[0.9fr_1.1fr] md:items-center md:px-8 lg:gap-16">
        <section className="hidden md:block">
          <Link href="/" className="mb-12 inline-flex items-center gap-3 text-lg font-semibold">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-xl shadow-blue-950/40">
              <Zap className="h-7 w-7" />
            </span>
            AutoOps
          </Link>
          <h1 className="max-w-md text-5xl font-semibold tracking-tight">Create your control-plane workspace.</h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-white/75">
            Register a user, create an organization workspace, and start operating projects,
            environments, and simulation deployments.
          </p>
        </section>

        <section className="w-full md:justify-self-end">
          <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-white/15 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm text-white/65 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
            <h2 className="text-3xl font-light tracking-tight">Create an AutoOps account</h2>
            <p className="mt-2 text-sm text-white/65">Use real registration backed by the AutoOps auth API.</p>

            <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined, form: undefined }));
                }} placeholder="Pramod S S" className="h-11 rounded border-white/20 bg-[#11131f]/90" />
                {errors.name ? <p className="text-xs text-rose-200">{errors.name}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input id="register-email" type="email" value={email} onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((current) => ({ ...current, email: undefined, form: undefined }));
                }} placeholder="you@example.com" className="h-11 rounded border-white/20 bg-[#11131f]/90" />
                {errors.email ? <p className="text-xs text-rose-200">{errors.email}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input id="organization" value={organizationName} onChange={(event) => {
                  setOrganizationName(event.target.value);
                  setErrors((current) => ({ ...current, organizationName: undefined, form: undefined }));
                }} placeholder="AutoOps Workspace" className="h-11 rounded border-white/20 bg-[#11131f]/90" />
                {errors.organizationName ? <p className="text-xs text-rose-200">{errors.organizationName}</p> : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <Input id="register-password" type="password" value={password} onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({ ...current, password: undefined, form: undefined }));
                  }} className="h-11 rounded border-white/20 bg-[#11131f]/90" />
                  {errors.password ? <p className="text-xs text-rose-200">{errors.password}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm</Label>
                  <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setErrors((current) => ({ ...current, confirmPassword: undefined, form: undefined }));
                  }} className="h-11 rounded border-white/20 bg-[#11131f]/90" />
                  {errors.confirmPassword ? <p className="text-xs text-rose-200">{errors.confirmPassword}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 text-xs text-white/65">
                    <CheckCircle2 className={check.passed ? 'h-3.5 w-3.5 text-emerald-300' : 'h-3.5 w-3.5 text-white/25'} />
                    {check.label}
                  </div>
                ))}
              </div>

              {successMessage ? (
                <div className="rounded border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-50">
                  {successMessage}
                </div>
              ) : null}

              {errors.form ? (
                <div className="rounded border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                  {errors.form}
                </div>
              ) : null}

              <Button className="h-12 w-full rounded bg-blue-500 text-base font-semibold text-white hover:bg-blue-400" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
