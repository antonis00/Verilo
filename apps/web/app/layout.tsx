import type { Metadata, Viewport } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import { Masthead } from "@/components/masthead";
import { SiteFooter } from "@/components/site-footer";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Both fonts are downloaded at build time and served from this site, never from Google at runtime.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title: {
    default: "Verilo: your front page, from sources you trust",
    template: "%s · Verilo",
  },
  description:
    "A personal newspaper built around stories, not duplicate articles, with checked summaries that link to every source.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT may set data-theme on <html> before React loads.
    <html
      lang="en"
      className={`${newsreader.variable} ${publicSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="button sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10"
        >
          Skip to content
        </a>
        <Masthead />
        <main id="main" className="page flex-1 pt-8 pb-16 md:pt-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
