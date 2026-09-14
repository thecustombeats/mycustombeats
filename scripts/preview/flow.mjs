// Local visual preview. Requires Google Chrome (macOS path below) and a
// running production preview:  npm run build && npx vite preview --port 4173
// Run from the repository root:  node scripts/preview/flow.mjs
// Output: preview-output/ (git-ignored). Nothing here contacts any live service.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir = new URL("../../preview-output/", import.meta.url).pathname;
mkdirSync(dir + "shots", { recursive: true });
const port = 9335; const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--disable-gpu", `--user-data-dir=${dir}.chrome-profile-flow`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; for (let i = 0; i < 40 && !ws; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); } catch { ws = undefined; await sleep(250); } }
let id = 0; const p = new Map(); const errors = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push("EXC " + d.params.exceptionDetails.exception?.description?.slice(0, 200));
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) errors.push(d.params.type + " " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); writeFileSync(`${dir}shots/flow-${name}.jpg`, Buffer.from(s.result.data, "base64")); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(2200); };

// React-friendly value setter.
const setValue = (selector, value, index = 0) => ev(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return "missing";
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return "ok"; })()`);
const click = (js) => ev(`(() => { const el = ${js}; if (!el) return "missing"; el.click(); return "ok"; })()`);
const byText = (tag, text) => `[...document.querySelectorAll(${JSON.stringify(tag)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}))`;
const log = [];
const step = async (label, fn) => { const r = await fn(); log.push(`${label}: ${JSON.stringify(r)}`); await sleep(400); };

await nav("http://localhost:4173/");
await step("homepage create CTA", () => click(`[...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Create Your Memory" && a.getAttribute("href") === "/create")`));
await sleep(1500);
await step("on /create", () => ev("location.pathname"));
await step("choose Keepsake", () => click(`document.querySelector('input[type=radio][id$="-keepsake"]')`));
await step("variant radios", () => ev(`document.querySelectorAll('input[type=radio][value^="keepsake-"]').length`));
await step("choose 12-inch", () => click(`document.querySelector('input[value="keepsake-12-picture-disc"]')`));
await step("quantity +1", () => click(`document.querySelector('button[aria-label="One more Keepsake"]')`));
await shot("1-choose");
await step("continue", () => click(byText("button", "Continue to your story")));
await sleep(800);
await step("heading", () => ev(`document.querySelector("h1").textContent`));
await step("try continue empty", () => click(byText("button", "Continue to finishing touches")));
await sleep(600);
await step("errors shown", () => ev(`document.querySelectorAll('[role=alert]').length`));
// Fill all 8 memories: open each, type story, choose MCB.
for (let k = 1; k <= 2; k++) {
  await step(`keepsake tab ${k}`, () => click(byText("button", `Keepsake ${k}`)));
  for (let m = 1; m <= 4; m++) {
    await step(`open k${k} m${m}`, () => ev(`(() => { const b = document.querySelector('button[aria-controls="panel-unit-${k}-memory-${m}"]'); if (b.getAttribute("aria-expanded") !== "true") b.click(); return "ok"; })()`));
    await sleep(300);
    await step(`story k${k} m${m}`, () => setValue(`#panel-unit-${k}-memory-${m} textarea`, `Day ${m} of Keepsake ${k}: a memory worth keeping.`));
    await step(`mcb k${k} m${m}`, () => click(`document.querySelector('#panel-unit-${k}-memory-${m} input[value="MCB Choice"]')`));
  }
}
await step("progress", () => ev(`[...document.querySelectorAll("p")].find(p => /of 8 memories ready/.test(p.textContent))?.textContent`));
await shot("2-story");
await step("continue to extras", () => click(byText("button", "Continue to finishing touches")));
await sleep(800);
await step("heading", () => ev(`document.querySelector("h1").textContent`));
await step("PR stepper value", () => ev(`document.querySelector('[aria-label="MCB Priority Replacement™ quantity"] [aria-live]')?.textContent`));
await step("add PR", () => click(`document.querySelector('button[aria-label="More: MCB Priority Replacement™ quantity"]')`));
await step("add plaque", () => click(byText("button", "Add a plaque")));
await step("plaque song", () => setValue('input[id$="plaque-1-songTitle"]', "Moon River"));
await step("plaque artist", () => setValue('input[id$="plaque-1-artist"]', "Andy Williams"));
await step("continue without plaque photo", () => click(byText("button", "Continue to your details")));
await sleep(600);
await step("plaque photo required alert", () => ev(`[...document.querySelectorAll('[role=alert]')].map(a => a.textContent).join(" | ")`));
await step("remove plaque", () => click(byText("button", "Remove plaque 1")));
await step("continue to details", () => click(byText("button", "Continue to your details")));
await sleep(800);
await step("heading", () => ev(`document.querySelector("h1").textContent`));
for (const [f, v] of [["firstName", "Ada"], ["lastName", "Lovelace"], ["email", "ada@example.com"], ["shippingName", "Ada Lovelace"], ["shippingAddress", "1 Analytical Street"], ["shippingCity", "London"], ["shippingPostcode", "E1 6AN"], ["shippingCountry", "United Kingdom"]]) {
  await step(`set ${f}`, () => setValue(`input[id$="-${f}"]`, v));
}
await step("delivery note", () => ev(`document.body.textContent.includes("Delivery is calculated separately before payment")`));
await step("continue to review", () => click(byText("button", "Continue to review")));
await sleep(900);
await step("heading", () => ev(`document.querySelector("h1").textContent`));
await step("total", () => ev(`[...document.querySelectorAll("dd")].map(d => d.textContent).filter(t => t.startsWith("£")).join(" ")`));
await step("remake note", () => ev(`document.body.textContent.includes("remake rather than a refinement")`));
await step("pay without consent", () => click(byText("button", "Continue to secure payment")));
await sleep(500);
await step("consent errors", () => ev(`document.querySelectorAll('[data-field=consents] [role=alert]').length`));
await step("tick consents", () => ev(`[...document.querySelectorAll('[data-field=consents] input[type=checkbox]')].map(c => { c.click(); return c.checked; })`));
await step("pay", () => click(byText("button", "Continue to secure payment")));
await sleep(700);
await step("preview state", () => ev(`document.querySelector('[role=status]')?.textContent`));
await step("network calls to /api", () => ev(`performance.getEntriesByType("resource").filter(e => e.name.includes("/api/order") || e.name.includes("/api/checkout") || e.name.includes("cloudinary")).map(e => e.name)`));
await shot("5-review-preview");
await step("draft saved (no contact)", () => ev(`(() => { const raw = localStorage.getItem("mcb_create_draft_v1") || ""; return { saved: raw.length > 0, hasEmail: raw.includes("ada@example.com"), hasAddress: raw.includes("Analytical") }; })()`));
// Refresh: restore banner
await nav("http://localhost:4173/create");
await step("restore banner", () => ev(`document.body.textContent.includes("Welcome back")`));
await step("continue where left", () => click(byText("button", "Continue where I left off")));
await sleep(900);
await step("restored progress", () => ev(`[...document.querySelectorAll("p")].find(p => /memories ready/.test(p.textContent))?.textContent + " | " + document.querySelector('button[aria-controls="panel-unit-2-memory-3"]')?.textContent`));
console.log(log.join("\n"));
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
ws.close(); chrome.kill();
