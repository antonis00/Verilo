// The local Supabase catches every email in Mailpit instead of sending it. Tests read the
// sign-in link from there, so the whole flow is exercised, email included.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; To: { Address: string }[]; Created: string };

export async function signInLinkFor(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages: Summary[] };
      if (messages.length) {
        const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
        const { HTML } = (await message.json()) as { HTML: string };
        const href = HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
        if (href) return href.replaceAll("&amp;", "&");
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No sign-in email for ${email} within ${timeoutMs} ms`);
}
