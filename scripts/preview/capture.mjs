// Local visual preview. Requires Google Chrome (macOS path below) and a
// running production preview:  npm run build && npx vite preview --port 4173
// Run from the repository root:  node scripts/preview/capture.mjs
// Output: preview-output/ (git-ignored). Nothing here contacts any live service.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../../preview-output", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4173";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--user-data-dir=${OUT}/.chrome-profile`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  } catch { ws = undefined; await sleep(250); }
}
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");

const VIEWPORTS = { desktop: [1440, 900, false], tablet: [820, 1180, true], mobile: [390, 844, true], small: [320, 640, true] };

const CHECKS = `(() => {
  const r = {};
  r.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  r.h1 = document.querySelectorAll("h1").length;
  const visible = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0; };
  r.imgNoAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.src.split("/").pop());
  const named = (el) => el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest("label") || el.getAttribute("title");
  r.unlabelled = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((el) => !named(el)).map((el) => el.outerHTML.slice(0, 90));
  r.buttonsNoName = [...document.querySelectorAll("button, a[href]")].filter((el) => visible(el) && !(el.textContent.trim() || el.getAttribute("aria-label") || el.querySelector("img[alt]:not([alt=''])"))).map((el) => el.outerHTML.slice(0, 90));
  r.smallTargets = [...document.querySelectorAll("button, a[href], input[type=checkbox], input[type=radio], select")].filter((el) => {
    if (!visible(el)) return false;
    if (el.closest("p, li") && el.tagName === "A" && getComputedStyle(el).display === "inline") return false; // inline text links
    const b = (el.matches("input.sr-only, input.peer") ? el.closest("label") ?? el : el).getBoundingClientRect();
    return b.width < 24 || b.height < 24;
  }).map((el) => (el.textContent.trim() || el.getAttribute("aria-label") || el.outerHTML).slice(0, 50));
  const levels = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => +h.tagName[1]);
  r.headingSkips = levels.filter((l, i) => i > 0 && l - levels[i - 1] > 1).length;
  r.internalLinks = [...new Set([...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href").split("#")[0].split("?")[0]).filter(Boolean))];
  r.tinyText = [...document.querySelectorAll("p, li, span, a, label, button")].filter((el) => visible(el) && el.children.length === 0 && el.textContent.trim().length > 3 && parseFloat(getComputedStyle(el).fontSize) < 12).length;
  r.bytes = performance.getEntriesByType("resource").reduce((n, e) => n + (e.transferSize || 0), 0) + (performance.getEntriesByType("navigation")[0]?.transferSize || 0);
  r.images = performance.getEntriesByType("resource").filter((e) => /\\.(jpe?g|png|webp|mp4)/.test(e.name)).map((e) => e.name.split("/").pop() + ":" + Math.round((e.transferSize || e.encodedBodySize) / 1024) + "K");
  return r;
})()`;

const SHOTS = [
  ["homepage", "/", ["desktop", "mobile", "tablet", "small"], true],
  ["package-selector", "/#packages", ["desktop", "mobile"], false],
  ["founder-note", "/#founder-note-heading", ["desktop", "mobile"], false],
  ["keepsake", "/keepsake", ["desktop", "mobile", "small"], true],
  ["journey", "/journey", ["desktop", "mobile"], true],
  ["moment-page", "/moment", ["desktop", "mobile"], true],
  ["products", "/products", ["desktop", "mobile"], true],
  ["bespoke", "/bespoke", ["desktop", "mobile"], true],
  ["mcb-live", "/mcb-live", ["desktop", "mobile"], true],
  ["priority-replacement", "/priority-replacement", ["mobile"], true],
  ["faq", "/faq", ["mobile"], true],
  ["cruise", "/cruise", ["mobile"], true],
  ["about", "/about", ["mobile"], true],
  ["create-choose-keepsake", "/create?product=keepsake", ["desktop", "mobile"], true],
  ["create-moment-story", "/create?sku=moment&step=story", ["desktop", "mobile", "small"], true],
  ["create-keepsake12-x2-story", "/create?sku=keepsake-12-picture-disc&quantity=2&step=story", ["desktop", "mobile"], true],
  ["create-journey12-story", "/create?sku=journey-12&step=story", ["desktop", "mobile"], true],
  ["create-keepsake-extras", "/create?sku=keepsake-7-picture-disc&quantity=3&step=story", ["mobile"], false],
];

const report = {};
for (const [name, path, viewports, fullPage] of SHOTS) {
  for (const vp of viewports) {
    const [w, h, mobile] = VIEWPORTS[vp];
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Page.navigate", { url: BASE + path });
    await sleep(2600);
    // Trigger lazy images: scroll through the page, then back to the target.
    if (fullPage) {
      await evaluate(`(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 700)); })()`);
    }
    const checks = await evaluate(CHECKS);
    report[`${name}@${vp}`] = checks;
    let clip;
    if (fullPage) {
      const height = await evaluate("document.documentElement.scrollHeight");
      clip = { x: 0, y: 0, width: w, height: Math.min(height, 16000), scale: vp === "desktop" ? 0.5 : 0.75 };
    }
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 70, captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {}) });
    writeFileSync(join(OUT, `${name}-${vp}.jpg`), Buffer.from(shot.result.data, "base64"));
    process.stdout.write(`${name}@${vp} `);
  }
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
ws.close();
chrome.kill();
console.log("\ndone");
