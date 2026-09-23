// Tjekker at et udkast kun bruger tal, der står i agentens værktøjsresultater.
//
// Det er agentens vigtigste værn mod opfundne tal: modellen må gerne vælge,
// hvilke tal der er interessante, og runde dem af, men den må ikke selv
// finde på et. Fejler tjekket, sendes fejlen tilbage til modellen som et
// tool_result med is_error, så den kan rette udkastet.

// "12.456", "12,5", "1.234,5", "2024", "3"
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

// Id'er (cuid) og slugs indeholder tilfældige cifre, som ellers ville gøre
// vilkårlige tal "godkendte".
const IGNORED_KEYS = /(^id$|Id$|_id$|slug$)/;

/** Dansk talformat: punktum er tusindtalsseparator, komma er decimaltegn. */
export function parseDanishNumber(token: string): { value: number; decimals: number } {
  if (token.includes(",")) {
    const i = token.lastIndexOf(",");
    const whole = token.slice(0, i).replaceAll(".", "");
    const frac = token.slice(i + 1);
    return { value: Number(`${whole}.${frac}`), decimals: frac.length };
  }
  const parts = token.split(".");
  if (parts.length > 1 && parts.slice(1).every((p) => p.length === 3)) {
    return { value: Number(parts.join("")), decimals: 0 };
  }
  // Engelsk notation ("23.4") kan også optræde
  return { value: Number(token), decimals: parts.length === 2 ? parts[1].length : 0 };
}

/** Alle tal i et værktøjsresultat, også dem inde i strenge som datoer og resultater. */
export function numbersInResult(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number") {
    into.add(Math.abs(value));
  } else if (typeof value === "string") {
    // Hvert ciffer-løb for sig ("20.07.2025" -> 20, 7, 2025) plus hele danske
    // tal ("1.200 pladser" -> 1200), så begge skrivemåder kan godkendes.
    for (const t of value.match(/\d+/g) ?? []) into.add(Number(t));
    for (const t of value.match(NUMBER_RE) ?? []) {
      const n = parseDanishNumber(t).value;
      if (Number.isFinite(n)) into.add(n);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) numbersInResult(v, into);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (!IGNORED_KEYS.test(k)) numbersInResult(v, into);
    }
  }
  return into;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Returnerer de tal i `text`, der ikke kan findes (evt. afrundet) i `results`. */
export function ungroundedNumbers(text: string, results: unknown[]): string[] {
  const sources = new Set<number>();
  for (const r of results) numbersInResult(r, sources);
  const bad: string[] = [];
  for (const token of text.match(NUMBER_RE) ?? []) {
    const { value, decimals } = parseDanishNumber(token);
    const grounded = [...sources].some((s) => roundTo(s, decimals) === value);
    if (!grounded) bad.push(token);
  }
  return bad;
}
