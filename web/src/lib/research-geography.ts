// Use the runtime's region names so explicit country requests do not require
// adding countries or vendors to the discovery code.
const regionNames = new Intl.DisplayNames("en", {
  type: "region",
  fallback: "none",
});
const countryNames = new Map<string, string>();
for (let a = 65; a <= 90; a += 1) {
  for (let b = 65; b <= 90; b += 1) {
    const code = String.fromCharCode(a, b);
    const name = regionNames.of(code);
    if (name && !["EU", "EZ", "QO", "UN", "XA", "XB", "ZZ"].includes(code)) {
      countryNames.set(name.toLowerCase(), name);
    }
  }
}

// Common English modifiers and abbreviations whose forms aren't region names.
const modifiers = new Map([
  ["Chinese", "China"],
  ["American", "United States"],
  ["Canadian", "Canada"],
  ["British", "United Kingdom"],
  ["German", "Germany"],
  ["French", "France"],
  ["Japanese", "Japan"],
]);
const abbreviations = new Map([
  ["US", "United States"],
  ["U.S.", "United States"],
  ["USA", "United States"],
  ["U.S.A.", "United States"],
  ["UK", "United Kingdom"],
  ["U.K.", "United Kingdom"],
]);

function alternatives(values: Iterable<string>) {
  return [...values]
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const aliases = new Map([
  ...countryNames,
  ...[...abbreviations].map(
    ([short, country]) => [short.toLowerCase(), country] as const,
  ),
]);
const names = `(?:${alternatives(aliases.keys())})`;
const adjective = `(?:${alternatives(modifiers.keys())})`;
const countryBoundary = "(?![\\p{L}\\p{N}-])";
const basedIn = "(?:based|headquartered)\\s+in";
const explicitOrigin = new RegExp(
  `\\b(?:from|${basedIn})\\s+(?:the\\s+)?(${names})${countryBoundary}|\\b(${names})[- ]based\\b`,
  "giu",
);
const modifier = new RegExp(
  `\\b(${adjective}|${alternatives(abbreviations.keys())})(?![- ](?:language|express|lessons?|translation|tutor(?:ing)?|food|cuisine)\\b)${countryBoundary}`,
  "giu",
);
const companyOrigin = new RegExp(
  `\\b(${adjective})\\s+(?:[\\p{L}-]+\\s+){0,5}(?:companies|company|corporation|provider|startup|developer|manufacturer|organization|laboratory)\\b`,
  "giu",
);
const referenceLocation = new RegExp(
  `\\b(?:${basedIn}\\s+|(?:headquarters|country of origin)\\s*[:|]\\s*)(?:the\\s+)?(?:[\\p{L} .'-]{1,45},\\s*){0,3}(${names})${countryBoundary}|\\b(${names})[- ]based\\b`,
  "giu",
);
const modifierCountries = new Map(
  [...modifiers, ...abbreviations].map(([name, country]) => [
    name.toLowerCase(),
    country,
  ]),
);

export function providerOriginRequest(instruction: string) {
  const countries = new Set<string>();
  const subject = instruction
    .replace(
      explicitOrigin,
      (phrase, from: string | undefined, based: string | undefined) => {
        const country = aliases.get((from ?? based ?? "").toLowerCase());
        if (!country) return phrase;
        countries.add(country);
        return " ";
      },
    )
    .replace(modifier, (phrase, name: string, index: number, input: string) => {
      // US$ is a currency marker.
      if (name.toLowerCase() === "us" && input[index + name.length] === "$")
        return phrase;
      if (
        name === "us" &&
        /\b(?:find|show|get|give|help)\s+$/i.test(input.slice(0, index))
      )
        return " ";
      // An audience or service region does not establish the seller's location.
      if (
        /\b(?:in|to|for|across|within|outside)\s+(?:the\s+)?$/i.test(
          input.slice(0, index),
        )
      )
        return phrase;
      const country = modifierCountries.get(name.toLowerCase());
      if (!country) return phrase;
      countries.add(country);
      return " ";
    });
  return {
    countries: [...countries],
    subject: subject.replace(/\s+/g, " ").trim(),
  };
}

export function referencedProviderCountries(snippet: string): string[] {
  const countries = new Set<string>();
  for (const [, location, based] of snippet.matchAll(referenceLocation)) {
    const country = aliases.get((location ?? based ?? "").toLowerCase());
    if (country) countries.add(country);
  }
  for (const [, name] of snippet.matchAll(companyOrigin)) {
    const country = modifierCountries.get((name ?? "").toLowerCase());
    if (country) countries.add(country);
  }
  return [...countries];
}
