const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC"
};

const STATE_CODES = new Set(Object.values(STATE_ABBREVIATIONS));

function cleanAddressText(address: string): string {
  return address
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,+/g, ",")
    .trim()
    .replace(/^,+|,+$/g, "")
    .trim();
}

function removeCountry(parts: string[]): string[] {
  const lastPart = parts.at(-1)?.toLowerCase();

  if (lastPart === "usa" || lastPart === "u.s.a." || lastPart === "united states") {
    return parts.slice(0, -1);
  }

  return parts;
}

function normalizeZip(value: string): string {
  return value.replace(/\b(\d{5})[\s-]?(\d{4})\b/g, "$1-$2");
}

function normalizeState(value: string): string {
  const normalized = value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  const upperValue = normalized.toUpperCase();

  if (STATE_CODES.has(upperValue)) {
    return upperValue;
  }

  return STATE_ABBREVIATIONS[normalized] ?? value.trim();
}

function normalizeStateZip(part: string): string {
  const cleaned = normalizeZip(part);
  const match = cleaned.match(/^([A-Za-z][A-Za-z .]+?)\s+(\d{5}(?:-\d{4})?)$/);

  if (!match) {
    return cleaned;
  }

  return `${normalizeState(match[1])} ${match[2]}`;
}

export function normalizePropertyAddress(address: string): string {
  const cleaned = cleanAddressText(address);

  if (!cleaned) {
    return "";
  }

  const parts = removeCountry(cleaned.split(",").map((part) => part.trim()).filter(Boolean));

  if (parts.length === 0) {
    return "";
  }

  const lastIndex = parts.length - 1;
  const normalizedParts = parts.map((part, index) =>
    index === lastIndex ? normalizeStateZip(part) : normalizeZip(part)
  );

  return normalizedParts.join(", ");
}
