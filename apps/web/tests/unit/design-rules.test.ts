// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The design rules in CLAUDE.md and docs/style-guide.md, checked in the source so they hold
// without anyone remembering them: no gradients, no glass effects, no shadows, no large rounding,
// no colours outside the tokens, no emoji in the interface.

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SOURCE_DIRS = ["app", "components", "lib"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

// Comments may name what's forbidden, and globals.css switches Tailwind's defaults off with
// `--blur-*: initial;`, so both are removed before checking.
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--[a-z-]+-\*:\s*initial;\s*$/gm, "");
}

const SOURCES = SOURCE_DIRS.flatMap((d) => files(join(ROOT, d))).map((path) => ({
  path: relative(ROOT, path).replaceAll("\\", "/"),
  text: code(readFileSync(path, "utf8")),
}));

const RULES: [string, RegExp][] = [
  [
    "gradients",
    /\b(bg-gradient-|bg-linear-|bg-radial-|bg-conic-)|(linear|radial|conic)-gradient\(/,
  ],
  ["glass and blur effects", /\bbackdrop-blur|\bblur-|backdrop-filter/],
  ["shadows", /\b(shadow|drop-shadow)-(?!none)[a-z0-9[]|box-shadow:(?!\s*none)/],
  ["rounding beyond 2px", /\brounded-(md|lg|xl|2xl|3xl|full)\b|\brounded\b(?!-)/],
  ["emoji", /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u],
];

describe("design rules", () => {
  it("finds the source files", () => {
    expect(SOURCES.length).toBeGreaterThan(5);
  });

  it.each(RULES)("no %s", (_name, pattern) => {
    const offenders = SOURCES.filter((f) => pattern.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("colours come only from the tokens in globals.css", () => {
    // A hex colour anywhere else (a style prop, an arbitrary class like text-[#333]) bypasses
    // the palette and its contrast checks. layout.tsx may repeat the paper colours for the
    // browser's theme-color, which can't read CSS variables, and the briefing email inlines the
    // light theme's colours (email clients ignore stylesheets); the next test keeps them in step.
    const allowed = new Set(["app/globals.css", "app/layout.tsx", "lib/briefing.ts"]);
    const offenders = SOURCES.filter(
      (f) => !allowed.has(f.path) && /#[0-9a-f]{3,8}\b/i.test(f.text),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the briefing email uses the light theme's colours exactly", () => {
    const css = SOURCES.find((f) => f.path === "app/globals.css")!.text;
    const email = SOURCES.find((f) => f.path === "lib/briefing.ts")!.text;
    const palette = email.match(/const C = {([^}]*)}/)![1];
    for (const [, name, hex] of palette.matchAll(/(w+): "(#[0-9a-f]{6})"/gi)) {
      const token = name === "muted" ? "ink-muted" : name;
      expect(css, `--${token}`).toMatch(new RegExp(`--${token}: ${hex};`, "i"));
    }
  });
});
