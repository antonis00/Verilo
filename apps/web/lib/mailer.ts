import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Sending email through any SMTP service: Mailpit locally (`npx supabase start`, port 54325),
// Resend, Postmark or another in production, chosen by settings alone:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, BRIEFING_FROM ("Verilo <briefing@…>").
// Port 465 means TLS from the start; other ports upgrade with STARTTLS when the server offers it.
// Without SMTP_HOST, nothing is sent and the run says so.

export type Message = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

let transport: Transporter | null = null;

function transporter(): Transporter {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
    });
  }
  return transport;
}

export async function send(message: Message): Promise<void> {
  await transporter().sendMail({
    from: process.env.BRIEFING_FROM ?? "Verilo <briefing@localhost>",
    ...message,
  });
}
