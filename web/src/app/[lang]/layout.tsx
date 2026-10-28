import type { Metadata } from "next";
import { Inter, M_PLUS_Rounded_1c } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "../providers";
import { BRAND } from "@/lib/brand";
import { LOCALES } from "@/i18n";
import { LocaleProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "../globals.css";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = M_PLUS_Rounded_1c({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

// Absolute URLs for hreflang links and link previews. Production uses the real domain
// (the bare hamstr.online only redirects); previews use their Vercel URL.
const siteUrl =
  process.env.VERCEL_ENV === "production"
    ? "https://www.hamstr.online"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  const locale = await getLocale();
  const title = `${BRAND.name} – ${t.brand.tagline}`;
  // Link preview for X, WhatsApp & co.; icons come from app/icon.png and app/apple-icon.png.
  const og = locale === "de" ? "/brand/og-de.jpg" : "/brand/og-en.jpg";
  return {
    metadataBase: new URL(siteUrl),
    title,
    description: t.brand.description,
    alternates: { languages: { de: "/de", en: "/en" } },
    openGraph: {
      title,
      description: t.brand.description,
      url: `/${locale}`,
      siteName: BRAND.name,
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", site: "@HamstrFI", images: [og] },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html> before React hydrates.
    <html lang={locale} className={`${body.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <Providers>{children}</Providers>
        </LocaleProvider>
        {/* Cookieless page-view statistics; described in the privacy policy. */}
        <Analytics />
      </body>
    </html>
  );
}
