// Where to send a reader after signing in. Only paths on this site are allowed, so a crafted link
// can't bounce someone to another site ("//evil.example", "https://...", "/\\evil.example").

export const DEFAULT_AFTER_SIGN_IN = "/";

export function safeNext(value: string | null | undefined): string {
  if (!value || value.length > 512) return DEFAULT_AFTER_SIGN_IN;
  if (!value.startsWith("/")) return DEFAULT_AFTER_SIGN_IN;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_AFTER_SIGN_IN;
  if (/[\u0000-\u001f\\]/.test(value)) return DEFAULT_AFTER_SIGN_IN;
  return value;
}
