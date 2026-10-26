/**
 * Operator details for Impressum and privacy policy.
 * Everything in [brackets] is a placeholder: replace it before going public. Pages highlight
 * remaining placeholders so they are hard to miss.
 */
export const LEGAL = {
  operator: "[Firmenname oder Vor- und Nachname]",
  legalForm: "[Rechtsform, z. B. GmbH / Einzelunternehmen]",
  street: "[Strasse und Hausnummer]",
  city: "[PLZ Ort]",
  country: "Schweiz",
  email: "[kontakt@deine-domain.ch]",
  responsiblePerson: "[Vor- und Nachname der verantwortlichen Person]",
  uid: "[UID, z. B. CHE-123.456.789 – falls vorhanden]",
  register: "[Handelsregister / Registeramt – falls eingetragen]",
  /** Version of the beta notice; bump it to make everyone confirm again after changes. */
  betaNoticeVersion: "2026-10-26",
  lastUpdated: "26. Oktober 2026",
};

export const isPlaceholder = (value: string) => value.startsWith("[") && value.endsWith("]");
