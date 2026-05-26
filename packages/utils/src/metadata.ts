const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_KEYS = 25;
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|credential|authorization|cookie|kubeconfig|accesskey|access_key|secretkey|secret_key|apitoken|api_token|privatekey|private_key|clientsecret|client_secret|session|bearer)/i;

export type CuratedMetadata = Record<string, string | number | boolean | null>;

/**
 * Sanitizes and curates metadata for Resource Graph and Signals.
 * Strips secrets, caps string lengths, and limits total key count.
 */
export function sanitizeMetadata(value: unknown): CuratedMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
  const summary: CuratedMetadata = {};

  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim().slice(0, 80);
    if (!key) continue;

    if (SENSITIVE_KEY_PATTERN.test(key)) {
      summary[key] = REDACTED;
      continue;
    }

    if (rawValue === null || typeof rawValue === 'boolean' || typeof rawValue === 'number') {
      summary[key] = rawValue;
      continue;
    }

    if (typeof rawValue === 'string') {
      summary[key] = SENSITIVE_KEY_PATTERN.test(rawValue) ? REDACTED : rawValue.slice(0, MAX_STRING_LENGTH);
      continue;
    }

    if (Array.isArray(rawValue)) {
      summary[key] = `[${rawValue.length} items]`;
      continue;
    }

    if (typeof rawValue === 'object') {
      summary[key] = '[object]';
    }
  }

  return summary;
}
