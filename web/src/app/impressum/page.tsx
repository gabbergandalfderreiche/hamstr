import type { Metadata } from "next";
import { Field, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Impressum – ${BRAND.name}`,
};

export default function Impressum() {
  return (
    <LegalPage title="Impressum">
      <h2>Betreiber</h2>
      <p>
        <Field value={LEGAL.operator} />
        <br />
        <Field value={LEGAL.legalForm} />
        <br />
        <Field value={LEGAL.street} />
        <br />
        <Field value={LEGAL.city} />
        <br />
        {LEGAL.country}
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>Verantwortliche Person</h2>
      <p>
        <Field value={LEGAL.responsiblePerson} />
      </p>

      <h2>Register</h2>
      <p>
        <Field value={LEGAL.register} />
        <br />
        <Field value={LEGAL.uid} />
      </p>

      <h2>Haftungsausschluss</h2>
      <p>
        {BRAND.name} ist eine Benutzeroberfläche für Smart Contracts auf der Base-Blockchain und befindet
        sich in einer Beta-Phase. Die Smart Contracts sind öffentlich einsehbar, wurden aber noch nicht extern
        auditiert. Die Nutzung erfolgt auf eigenes Risiko; ein teilweiser oder vollständiger Verlust der
        eingesetzten Mittel ist möglich, etwa durch Programmfehler, Probleme bei genutzten Protokollen (Aave,
        Uniswap, Chainlink, Coinbase cbBTC) oder Kursschwankungen.
      </p>
      <p>
        Die Inhalte dieser Website stellen keine Anlage-, Rechts- oder Steuerberatung dar und sind kein
        Angebot zum Kauf oder Verkauf von Finanzinstrumenten. Angezeigte Renditen sind variabel bzw. Beispiele
        und keine Zusicherung.
      </p>
      <p>
        Für Inhalte externer Links (z. B. Block-Explorer, GitHub) sind ausschliesslich deren Betreiber
        verantwortlich.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Der Quellcode der Smart Contracts und der Website steht unter der MIT-Lizenz. Das Hamstr-Maskottchen
        und das Design sind Eigentum des Betreibers.
      </p>
    </LegalPage>
  );
}
