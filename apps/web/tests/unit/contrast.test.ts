// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the colour tokens straight from globals.css, so a palette change that breaks WCAG contrast
// fails here rather than in a Lighthouse run later.

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi))
    out[m[1]] = m[2].toLowerCase();
  return out;
}

function block(start: string, end: string): string {
  const from = css.indexOf(start);
  if (from < 0) throw new Error(`globals.css has no ${start} block`);
  return css.slice(from, css.indexOf(end, from + start.length));
}

const light = tokens(block(":root {", "}"));
// Dark mode is defined twice: for "Auto" under the system's dark setting, and for the switch.
const darkAuto = tokens(block("@media (prefers-color-scheme: dark)", "}"));
const dark = tokens(block(':root[data-theme="dark"]', "}"));

it("the switch's dark theme matches the system's", () => {
  expect(Object.keys(dark).length).toBeGreaterThan(5);
  expect(darkAuto).toEqual(dark);
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]
const PAIRS: [string, string, number][] = [
  ["ink", "paper", 7], // body text: AAA
  ["ink", "paper-raised", 7],
  ["ink-muted", "paper", 4.5], // secondary text: AA
  ["ink-muted", "paper-raised", 4.5],
  ["accent", "paper", 4.5], // kickers, error text
  ["on-accent", "accent", 4.5], // text on the accent (selection)
  ["paper", "ink", 7], // the solid button
  ["ink-muted", "paper-raised", 3], // field borders: non-text UI, 3:1
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (_name, theme) => {
  it("defines every token", () => {
    for (const name of [
      "paper",
      "paper-raised",
      "ink",
      "ink-muted",
      "rule",
      "accent",
      "on-accent",
    ]) {
      expect(theme[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
  });
});
