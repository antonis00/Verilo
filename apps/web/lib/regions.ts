// Regions readers choose in "Places", and countries outlets are based in. The codes match
// workers/verilo_workers/ingest/registry.py (REGION_OF) and the database's constraints.

export const REGIONS = [
  { code: "north-america", label: "North America" },
  { code: "uk-ireland", label: "UK and Ireland" },
  { code: "europe", label: "Europe" },
  { code: "middle-east", label: "Middle East" },
  { code: "africa", label: "Africa" },
  { code: "south-asia", label: "South Asia" },
  { code: "east-asia", label: "East Asia" },
  { code: "southeast-asia", label: "Southeast Asia" },
  { code: "oceania", label: "Australia and New Zealand" },
  { code: "latin-america", label: "Latin America" },
] as const;

// Outlets with no single home region (none are offered as a place to follow).
export const INTERNATIONAL = { code: "international", label: "International" } as const;

export type RegionCode = (typeof REGIONS)[number]["code"] | typeof INTERNATIONAL.code;

export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  [...REGIONS, INTERNATIONAL].map((r) => [r.code, r.label]),
);

export const REGION_CODES = new Set<string>(REGIONS.map((r) => r.code));

export const COUNTRY_LABEL: Record<string, string> = {
  US: "US",
  CA: "Canada",
  GB: "UK",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  BE: "Belgium",
  UA: "Ukraine",
  NL: "Netherlands",
  IT: "Italy",
  ES: "Spain",
  PL: "Poland",
  QA: "Qatar",
  AE: "UAE",
  SA: "Saudi Arabia",
  IL: "Israel",
  TR: "Turkey",
  ZA: "South Africa",
  KE: "Kenya",
  NG: "Nigeria",
  GH: "Ghana",
  IN: "India",
  PK: "Pakistan",
  BD: "Bangladesh",
  LK: "Sri Lanka",
  JP: "Japan",
  KR: "South Korea",
  HK: "Hong Kong",
  TW: "Taiwan",
  SG: "Singapore",
  PH: "Philippines",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  AU: "Australia",
  NZ: "New Zealand",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CO: "Colombia",
  INT: "International",
};
