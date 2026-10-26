import type { Metadata } from "next";
import { Field, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Datenschutz – ${BRAND.name}`,
};

export default function Datenschutz() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Diese Erklärung beschreibt, welche Personendaten beim Besuch dieser Website und bei der Nutzung der
        {" "}
        {BRAND.name}-App bearbeitet werden. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG) und,
        soweit anwendbar, der EU-Datenschutz-Grundverordnung (DSGVO).
      </p>

      <h2>Verantwortlich</h2>
      <p>
        <Field value={LEGAL.operator} />, <Field value={LEGAL.street} />, <Field value={LEGAL.city} />,{" "}
        {LEGAL.country}
        <br />
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>Kurz zusammengefasst</h2>
      <ul>
        <li>Kein Benutzerkonto, keine Registrierung, keine Angabe von Name oder E-Mail nötig.</li>
        <li>Keine Cookies, kein Tracking, keine Analyse- oder Werbedienste.</li>
        <li>Schriften werden von unserem eigenen Server ausgeliefert, nicht von Google.</li>
        <li>
          Transaktionen auf der Blockchain sind öffentlich und dauerhaft – das ist eine Eigenschaft der
          Blockchain, nicht dieser Website.
        </li>
      </ul>

      <h2>Hosting (Vercel)</h2>
      <p>
        Die Website wird bei Vercel Inc., USA, gehostet. Beim Aufruf verarbeitet Vercel technisch notwendige
        Daten wie IP-Adresse, Zeitpunkt, aufgerufene Seite und Browser-Angaben in Server-Protokollen, um die
        Seite auszuliefern und vor Missbrauch zu schützen. Die Übermittlung in die USA erfolgt auf Grundlage
        des Swiss-U.S. bzw. EU-U.S. Data Privacy Framework bzw. von Standardvertragsklauseln. Rechtsgrundlage
        ist unser berechtigtes Interesse an einem sicheren Betrieb.
      </p>

      <h2>Verbindung mit einer Wallet</h2>
      <p>
        Wenn du eine Wallet verbindest, liest die App deine öffentliche Wallet-Adresse sowie Guthaben und
        Positionen in den {BRAND.name}-Contracts. Diese Daten stehen ohnehin öffentlich auf der Blockchain. Wir
        speichern sie nicht auf eigenen Servern.
      </p>
      <ul>
        <li>
          <b>Blockchain-Abfragen:</b> Dein Browser sendet Leseanfragen und signierte Transaktionen an einen
          RPC-Knoten des Base-Netzwerks (standardmässig <code>mainnet.base.org</code>, betrieben von Coinbase).
          Dabei sind deine IP-Adresse und deine Wallet-Adresse für den Betreiber des Knotens sichtbar.
        </li>
        <li>
          <b>Anmeldung mit Passkey (Base Account):</b> Diese Wallet wird von Coinbase bereitgestellt. Die
          Anmeldung läuft in einem Fenster von Coinbase; es gilt deren Datenschutzerklärung. Wir erhalten nur
          deine Wallet-Adresse, keine biometrischen Daten.
        </li>
        <li>
          <b>Browser-Wallets</b> (z. B. MetaMask): Es gelten die Datenschutzbestimmungen des jeweiligen
          Anbieters.
        </li>
      </ul>

      <h2>Speicher in deinem Browser</h2>
      <p>
        Die App speichert im lokalen Speicher deines Browsers (localStorage), welche Wallet zuletzt verbunden
        war und dass du den Beta-Hinweis bestätigt hast. Diese Angaben verlassen deinen Browser nicht. Du
        kannst sie jederzeit über die Einstellungen deines Browsers löschen.
      </p>

      <h2>Blockchain-Daten</h2>
      <p>
        Ein- und Auszahlungen sowie das Abholen von Bitcoin sind Transaktionen auf der öffentlichen
        Base-Blockchain. Sie sind für alle einsehbar und können technisch nicht gelöscht oder geändert werden.
        Ein Löschbegehren kann sich daher nicht auf Blockchain-Daten erstrecken.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Bearbeitung deiner
        Personendaten, soweit wir solche bearbeiten, sowie auf Datenherausgabe. Wende dich dafür an{" "}
        <Field value={LEGAL.email} />. Du kannst dich zudem beim Eidgenössischen Datenschutz- und
        Öffentlichkeitsbeauftragten (EDÖB) bzw. bei der zuständigen Aufsichtsbehörde in deinem Land
        beschweren.
      </p>

      <h2>Änderungen</h2>
      <p>Wir passen diese Erklärung an, wenn sich die App ändert. Stand: {LEGAL.lastUpdated}.</p>
    </LegalPage>
  );
}
