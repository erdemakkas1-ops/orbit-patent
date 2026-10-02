export type ParsedPatentIdentifier = {
  country: string;
  documentNumber: string;
  kindCode?: string;
};

export function parsePatentIdentifier(
  value: string,
): ParsedPatentIdentifier | null {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/[\s.-]/g, "")
    .toUpperCase();
  const match = /^([A-Z]{2})(\d{6,12})([A-Z]\d?)?$/.exec(normalized);
  if (!match) return null;
  return {
    country: match[1],
    documentNumber: match[2],
    kindCode: match[3] || undefined,
  };
}

export function toRouteIdentifier(identifier: ParsedPatentIdentifier) {
  return `${identifier.country}${identifier.documentNumber}${identifier.kindCode ?? ""}`;
}

export function toEpodocIdentifier(identifier: ParsedPatentIdentifier) {
  return `${identifier.country}${identifier.documentNumber}`;
}

export function toDocdbIdentifier(identifier: ParsedPatentIdentifier) {
  return identifier.kindCode
    ? `${identifier.country}.${identifier.documentNumber}.${identifier.kindCode}`
    : null;
}
