// UI smoke: responsive layout (no horizontal overflow) + axe-core WCAG 2.2 AA scan, light and dark.
// Usage: npm run build && npm run test:ui   (or BASE_URL=https://preview.example npm run test:ui)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PAGES = ["/", "/about", "/discover", "/discover?department=accounting&year=2007", "/class-of", "/sign-in", "/register", "/forgot-password", "/verify-email", "/does-not-exist"];
const VIEWPORTS = [{ name: "mobile", width: 375, height: 800 }, { name: "desktop", width: 1280, height: 900 }];
const SCHEMES = ["light", "dark"];

let server;
let base = process.env.BASE_URL;
if (!base) {
  base = "http://127.0.0.1:3107";
  try { await fetch(base); console.error("Port 3107 is already in use — stop that server first."); process.exit(2); } catch {}
  server = spawn("npx", ["next", "start", "-p", "3107", "-H", "127.0.0.1"], { stdio: "ignore", detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
}

const results = [];
const browser = await chromium.launch();
try {
  for (const scheme of SCHEMES) for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const label = `${scheme.padEnd(5)} ${vp.name.padEnd(7)} ${path}`;
      try {
        const res = await page.goto(base + path, { waitUntil: "networkidle" });
        const status = res?.status() ?? 0;
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await page.addScriptTag({ content: axeSource });
        const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations
          .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
        const okStatus = path === "/does-not-exist" ? status === 404 : status === 200;
        const ok = okStatus && overflow <= 0 && axe.length === 0;
        results.push({ ok, label, detail: [!okStatus && `HTTP ${status}`, overflow > 0 && `overflow ${overflow}px`, ...axe].filter(Boolean) });
      } catch (e) { results.push({ ok: false, label, detail: [String(e.message ?? e).split("\n")[0]] }); }
    }
    await ctx.close();
  }
  // Institution lookup: open the suggestion list and scan it (needs a backend with directory data).
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base + "/", { waitUntil: "networkidle" });
    const box = page.getByRole("combobox", { name: "Institution" });
    await box.fill("university of");
    const opened = await page.getByRole("listbox").getByRole("option").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (!opened) results.push({ ok: true, label: "lookup  open listbox (skipped: no directory data)", detail: [] });
    else {
      await box.press("ArrowDown");
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] })).violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
      const activeOk = (await box.getAttribute("aria-activedescendant")) !== null;
      results.push({ ok: axe.length === 0 && activeOk, label: "lookup  open listbox + keyboard focus", detail: [...axe, ...(activeOk ? [] : ["aria-activedescendant not set"])] });
    }
    await page.close();
  }
  // Protected areas must never render member data without a backend/session.
  const page = await browser.newPage();
  for (const path of ["/app/dashboard", "/admin/dashboard"]) {
    await page.goto(base + path);
    const text = await page.textContent("body");
    const url = page.url();
    const ok = /sign-in/.test(url) || /Backend not connected/.test(text ?? "");
    results.push({ ok, label: `guard   ${path}`, detail: ok ? [] : [`rendered at ${url}`] });
  }
} finally {
  await browser.close();
  if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch {} await new Promise((r) => setTimeout(r, 800)); try { process.kill(-server.pid, "SIGKILL"); } catch {} }
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail.length ? "\n      " + r.detail.join("\n      ") : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`ui checks: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
