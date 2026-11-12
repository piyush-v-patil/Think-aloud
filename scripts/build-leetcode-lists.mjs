// Builds src/data/leetcode-lists.json: the Blind 75, NeetCode 150 and
// NeetCode 250 study lists as LeetCode problem titles, numbers and links.
// No problem statements: those stay on LeetCode, and users paste them on
// their own device when they practice.
//
// Source: NeetCode's practice data (neetcode.io), which tags each problem
// with the lists it belongs to. Blind 75 and NeetCode 150 are cross-checked
// against github.com/neetcode-gh/leetcode (.problemSiteData.json, MIT).
//
//   node scripts/build-leetcode-lists.mjs
//
// The output is committed; run this only to refresh the lists.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (think-aloud list builder)' };

const LISTS = [
  { id: 'blind75', name: 'Blind 75', flag: 'blind75', about: 'The classic 75 problems covering the core interview patterns.' },
  { id: 'neetcode150', name: 'NeetCode 150', flag: 'neetcode150', about: 'Blind 75 plus 75 more, grouped by pattern.' },
  { id: 'neetcode250', name: 'NeetCode 250', flag: 'neetcode250', about: 'NeetCode 150 plus 100 more, starting gentler.' },
];

async function text(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/** NeetCode's site bundles its problem data; find the bundle, then the problem objects in it. */
async function siteProblems() {
  const page = await text('https://neetcode.io/practice');
  const main = /src="(main\.[0-9a-f]+\.js)"/.exec(page)?.[1];
  if (!main) throw new Error('Could not find NeetCode’s main bundle');
  const js = await text(`https://neetcode.io/${main}`);
  const objects = js.match(/\{problem:"(?:[^"\\]|\\.)*"[^{}]*\}/g) ?? [];
  const field = /(\w+):("(?:[^"\\]|\\.)*"|!0|!1)/g;
  const bySlug = new Map();
  for (const o of objects) {
    const d = {};
    for (const [, k, v] of o.matchAll(field)) d[k] = v === '!0' ? true : v === '!1' ? false : JSON.parse(v);
    if (!d.link) continue;
    const slug = d.link.replace(/\/$/, '');
    const seen = bySlug.get(slug);
    if (!seen) bySlug.set(slug, d);
    else for (const l of LISTS) if (d[l.flag]) seen[l.flag] = true;
  }
  return bySlug;
}

const site = await siteProblems();
const repo = JSON.parse(await text('https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json'));

const problems = {};
const lists = [];
for (const l of LISTS) {
  const slugs = [...site.entries()].filter(([, d]) => d[l.flag]).map(([slug]) => slug);
  if (l.flag !== 'neetcode250') {
    const fromRepo = new Set(repo.filter((x) => x[l.flag]).map((x) => x.link.replace(/\/$/, '')));
    const same = fromRepo.size === slugs.length && slugs.every((s) => fromRepo.has(s));
    if (!same) throw new Error(`${l.name}: neetcode.io and the neetcode-gh repository disagree`);
  }
  for (const slug of slugs) {
    const d = site.get(slug);
    const number = d.code ? Number(d.code.split('-')[0]) : undefined;
    problems[slug] = { number, title: d.problem, difficulty: String(d.difficulty).toLowerCase(), pattern: d.pattern };
  }
  lists.push({ id: l.id, name: l.name, about: l.about, slugs });
  console.log(`${l.name}: ${slugs.length} problems`);
}

const out = {
  source: 'NeetCode practice lists (neetcode.io); Blind 75 and NeetCode 150 cross-checked with github.com/neetcode-gh/leetcode (MIT).',
  generatedOn: new Date().toISOString().slice(0, 10),
  problems,
  lists,
};
const file = join(root, 'src', 'data', 'leetcode-lists.json');
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`Wrote ${Object.keys(problems).length} problems to ${file}`);
