// The local Supabase catches every email in Mailpit instead of sending it. Tests read the
// sign-in link from there, so the whole flow is exercised, email included.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; To: { Address: string }[]; Created: string };

// The newest sign-in link sent to `email`, waiting for it to arrive. With `sentAfter`, only an
// email sent after that moment counts, so a second sign-in never picks up the first, already
// used link.
export async function signInLinkFor(
  email: string,
  options: { timeoutMs?: number; sentAfter?: number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: Summary[] };
      const fresh = messages.filter(
        (m) => !options.sentAfter || Date.parse(m.Created) >= options.sentAfter - 1000,
      );
      if (fresh.length) {
        const message = await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`);
        const { HTML } = (await message.json()) as { HTML: string };
        const href = HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
        if (href) return href.replaceAll("&amp;", "&");
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No sign-in email for ${email} within ${timeoutMs} ms`);
}

export type Email = { Subject: string; HTML: string; Text: string; ID: string };

// The newest email to `email` whose subject matches, sent after `sentAfter`, waiting for it.
export async function emailTo(
  email: string,
  options: { subject: RegExp; sentAfter: number; timeoutMs?: number },
): Promise<Email> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as {
        messages: (Summary & { Subject: string })[];
      };
      const found = messages.find(
        (m) => options.subject.test(m.Subject) && Date.parse(m.Created) >= options.sentAfter - 1000,
      );
      if (found)
        return (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()) as Email;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email matching ${options.subject} for ${email}`);
}

// Whether any email to `email` with a matching subject was sent after `sentAfter`.
export async function anyEmailTo(email: string, subject: RegExp, sentAfter: number) {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  const { messages } = (await search.json()) as { messages: (Summary & { Subject: string })[] };
  return messages.some((m) => subject.test(m.Subject) && Date.parse(m.Created) >= sentAfter - 1000);
}
