import type { Metadata } from "next";
import { Field, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.legal.impressumTitle} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/impressum", en: "/en/impressum" } },
  };
}

export default async function Impressum() {
  const t = await getDictionary();
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <LegalPage title={t.legal.impressumTitle}>
      <h2>{en ? "Operator" : "Betreiber"}</h2>
      <p>
        <Field value={LEGAL.operator} />
        <br />
        <Field value={en ? LEGAL.legalFormEn : LEGAL.legalForm} />
        <br />
        <Field value={LEGAL.street} />
        <br />
        <Field value={LEGAL.city} />
        <br />
        {en ? "Switzerland" : LEGAL.country}
      </p>

      <h2>{en ? "Contact" : "Kontakt"}</h2>
      <p>
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>{en ? "Responsible person" : "Verantwortliche Person"}</h2>
      <p>
        <Field value={LEGAL.responsiblePerson} />
      </p>

      <h2>Register</h2>
      <p>
        <Field value={en ? LEGAL.registerEn : LEGAL.register} />
        {LEGAL.uid && (
          <>
            <br />
            <Field value={LEGAL.uid} />
          </>
        )}
      </p>

      {en ? (
        <>
          <h2>Disclaimer</h2>
          <p>
            {BRAND.name} is a user interface for smart contracts on the Base blockchain and is in a beta phase. The
            smart contracts are publicly viewable but have not been externally audited yet. Use is at your own
            risk; a partial or total loss of the funds you deposit is possible, for example through software bugs,
            problems with the protocols used (Aave, Uniswap, Chainlink, Coinbase cbBTC) or price movements.
          </p>
          <p>
            The content of this website is not investment, legal or tax advice and is not an offer to buy or sell
            financial instruments. Yields shown are variable or examples and not a promise.
          </p>
          <p>The operators of external links (e.g. block explorers, GitHub) are solely responsible for their content.</p>

          <h2>Copyright</h2>
          <p>
            The source code of the smart contracts and the website is licensed under the MIT license. The Hamstr
            mascot and design are owned by the operator.
          </p>
        </>
      ) : (
        <>
          <h2>Haftungsausschluss</h2>
          <p>
            {BRAND.name} ist eine Benutzeroberfläche für Smart Contracts auf der Base-Blockchain und befindet sich in
            einer Beta-Phase. Die Smart Contracts sind öffentlich einsehbar, wurden aber noch nicht extern auditiert.
            Die Nutzung erfolgt auf eigenes Risiko; ein teilweiser oder vollständiger Verlust der eingesetzten Mittel
            ist möglich, etwa durch Programmfehler, Probleme bei genutzten Protokollen (Aave, Uniswap, Chainlink,
            Coinbase cbBTC) oder Kursschwankungen.
          </p>
          <p>
            Die Inhalte dieser Website stellen keine Anlage-, Rechts- oder Steuerberatung dar und sind kein Angebot
            zum Kauf oder Verkauf von Finanzinstrumenten. Angezeigte Renditen sind variabel bzw. Beispiele und keine
            Zusicherung.
          </p>
          <p>
            Für Inhalte externer Links (z. B. Block-Explorer, GitHub) sind ausschliesslich deren Betreiber
            verantwortlich.
          </p>

          <h2>Urheberrecht</h2>
          <p>
            Der Quellcode der Smart Contracts und der Website steht unter der MIT-Lizenz. Das Hamstr-Maskottchen und
            das Design sind Eigentum des Betreibers.
          </p>
        </>
      )}
    </LegalPage>
  );
}
