/** German texts. This is the reference dictionary: en.ts must provide the same keys. */
export const de = {
  langName: "Deutsch",
  numberLocale: "de-CH",

  brand: {
    tagline: "Bitcoin hamstern. Automatisch.",
    description:
      "Zahl Dollar, ETH oder Bitcoin ein. Dein Kapital bleibt, wo es ist – die Zinsen werden automatisch zu Bitcoin.",
    mascot: "Hamstr Maskottchen",
    homeLabel: (brand: string) => `${brand} Startseite`,
  },

  nav: {
    how: "So geht's",
    vaults: "Vaults",
    calc: "Rechner",
    safety: "Sicherheit",
    openApp: "App öffnen",
    toApp: "Zur App",
    language: "Sprache",
  },

  landing: {
    badge: "Beta auf Base · Einzahlungen gedeckelt",
    heroLine1: "Bitcoin hamstern.",
    heroLine2: "Automatisch.",
    ctaPrimary: "Jetzt hamstern",
    ctaSecondary: "Wie funktioniert das?",
    trust: ["Jederzeit auszahlen", "Gebühren on-chain", "Kein eigener Token"],
    bubble: "Ich bunker Sats für den Winter!",
    todayLabel: "Heute gehamstert",
    example: "Beispiel",

    howTitle: "So geht's",
    howSub: "Drei Schritte. Den Rest macht der Hamster.",
    step: (n: number) => `Schritt ${n}`,
    steps: [
      {
        title: "Einzahlen",
        text: "Login mit Face ID oder Fingerabdruck. Keine Seed-Phrase, keine Extension. Dollar, ETH oder Bitcoin – direkt per Karte kaufbar.",
      },
      {
        title: "Zinsen verdienen",
        text: "Dein Kapital wird bei Aave verliehen, einem der größten DeFi-Protokolle. Kein eigener Token, keine Fantasie-Rendite.",
      },
      {
        title: "Bitcoin sammeln",
        text: "Die Erträge werden automatisch zu Bitcoin (cbBTC). Du siehst jeden Tag, wie deine Backentaschen voller werden.",
      },
    ],

    vaultsTitle: "Wähl deinen Hamster",
    vaultsSub: "Alle Vaults zahlen die Rendite in Bitcoin aus.",
    riskBadge: (risk: string) => `Risiko ${risk}`,
    depositLabel: "Einzahlen",
    payoutLabel: "Rendite in",
    sourceLabel: "Quelle",
    apyLabel: "Rendite p.a.",
    apyLabelDemo: "Rendite p.a. (Beispiel)",

    heroCard: { label: "Rendite gerade", hint: "pro Jahr, in Bitcoin, nach Gebühren", demo: "Beispielwert" },

    live: {
      badge: "Live auf Base",
      apyUsdc: "Rendite auf Dollar",
      apyEth: "Rendite auf ETH",
      apyHint: "pro Jahr · in Bitcoin · nach Gebühren",
      aum: "Verwaltetes Vermögen",
      aumSoon: "Gerade gestartet",
      aumSoonHint: "Beta mit kleinen Limits",
      contracts: "Contracts ansehen",
    },

    maxi: {
      title: "Du willst mehr Bitcoin?",
      text: "Park deine Dollar beim Hamster. Dein Geld bleibt Dollar – kein Kursrisiko aufs Kapital. Nur die Zinsen werden jeden Tag zu Bitcoin. So hamsterst du Sats, ohne dein Erspartes aufs Spiel zu setzen.",
      points: ["Kapital bleibt in Dollar", "Jederzeit auszahlen", "Zinsen landen als Bitcoin bei dir"],
      apy: (pct: string) => `≈ ${pct} pro Jahr in Bitcoin`,
      cta: "Zum Dollar-Hamster",
    },
    btcSoon: "Bis dahin: Dollar parken – die Zinsen werden zu Bitcoin.",

    calc: {
      title: "Was bringt mir das?",
      sub: "Rechne es selbst aus – mit den Zinsen von heute.",
      amountLabel: "Ich lege an",
      inDollar: "in Dollar",
      inEth: "in ETH",
      capitalLabel: "Dein Geld",
      capitalHint: "bleibt dir – jederzeit abhebbar",
      yearLabel: "Dazu nach einem Jahr",
      perMonth: (sats: string) => `das sind ≈ ${sats} sats pro Monat`,
      approx: (usd: string) => `≈ ${usd} in Bitcoin`,
      footnote: (fee: number) =>
        `Aktueller, variabler Zins von Aave, bereits nach ${fee} % Gebühr. Bitcoin-Kurs live von Chainlink. Zinsen können sich ändern – keine Garantie.`,
      demo: "Beispielwerte – die Live-Zinsen erscheinen, sobald die Vaults verbunden sind.",
      details: "Was kostet das?",
    },

    safetyTitle: "Süß, aber nicht naiv",
    safetySub: "Wie wir dein Geld schützen – und was du wissen musst.",
    safety: [
      {
        title: "Du behältst die Kontrolle",
        text: "Non-custodial: Dein Guthaben liegt im Smart Contract, nicht bei uns. Auszahlen geht jederzeit – auch wenn der Vault pausiert ist.",
      },
      {
        title: "Gebühren im Code gedeckelt",
        text: "Maximal 20 % Performance-Fee – fest im Contract. Jede Änderung wird per Timelock 2 Tage vorher angekündigt.",
      },
      {
        title: "Vorsichtiger Start",
        text: "In der Beta sind Einzahlungen pro Person und insgesamt gedeckelt. Ein Notfall-Multisig kann alles aus der Strategie zurückholen.",
      },
      {
        title: "Offen und prüfbar",
        text: "Basiert auf geprüftem OpenZeppelin-Code. Der Quellcode ist öffentlich. Status des externen Audits: ausstehend.",
      },
    ],

    faqTitle: "Fragen",
    faq: [
      {
        q: "Woher kommt die Rendite?",
        a: "Aus Zinsen von Leuten, die bei Aave Geld leihen. Nicht aus neuen Einzahlungen und nicht aus einem eigenen Token. Die Zinsen werden über Uniswap in Bitcoin getauscht – nur zu einem Kurs nahe am Chainlink-Marktpreis.",
      },
      {
        q: "Was kostet das?",
        a: "Ein- und Auszahlen kostet nichts. Wir behalten 10 % der Zinsen – nur wenn du verdienst, nie von deinem Kapital. Die angezeigte Rendite ist bereits nach dieser Gebühr. Die Obergrenze von 20 % steht fest im Smart Contract, und jede Änderung wird 2 Tage vorher angekündigt.",
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
    ],

    ctaTitle: "Der Winter kommt bestimmt.",
    ctaText: "Fang heute an zu hamstern – schon ab 10 $.",
  },

  vaults: {
    risk: { niedrig: "niedrig", mittel: "mittel" },
    usdc: {
      name: "Dollar-Hamster",
      summary: "Deine Dollar bleiben Dollar. Nur die Zinsen werden zu Bitcoin.",
      source: "Aave Lending",
      riskNote: "Kein Kursrisiko aufs Kapital. Smart-Contract-Risiko bei Aave und Hamstr.",
    },
    eth: {
      name: "ETH-Hamster",
      summary: "Dein ETH bleibt ETH. Nur die Zinsen werden zu Bitcoin.",
      source: "Aave Lending",
      riskNote: "ETH-Kursrisiko bleibt. Smart-Contract-Risiko bei Aave und Hamstr.",
    },
    btc: {
      name: "Voll-Hamster",
      summary: "Für Überzeugte: Bitcoin rein, mehr Bitcoin raus.",
      source: "Aave Lending",
      riskNote: "Volles BTC-Kursrisiko. Bitcoin-Zinsen sind niedrig.",
    },
  },

  footer: {
    disclaimer: (brand: string) =>
      `${brand} ist Beta-Software. Krypto-Assets sind volatil, Smart Contracts können Fehler enthalten, ein Totalverlust ist möglich. Keine Anlageberatung. Angezeigte Renditen sind Beispiele bzw. variabel und keine Garantie für die Zukunft.`,
    impressum: "Impressum",
    privacy: "Datenschutz",
    source: "Quellcode",
  },

  connect: {
    login: "Anmelden",
    logout: "Abmelden",
    detected: "Im Browser erkannt",
    phantomHint: "Einfache Wallet · unterstützt Base",
    installPhantom: { title: "Phantom installieren", hint: "Kostenlose Wallet für Base · phantom.com" },
    connectors: {
      baseAccount: { title: "Mit Passkey anmelden", hint: "Face ID / Fingerabdruck · empfohlen" },
      injected: { title: "Browser-Wallet", hint: "MetaMask, Rabby & Co." },
      mock: { title: "Test-Wallet (lokal)", hint: "Nur auf dem lokalen Fork · Testgeld" },
    } as Record<string, { title: string; hint: string }>,
  },

  app: {
    demoBanner: "Demo-Modus: Einzahlungen werden nur simuliert, die Zeit läuft im Zeitraffer. Noch kein echtes Geld.",
    forkBanner: "Lokaler Base-Fork: echte Contracts, aber Testgeld. Zeit & Harvest per Script (local-harvest.sh).",
    betaBanner: "Beta: Contracts noch nicht extern geprüft. Einzahlungen pro Person und insgesamt gedeckelt.",
    wrongNetwork: "Deine Wallet ist im falschen Netzwerk.",
    switchTo: (name: string) => `Zu ${name} wechseln`,
    bubbleIdle: "Was hamstern wir heute?",
    bubbleLogin: "Melde dich an, dann geht's los!",
    deposited: "Eingezahlt",
    depositedHint: "Kapital, jederzeit abhebbar",
    claimable: "Abholbereit",
    pending: "Wartet auf Umtausch",
    pendingHint: (pct: number) => `nach ${pct} % Gebühr etwas weniger`,
    earnedBtc: "Gehamsterte Bitcoin",
    feesPaid: "Bezahlte Gebühren",
    feesPaidHint: "10 % vom Gewinn",
    vaultsTitle: "Vaults",
    paused: "pausiert",
    yieldIn: "Rendite in",
    betaLimit: "Beta-Limit",
    apyExample: "APY Beispiel",
    soon: "bald",
    fullHamsterDesc: "cbBTC → mehr cbBTC",
    claim: "Abholen",
    pendingSats: (sats: string) => `+ ≈ ${sats} sats warten auf den nächsten Umtausch`,
    depositTab: "Einzahlen",
    withdrawTab: "Auszahlen",
    withdraw: "Auszahlen",
    amount: "Betrag",
    max: "Max",
    all: "Alles",
    tooMuchDeposit: "Mehr als dein Guthaben oder das Beta-Limit.",
    tooMuchWithdraw: "Mehr als du eingezahlt hast.",
    inWallet: "In deiner Wallet",
    fee: "Gebühr",
    feeValue: (pct: number) => `nur ${pct} % vom Gewinn`,
    perMonth: "Geschätzt pro Monat",
    risk: "Risiko",
    loginFirst: "Erst anmelden",
    enterAmount: "Betrag eingeben",
    depositCta: (amount: string, symbol: string) => `${amount} ${symbol} hamstern`,
    withdrawCta: (amount: string, symbol: string) => `${amount} ${symbol} auszahlen`,
    busy: { approve: "Freigeben…", deposit: "Einzahlen…", withdraw: "Auszahlen…", claim: "Abholen…" },
    reactDeposit: (amount: string, symbol: string) => `Mjam! ${amount} ${symbol} in die Backen.`,
    reactWithdraw: "Kein Problem – dein Kapital ist zurück.",
    reactWithdrawDemo: "Kein Problem – auszahlen geht immer.",
    reactClaim: "Bitcoin gebunkert! Ab in deine Wallet.",
    cancelled: "Abgebrochen.",
    unknownError: "Unbekannter Fehler",
  },

  beta: {
    tag: "Beta",
    title: "Kurz bevor du loslegst",
    intro: (brand: string) =>
      `${brand} ist neu. Damit wir beide wissen, worauf du dich einlässt, bestätige bitte jeden Punkt:`,
    points: [
      "Ich verstehe, dass Hamstr Beta-Software ist und die Smart Contracts noch nicht extern auditiert sind.",
      "Mir ist bewusst, dass ich eingezahlte Mittel teilweise oder ganz verlieren kann, und ich zahle nur ein, was ich verkraften kann.",
      "Hamstr gibt keine Anlage-, Rechts- oder Steuerberatung. Angezeigte Renditen sind variabel und nicht garantiert.",
      "Ich bin volljährig, und die Nutzung ist in meinem Land erlaubt. Für Steuern bin ich selbst verantwortlich.",
    ],
    confirmAll: "Bitte alle Punkte bestätigen",
    continue: "Verstanden, weiter zur App",
    back: "Zurück zur Startseite",
  },

  legal: {
    impressumTitle: "Impressum",
    privacyTitle: "Datenschutzerklärung",
    translationNote: "",
  },
};

export type Dictionary = typeof de;
