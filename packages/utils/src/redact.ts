import { SecretValue } from './secret-provider.js';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PARTS = [
  'token',
  'secret',
  'password',
  'authorization',
  'api_key',
  'apikey',
  'access_key',
  'private_key',
  'kubeconfig',
  'cookie',
  'session',
  'credential',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function redactSecrets<T>(value: T): T | string {
  const seen = new WeakSet<object>();

  function visit(input: unknown): unknown {
    if (input instanceof SecretValue) return REDACTED;
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input);

    if (input instanceof URL) {
      const copy = new URL(input.toString());
      if (copy.username || copy.password) {
        copy.username = REDACTED;
        copy.password = REDACTED;
      }
      return copy.toString();
    }

    if (input instanceof Error) {
      return { name: input.name, message: REDACTED };
    }

    if (Array.isArray(input)) {
      return input.map((item) => visit(item));
    }

    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : visit(item),
      ]),
    );
  }

  return visit(value) as T | string;
}
