/**
 * English text to phonemes for the Kokoro voice, without eSpeak (which is
 * GPL): words come from the CMU Pronouncing Dictionary (ARPAbet), converted
 * to the phoneme set Kokoro was trained on (misaki's US English: IPA with
 * single letters for the diphthongs, A = "say", I = "my", O = "go",
 * W = "now", Y = "boy"). Words the dictionary doesn't have are split into
 * parts it does (identifiers, compounds), spelled out (acronyms), or read
 * with letter-to-sound rules.
 */

export type Lexicon = Map<string, string>;

/** Parses the lexicon file: one "word ARPABET" entry per line. */
export function parseLexicon(text: string): Lexicon {
  const lex: Lexicon = new Map();
  for (const line of text.split('\n')) {
    const i = line.indexOf(' ');
    if (i > 0) lex.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  return lex;
}

const VOWELS: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AO: 'ɔ',
  AW: 'W',
  AY: 'I',
  EH: 'ɛ',
  EY: 'A',
  IH: 'ɪ',
  IY: 'i',
  OW: 'O',
  OY: 'Y',
  UH: 'ʊ',
  UW: 'u',
};

const CONSONANTS: Record<string, string> = {
  B: 'b',
  CH: 'ʧ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'ʤ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'ɹ',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

/** ARPAbet ("HH AH0 L OW1") to Kokoro phonemes ("həlˈO"). */
export function arpabetToPhonemes(arpabet: string): string {
  const parts = arpabet.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const isVowel = (p: string | undefined) => !!p && /\d$/.test(p);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const m = /^([A-Z]+)([012])$/.exec(p);
    if (m) {
      const [, base, stress] = m;
      const mark = stress === '1' ? 'ˈ' : stress === '2' ? 'ˌ' : '';
      let v: string;
      if (base === 'AH') v = stress === '0' ? 'ə' : 'ʌ';
      else if (base === 'ER') v = stress === '0' ? 'əɹ' : 'ɜɹ';
      else v = VOWELS[base] ?? '';
      out.push(mark + v);
      continue;
    }
    // American flap: "water", "better", "data".
    if (p === 'T' && i > 0 && (isVowel(parts[i - 1]) || parts[i - 1] === 'R') && isVowel(parts[i + 1]) && parts[i + 1]!.endsWith('0')) {
      out.push('ɾ');
      continue;
    }
    out.push(CONSONANTS[p] ?? '');
  }
  return out.join('');
}

// ----------------------------------------------------------------- numbers

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: [number, string][] = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

export function numberToWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `minus ${numberToWords(-n)}`;
  if (!Number.isInteger(n)) {
    const [whole, frac] = String(n).split('.');
    return `${numberToWords(Number(whole))} point ${frac.split('').map((d) => ONES[Number(d)]).join(' ')}`;
  }
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ''}`;
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const rest = n % size;
      return `${numberToWords(Math.floor(n / size))} ${name}${rest ? ` ${numberToWords(rest)}` : ''}`;
    }
  }
  return String(n);
}

// ------------------------------------------------------------ normalizing

/**
 * Rewrites things people say differently from how they're written:
 * complexity notation, operators, numbers, code identifiers.
 */
export function normalizeText(text: string): string {
  let t = text
    .replace(/[`*_]{2,}|`/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Big-O: O(n log n), O(n^2), O(1).
    .replace(/\bO\(([^)]*)\)/g, (_, inner: string) => `O of ${inner}`)
    .replace(/(\w)\s*\^\s*2\b/g, '$1 squared')
    .replace(/(\w)\s*\^\s*3\b/g, '$1 cubed')
    .replace(/(\w)\s*\^\s*(\w+)/g, '$1 to the $2')
    .replace(/\blog\s*\(\s*n\s*\)/gi, 'log n')
    .replace(/<=/g, ' less than or equal to ')
    .replace(/>=/g, ' greater than or equal to ')
    .replace(/!=/g, ' not equal to ')
    .replace(/==/g, ' equals ')
    .replace(/->|=>/g, ' to ')
    .replace(/\s<\s/g, ' less than ')
    .replace(/\s>\s/g, ' greater than ')
    .replace(/\s=\s/g, ' equals ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s-\s/g, ' minus ')
    .replace(/\s\*\s/g, ' times ')
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/&/g, ' and ')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .replace(/\betc\./gi, 'et cetera')
    .replace(/\bvs\.?(?=\s)/gi, 'versus')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
  // Numbers (after the patterns above have used theirs).
  t = t.replace(/\b\d+(?:\.\d+)?\b/g, (m) => numberToWords(Number(m)));
  // Identifiers: snake_case and camelCase become separate words.
  t = t.replace(/([a-z])_+([a-z])/gi, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2');
  return t.replace(/[[\]{}<>|\\/#@~^=+*]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------- unknown words

const LETTERS: Record<string, string> = {
  a: 'EY1', b: 'B IY1', c: 'S IY1', d: 'D IY1', e: 'IY1', f: 'EH1 F', g: 'JH IY1', h: 'EY1 CH', i: 'AY1',
  j: 'JH EY1', k: 'K EY1', l: 'EH1 L', m: 'EH1 M', n: 'EH1 N', o: 'OW1', p: 'P IY1', q: 'K Y UW1', r: 'AA1 R',
  s: 'EH1 S', t: 'T IY1', u: 'Y UW1', v: 'V IY1', w: 'D AH1 B AH0 L Y UW0', x: 'EH1 K S', y: 'W AY1', z: 'Z IY1',
};

function spell(word: string): string {
  return word
    .toLowerCase()
    .split('')
    .map((c) => LETTERS[c])
    .filter(Boolean)
    .join(' ');
}

/**
 * Splits an unknown word into dictionary words ("hashmap" = hash + map,
 * "subarray" = sub + array), preferring the fewest parts.
 */
function splitCompound(word: string, lex: Lexicon): string[] | null {
  const n = word.length;
  const best: (string[] | null)[] = Array(n + 1).fill(null);
  best[0] = [];
  for (let end = 1; end <= n; end++) {
    for (let start = Math.max(0, end - 20); start < end; start++) {
      const prev = best[start];
      const part = word.slice(start, end);
      if (!prev || part.length < 3 || !lex.has(part)) continue;
      if (!best[end] || prev.length + 1 < best[end]!.length) best[end] = [...prev, part];
    }
  }
  return best[n] && best[n]!.length > 1 ? best[n] : null;
}

/** Letter-to-sound rules for words nothing else covers. Rough, but rare. */
export function letterToSound(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: string[] = [];
  let stressed = false;
  const vowel = (v: string) => {
    out.push(`${v}${stressed ? '0' : '1'}`);
    stressed = true;
  };
  const isV = (c: string | undefined) => !!c && 'aeiouy'.includes(c);
  for (let i = 0; i < w.length; ) {
    const rest = w.slice(i);
    const next = w[i + 1];
    const after = w[i + 2];
    const magicE = !isV(next) && next !== undefined && after === 'e' && i + 3 === w.length;
    const rules: [string, () => void][] = [
      ['tion', () => (out.push('SH'), vowel('AH'), out.push('N'))],
      ['sion', () => (out.push('ZH'), vowel('AH'), out.push('N'))],
      ['igh', () => vowel('AY')],
      ['ch', () => out.push('CH')],
      ['sh', () => out.push('SH')],
      ['th', () => out.push('TH')],
      ['ph', () => out.push('F')],
      ['ck', () => out.push('K')],
      ['qu', () => out.push('K', 'W')],
      ['ng', () => out.push('NG')],
      ['ee', () => vowel('IY')],
      ['ea', () => vowel('IY')],
      ['oo', () => vowel('UW')],
      ['ou', () => vowel('AW')],
      ['ow', () => vowel('OW')],
      ['ai', () => vowel('EY')],
      ['ay', () => vowel('EY')],
      ['oi', () => vowel('OY')],
      ['oy', () => vowel('OY')],
      ['er', () => vowel('ER')],
      ['ir', () => vowel('ER')],
      ['ur', () => vowel('ER')],
      ['ar', () => (vowel('AA'), out.push('R'))],
      ['or', () => (vowel('AO'), out.push('R'))],
    ];
    const rule = rules.find(([pat]) => rest.startsWith(pat));
    if (rule) {
      rule[1]();
      i += rule[0].length;
      continue;
    }
    const c = w[i];
    if (c === 'e' && i === w.length - 1 && out.length) {
      i++;
      continue; // silent final e
    }
    if (isV(c)) {
      if (c === 'y' && i === 0) out.push('Y');
      else if (c === 'y') vowel(i === w.length - 1 ? 'IY' : 'IH');
      else if (magicE) vowel({ a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW' }[c]!);
      else vowel({ a: 'AE', e: 'EH', i: 'IH', o: 'AA', u: 'AH' }[c]!);
      i++;
      continue;
    }
    if (c === next) {
      i++;
      continue; // doubled consonant
    }
    const soft = next === 'e' || next === 'i' || next === 'y';
    const map: Record<string, string[]> = {
      b: ['B'], c: [soft ? 'S' : 'K'], d: ['D'], f: ['F'], g: [soft ? 'JH' : 'G'], h: ['HH'], j: ['JH'], k: ['K'],
      l: ['L'], m: ['M'], n: ['N'], p: ['P'], q: ['K'], r: ['R'], s: ['S'], t: ['T'], v: ['V'], w: ['W'], x: ['K', 'S'], z: ['Z'],
    };
    out.push(...(map[c] ?? []));
    i++;
  }
  return out.join(' ');
}

/** One word (letters and apostrophes) to ARPAbet. */
export function wordToArpabet(word: string, lex: Lexicon): string {
  const lower = word.toLowerCase();
  const hit = lex.get(lower);
  if (hit) return hit;
  // Possessive or plural of a known word.
  for (const suffix of ["'s", "s'", 'es', 's']) {
    const stem = lower.endsWith(suffix) ? lower.slice(0, -suffix.length) : '';
    const base = stem && lex.get(stem);
    if (!base) continue;
    const last = base.split(' ').at(-1)!;
    return `${base} ${/^(S|Z|SH|ZH|CH|JH)$/.test(last) ? 'AH0 Z' : /^(P|T|K|F|TH)$/.test(last) ? 'S' : 'Z'}`;
  }
  // Acronyms: "BFS", "DP", "API".
  if (/^[A-Z]{2,5}$/.test(word) || !/[aeiouy]/i.test(word)) return spell(word);
  const parts = splitCompound(lower, lex);
  // A compound has one main stress, on its first part: "HASH-map".
  if (parts) return parts.map((p, i) => (i === 0 ? lex.get(p)! : lex.get(p)!.replace(/1/g, '2'))).join(' ');
  return letterToSound(lower);
}

/**
 * Small words people don't stress in running speech ("happens to the",
 * not "happens TOO the"). Used only when another word follows; at the end
 * of a sentence they keep their full form ("Who is it for?").
 */
const WEAK_FORMS: Record<string, string> = {
  a: 'ə',
  an: 'ən',
  and: 'ənd',
  are: 'əɹ',
  as: 'əz',
  at: 'ət',
  but: 'bət',
  can: 'kən',
  could: 'kəd',
  do: 'du',
  does: 'dəz',
  for: 'fəɹ',
  from: 'fɹəm',
  had: 'həd',
  has: 'həz',
  have: 'həv',
  is: 'ɪz',
  it: 'ɪt',
  of: 'əv',
  or: 'əɹ',
  should: 'ʃəd',
  some: 'səm',
  than: 'ðən',
  that: 'ðət',
  the: 'ðə',
  them: 'ðəm',
  to: 'tə',
  was: 'wəz',
  were: 'wəɹ',
  will: 'wɪl',
  would: 'wəd',
  you: 'ju',
  your: 'jəɹ',
};

/** Punctuation Kokoro knows; it shapes pauses and intonation. */
const KEPT_PUNCTUATION = /[.,!?;:—…"()]/;

/** Text to the phoneme string Kokoro reads. */
export function phonemize(text: string, lex: Lexicon): string {
  const normalized = normalizeText(text);
  const tokens = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)*|[.,!?;:—…"()]|-+/g) ?? [];
  const isWord = (t: string | undefined) => !!t && /^[A-Za-z]/.test(t);
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (KEPT_PUNCTUATION.test(tok)) {
      out = out.trimEnd() + tok + ' ';
    } else if (/^-+$/.test(tok)) {
      out = `${out.trimEnd()}, `;
    } else {
      // "that" before a noun is a weak "ðət"; "that" as a pronoun at a
      // sentence start ("That works.") keeps its stress.
      const weak = WEAK_FORMS[tok.toLowerCase()];
      const startsSentence = i === 0 || /[.!?]/.test(tokens[i - 1]);
      const useWeak = weak && isWord(tokens[i + 1]) && !(startsSentence && /^(that|you|do|can|could|would|should|will|does|is|are|was|were|have|has|had)$/i.test(tok));
      out += `${useWeak ? weak : arpabetToPhonemes(wordToArpabet(tok, lex))} `;
    }
  }
  return out.trim();
}
