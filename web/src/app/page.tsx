import Link from "next/link";
import { Hamster } from "@/components/Hamster";
import { Logo } from "@/components/Logo";
import { LegalFooter } from "@/components/LegalFooter";
import { BRAND } from "@/lib/brand";
import { VAULTS } from "@/lib/vaults";

const STEPS = [
  {
    mood: "sparkle" as const,
    title: "Einzahlen",
    text: "Login mit Face ID oder Fingerabdruck. Keine Seed-Phrase, keine Extension. Dollar, ETH oder Bitcoin – direkt per Karte kaufbar.",
  },
  {
    mood: "happy" as const,
    title: "Zinsen verdienen",
    text: "Dein Kapital wird bei Aave verliehen, einem der größten DeFi-Protokolle. Kein eigener Token, keine Fantasie-Rendite.",
  },
  {
    mood: "wink" as const,
    title: "Bitcoin sammeln",
    text: "Die Erträge werden automatisch zu Bitcoin (cbBTC). Du siehst jeden Tag, wie deine Backentaschen voller werden.",
  },
];

const FEES = [
  { label: "Einzahlung", value: "0 %" },
  { label: "Auszahlung", value: "0 %" },
  { label: "Performance-Fee", value: "10 %", note: "nur auf Gewinn, mit High-Water-Mark" },
  { label: "Management-Fee", value: "0 %" },
];

const SAFETY = [
  {
    title: "Du behältst die Kontrolle",
    text: "Non-custodial: Dein Guthaben liegt im Smart Contract, nicht bei uns. Auszahlen geht jederzeit – auch wenn der Vault pausiert ist.",
  },
  {
    title: "Gebühren im Code gedeckelt",
    text: "Maximal 20 % Performance- und 2 % Management-Fee – fest im Contract. Jede Änderung wird per Timelock vorher angekündigt.",
  },
  {
    title: "Vorsichtiger Start",
    text: "In der Beta sind Einzahlungen pro Person und insgesamt gedeckelt. Ein Notfall-Multisig kann alles aus der Strategie zurückholen.",
  },
  {
    title: "Offen und prüfbar",
    text: "Basiert auf geprüftem OpenZeppelin-Code. Der Quellcode ist öffentlich. Status des externen Audits: ausstehend.",
  },
];

const FAQ = [
  {
    q: "Woher kommt die Rendite?",
    a: "Aus Zinsen von Leuten, die bei Aave Geld leihen. Nicht aus neuen Einzahlungen und nicht aus einem eigenen Token. Die Zinsen werden über Uniswap in Bitcoin getauscht – nur zu einem Kurs nahe am Chainlink-Marktpreis.",
  },
  {
    q: "Was ist cbBTC?",
    a: "Bitcoin auf der Base-Blockchain, 1:1 gedeckt durch echte Bitcoin bei Coinbase. Du kannst ihn jederzeit halten, tauschen oder bei Coinbase in normale Bitcoin umwandeln.",
  },
  {
    q: "Kann ich Geld verlieren?",
    a: "Ja. Smart Contracts können Fehler haben, Protokolle wie Aave können Probleme bekommen, und Kurse schwanken. Zahl nur ein, was du verkraften kannst – besonders in der Beta.",
  },
  {
    q: "Warum ein Hamster?",
    a: "Weil Hamster im Sommer Vorräte bunkern, damit sie gut durch den Winter kommen. Genau das machen wir mit Bitcoin.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            <a href="#so-gehts" className="hover:text-ink">So geht&apos;s</a>
            <a href="#vaults" className="hover:text-ink">Vaults</a>
            <a href="#gebuehren" className="hover:text-ink">Gebühren</a>
            <a href="#sicherheit" className="hover:text-ink">Sicherheit</a>
          </nav>
          <Link href="/app" className="btn btn-primary !py-2 text-sm">
            App öffnen
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="screentone border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">
                <span className="h-2 w-2 rounded-full bg-good" />
                Beta auf Base · Einzahlungen gedeckelt
              </span>
              <h1 className="font-display mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
                Bitcoin hamstern.
                <br />
                <span className="text-btc">Automatisch.</span>
              </h1>
              <p className="mt-5 max-w-md text-lg text-muted">{BRAND.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app" className="btn btn-primary">
                  Jetzt hamstern
                </Link>
                <a href="#so-gehts" className="btn btn-ghost">
                  Wie funktioniert das?
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
                <li>✓ Jederzeit auszahlen</li>
                <li>✓ Gebühren on-chain</li>
                <li>✓ Kein eigener Token</li>
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div className="bubble absolute -top-2 left-2 z-10 text-sm md:-left-6">
                Ich bunker Sats für den Winter!
              </div>
              <div className="float mx-auto mt-10 aspect-square w-72 rounded-full bg-surface-2 p-4 md:w-80">
                <Hamster size={288} sparkles className="h-full w-full" />
              </div>
              <div className="card absolute -bottom-4 right-0 px-4 py-3 md:-right-6">
                <div className="text-xs font-semibold text-muted">Heute gehamstert</div>
                <div className="num font-display text-lg font-extrabold text-good">+1’240 sats</div>
                <div className="text-[10px] text-muted">Beispiel</div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="so-gehts" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">So geht&apos;s</h2>
          <p className="mt-2 text-muted">Drei Schritte. Den Rest macht der Hamster.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center gap-3">
                  <Hamster size={64} mood={s.mood} coin={i === 2} title="" />
                  <span className="font-display text-sm font-extrabold text-btc-ink">Schritt {i + 1}</span>
                </div>
                <h3 className="font-display mt-4 text-xl font-extrabold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Vaults */}
        <section id="vaults" className="border-y border-line bg-surface-2/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">Wähl deinen Hamster</h2>
            <p className="mt-2 text-muted">Alle Vaults zahlen die Rendite in Bitcoin aus.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {VAULTS.map((v) => (
                <div key={v.id} className="card flex flex-col p-6">
                  <div className="flex items-start justify-between">
                    <Hamster size={72} mood={v.mood} title="" />
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">
                      Risiko {v.risk}
                    </span>
                  </div>
                  <h3 className="font-display mt-3 text-xl font-extrabold">{v.name}</h3>
                  <p className="mt-1 text-sm text-muted">{v.summary}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Einzahlen</dt>
                      <dd className="font-bold">{v.deposit}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Rendite in</dt>
                      <dd className="font-bold text-btc-ink">{v.payout}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Quelle</dt>
                      <dd className="font-bold">{v.source}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">APY (Beispiel)</dt>
                      <dd className="num font-bold">{v.apy.toFixed(1)} %</dd>
                    </div>
                  </dl>
                  <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{v.riskNote}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Fees */}
        <section id="gebuehren" className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">Gebühren, die du verstehst</h2>
            <p className="mt-3 text-muted">
              Wir verdienen nur, wenn du verdienst. Machst du Verlust, zahlst du nichts – und wir
              verlangen erst wieder etwas, wenn dein früherer Höchststand übertroffen ist.
            </p>
            <div className="card mt-6 p-5">
              <div className="text-sm font-semibold text-muted">Beispiel</div>
              <p className="mt-2">
                Dein Geld verdient <b className="num">100 $</b> Zinsen.
              </p>
              <div className="mt-3 flex h-4 overflow-hidden rounded-full">
                <div className="bg-btc" style={{ width: "90%" }} />
                <div className="bg-blush" style={{ width: "10%" }} />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>
                  <b className="num">90 $</b> werden zu Bitcoin für dich
                </span>
                <span className="text-muted">
                  <b className="num">10 $</b> an {BRAND.name}
                </span>
              </div>
            </div>
          </div>
          <div className="card divide-y divide-line self-start">
            {FEES.map((f) => (
              <div key={f.label} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="font-semibold">{f.label}</div>
                  {f.note && <div className="text-xs text-muted">{f.note}</div>}
                </div>
                <div className="num font-display text-2xl font-extrabold">{f.value}</div>
              </div>
            ))}
            <div className="px-5 py-3 text-xs text-muted">
              Obergrenzen fest im Smart Contract: max. 20 % Performance-, max. 2 % Management-Fee pro Jahr.
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="sicherheit" className="screentone border-y border-line">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">Süß, aber nicht naiv</h2>
            <p className="mt-2 text-muted">Wie wir dein Geld schützen – und was du wissen musst.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SAFETY.map((s) => (
                <div key={s.title} className="card p-6">
                  <h3 className="font-display text-lg font-extrabold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">Fragen</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                  {f.q}
                  <span className="text-btc transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="card flex flex-col items-center gap-6 bg-surface-2 p-8 text-center md:flex-row md:text-left">
            <Hamster size={120} mood="happy" sparkles />
            <div className="flex-1">
              <h2 className="font-display text-2xl font-extrabold md:text-3xl">Der Winter kommt bestimmt.</h2>
              <p className="mt-1 text-muted">Fang heute an zu hamstern – schon ab 10 $.</p>
            </div>
            <Link href="/app" className="btn btn-primary">
              Jetzt hamstern
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
