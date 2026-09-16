/**
 * Fails when a user-facing string is hardcoded in one language.
 *
 * This is the guard rail that makes the bilingual UI stay bilingual: a translation pass is
 * easy to do once and impossible to keep done by discipline alone. Every Chinese string
 * literal in `src/` must sit inside a `tr(zh, en)` call — see src/i18n.ts.
 *
 * Comments are exempt: they are for whoever is reading the code, not for the player. A
 * string that genuinely must not be translated can carry `i18n-exempt` in a comment on
 * its opening line.
 *
 * Usage: `npm run i18n:audit` (also runs in CI).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HAN = /[一-鿿]/;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Blank out comments so Chinese prose in them is not mistaken for UI text. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Character offsets covered by the arguments of a `t(...)` call, including nested ones. */
function translatedRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const call = /(^|[^A-Za-z0-9_$.])tr\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(src)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1; // at the '('
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i++;
        while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    ranges.push([start, i]);
  }
  return ranges;
}

/** Remove `${...}` spans from a template literal, leaving only its static text. */
function stripInterpolations(lit: string): string {
  let out = '';
  for (let i = 0; i < lit.length; i++) {
    if (lit[i] === '$' && lit[i + 1] === '{') {
      let depth = 0;
      for (; i < lit.length; i++) {
        if (lit[i] === '{') depth++;
        else if (lit[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      continue;
    }
    out += lit[i];
  }
  return out;
}

/**
 * The Chinese text inside each `tr(...)` call, so a pair that was "translated" by pasting the
 * same Chinese into both halves is caught too — wrapping a string is not translating it.
 */
function untranslatedHalves(src: string, ranges: Array<[number, number]>): number[] {
  const bad: number[] = [];
  for (const [open, close] of ranges) {
    const args = src.slice(open + 1, close);
    // Split on the top-level comma separating the two halves.
    let depth = 0;
    let split = -1;
    for (let i = 0; i < args.length; i++) {
      const c = args[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i++;
        while (i < args.length && args[i] !== q) i += args[i] === '\\' ? 2 : 1;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) { split = i; break; }
    }
    if (split < 0) continue;
    // A nested `tr(...)` legitimately carries Chinese inside the English half; drop those
    // spans before testing, or composing one translated string from another would trip this.
    let half = args.slice(split + 1);
    for (const [a, b] of translatedRanges(half).reverse()) half = half.slice(0, a) + half.slice(b);
    if (HAN.test(half)) bad.push(open);
  }
  return bad;
}

const offenders: string[] = [];
for (const file of sources('src').sort()) {
  const raw = readFileSync(file, 'utf8');
  if (!HAN.test(raw)) continue;
  const rawLines = raw.split('\n');
  const src = stripComments(raw);
  const ranges = translatedRanges(src);
  const inside = (pos: number) => ranges.some(([a, b]) => pos > a && pos < b);

  for (const pos of untranslatedHalves(src, ranges)) {
    const line = src.slice(0, pos).split('\n').length;
    if (rawLines[line - 1]?.includes('i18n-exempt')) continue;
    offenders.push(`${file}:${line}  English half still contains Chinese`);
  }

  const literal = /(['"`])(?:\\.|(?!\1)[\s\S])*\1/g;
  let m: RegExpExecArray | null;
  while ((m = literal.exec(src)) !== null) {
    // Only the *static* text of a template counts: `<h1>${tr('设置', 'Settings')}</h1>` is
    // already translated, and the interpolation is checked on its own as an inner call.
    if (!HAN.test(m[0].startsWith('`') ? stripInterpolations(m[0]) : m[0])) continue;
    if (inside(m.index)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    // Escape hatch for the rare string that must not be translated — a language's own name,
    // for instance. Put `i18n-exempt` in a comment on the line the string starts on.
    if (rawLines[line - 1]?.includes('i18n-exempt')) continue;
    const text = m[0].length > 46 ? `${m[0].slice(0, 46)}…` : m[0];
    offenders.push(`${file}:${line}  ${text}`);
  }
}

if (offenders.length > 0) {
  process.stderr.write(
    `${offenders.length} untranslated string${offenders.length === 1 ? '' : 's'} `
    + `(wrap each in tr('中文', 'English') — see src/i18n.ts):\n`
    + offenders.map((o) => `  ${o}\n`).join(''),
  );
  process.exit(1);
}
process.stdout.write('i18n audit: every user-facing string is bilingual.\n');
