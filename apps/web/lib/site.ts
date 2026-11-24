// Who runs the site and how to reach them, in one place (the privacy policy, the terms, the
// footer). Each value is a setting; until it is set, pages say the detail will be published
// before launch rather than show something made up.
export const SITE_NAME = "Verilo";

function setting(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

// The address for privacy and other requests.
export function contactEmail(): string | null {
  return setting(process.env.NEXT_PUBLIC_CONTACT_EMAIL);
}

// Who operates Verilo: a person's or a company's legal name, and where it is established.
export function operatorName(): string | null {
  return setting(process.env.NEXT_PUBLIC_OPERATOR);
}

// The law that governs the terms, and the courts for disputes: "the State of Qatar", say.
export function governingLaw(): string | null {
  return setting(process.env.NEXT_PUBLIC_GOVERNING_LAW);
}
