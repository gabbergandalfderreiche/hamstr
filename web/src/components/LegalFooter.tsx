import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-muted md:flex-row md:items-start md:justify-between">
        <p className="max-w-2xl">
          {BRAND.name} ist Beta-Software. Krypto-Assets sind volatil, Smart Contracts können Fehler enthalten,
          ein Totalverlust ist möglich. Keine Anlageberatung. Angezeigte Renditen sind Beispiele bzw. variabel
          und keine Garantie für die Zukunft.
        </p>
        <nav className="flex shrink-0 gap-4 font-semibold">
          <Link href="/impressum" className="hover:text-ink">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-ink">
            Datenschutz
          </Link>
          <a href="https://github.com/gabbergandalfderreiche/hamstr" className="hover:text-ink">
            Quellcode
          </a>
        </nav>
      </div>
    </footer>
  );
}
