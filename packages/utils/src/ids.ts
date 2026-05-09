import { randomUUID, randomBytes } from 'node:crypto';

export const newId = (): string => randomUUID();

/**
 * URL-safe random token (e.g., refresh tokens, invite codes).
 * Default 32 bytes ⇒ 256 bits of entropy.
 */
export const newToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}
