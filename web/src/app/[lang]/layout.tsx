import type { Metadata } from "next";
import { Inter, M_PLUS_Rounded_1c } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "../providers";
import { BRAND } from "@/lib/brand";
import { LOCALES } from "@/i18n";
import { LocaleProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
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

// Absolute URLs for hreflang links; Vercel sets this for production deployments.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    metadataBase: new URL(siteUrl),
    title: `${BRAND.name} – ${t.brand.tagline}`,
    description: t.brand.description,
    alternates: { languages: { de: "/de", en: "/en" } },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <Providers>{children}</Providers>
        </LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
