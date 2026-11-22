// Builds idempotent upsert SQL for public.institution_directory from:
//   1. Hipo "university-domains-list" (fetched at run time, not vendored; README permits free use) and
//   2. data/institutions/curated.json (ALUMS-maintained gap fill, e.g. Nigerian polytechnics).
// Usage: node scripts/load-institution-directory.mjs --out <dir> [--source <json path or URL>] [--batch 1500]
//        then apply each <dir>/NNN.sql with psql (or the Supabase SQL editor / Management API).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const SOURCE = args.source ?? "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const OUT = args.out ?? "institution-directory-sql";
const BATCH = Number(args.batch ?? 1500);

const upstream = SOURCE.startsWith("http") ? await (await fetch(SOURCE)).json() : JSON.parse(readFileSync(SOURCE, "utf8"));
const curatedFile = JSON.parse(readFileSync(new URL("../data/institutions/curated.json", import.meta.url), "utf8"));
const curated = curatedFile.entries;
const corrections = new Map((curatedFile.corrections ?? []).map((c) => [`${c.from.toLowerCase()}|${c.country}`, c.to]));

const clean = (s, max) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : null) || null;
const kindOf = (n) => (/polytechnic/i.test(n) ? "polytechnic" : /\bcollege\b|institute of technology/i.test(n) && !/university/i.test(n) ? "college" : "university");

const rows = new Map();
for (const u of upstream) {
  const country = clean(u.country, 80);
  const name = clean(corrections.get(`${String(u.name).trim().toLowerCase()}|${country}`) ?? u.name, 200);
  if (!name || !country || name.length < 2) continue;
  const web = clean(u.web_pages?.[0], 300);
  rows.set(`${name.toLowerCase()}|${country}`, {
    name, country, country_code: /^[A-Z]{2}$/.test(u.alpha_two_code ?? "") ? u.alpha_two_code : null,
    state_province: clean(u["state-province"], 120), website_url: web, kind: kindOf(name), source: "hipo",
  });
}
let added = 0;
for (const c of curated) {
  const key = `${c.name.toLowerCase()}|${c.country}`;
  if (rows.has(key)) continue; // upstream already lists it
  rows.set(key, { ...c, website_url: c.website_url ?? null, source: "curated" });
  added++;
}

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const all = [...rows.values()].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
mkdirSync(OUT, { recursive: true });
for (let i = 0; i * BATCH < all.length; i++) {
  const chunk = all.slice(i * BATCH, (i + 1) * BATCH);
  const values = chunk.map((r) => `(${[r.name, r.country, r.country_code, r.state_province, r.website_url, r.kind, r.source].map(lit).join(",")})`).join(",\n");
  writeFileSync(join(OUT, `${String(i).padStart(3, "0")}.sql`),
    `insert into public.institution_directory (name, country, country_code, state_province, website_url, kind, source) values\n${values}\n` +
    `on conflict ((lower(name)), country) do update set country_code = excluded.country_code, state_province = excluded.state_province,\n` +
    `  website_url = excluded.website_url, kind = excluded.kind, source = excluded.source, updated_at = now();\n`);
}
// Housekeeping: drop rows under corrected (old) names and curated rows no longer in the curated file.
const keep = all.filter((r) => r.source === "curated").map((r) => `(${lit(r.name.toLowerCase())},${lit(r.country)})`).join(",");
const olds = (curatedFile.corrections ?? []).map((c) => `(${lit(c.from.toLowerCase())},${lit(c.country)})`).join(",");
writeFileSync(join(OUT, "999_prune.sql"),
  (olds ? `delete from public.institution_directory where (lower(name), country) in (${olds});\n` : "") +
  `delete from public.institution_directory where source = 'curated'${keep ? ` and (lower(name), country) not in (${keep})` : ""};\n`);
console.error(`${all.length} institutions (${added} curated additions) in ${Math.ceil(all.length / BATCH)} file(s) → ${OUT}`);
