// Who runs the site and how to reach them, in one place (the privacy policy, the footer).
// NEXT_PUBLIC_CONTACT_EMAIL is the address for privacy and other requests; until it is set, pages
// say contact details are coming rather than show a made-up address.
export const SITE_NAME = "Verilo";

export function contactEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return email ? email : null;
}
