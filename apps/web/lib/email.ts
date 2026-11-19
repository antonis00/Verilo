// A deliberately simple check: the email service is the real judge, this only catches typos early.
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailCheck = { ok: true; email: string } | { ok: false; message: string };

export function validateEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, message: "Enter your email address." };
  if (email.length > 254 || !SHAPE.test(email)) {
    return {
      ok: false,
      message: "That doesn't look like an email address. Check it and try again.",
    };
  }
  return { ok: true, email };
}
