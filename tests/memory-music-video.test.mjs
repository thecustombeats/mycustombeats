/**
 * MCB Memory Music Video™ (15 September 2026). Run: npm test
 *
 * Contracts: £49, optional, never preselected, one film for one song; the
 * draft and payload carry the explicit choice only; availability and capacity
 * are the server's (no browser-side scarcity); planning limits stay pending
 * verification; the audio master is never edited; no platform call; customer
 * copy is premium MCB (no AI, credits, generation or platform name);
 * analytics never receive customer content.
 * Server behaviour is proven against PHP in tests/video-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#|\*).*$/gm, "");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-mv-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as catalogue from "${root}src/data/catalogue/index.ts";
export * as P from "${root}src/lib/personalisation.ts";
export * as video from "${root}src/data/production/video.ts";
`);
const outFile = join(root, "node_modules", `.mcb-mv-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" } };
const { catalogue: C, P, video: V } = await import(outFile);
const lib = read("public/api/lib/video.php");

const draftFor = (sku, quantity = 1) => P.chooseVariant(P.emptyDraft(), sku, quantity);

test("the product: £49, optional digital enhancement, one film for one song, never an add-on bundled in", () => {
  const ref = C.getVariant("memory-music-video");
  assert.equal(ref.variant.price.minor, 4900);
  assert.equal(ref.variant.fulfilment, "DIGITAL");
  assert.equal(ref.product.category, "VIDEO_ENHANCEMENT");
  assert.equal(C.MEMORY_MUSIC_VIDEO_MAX_PER_ORDER, 1);
  assert.ok(!C.addOnProducts().some((p) => p.id === "memory-music-video"), "not a free-standing add-on");
  assert.ok(ref.product.disclosures.some((d) => /Not included with any package/.test(d)));
  for (const product of ["moment", "keepsake", "journey"]) {
    assert.doesNotMatch(JSON.stringify(C.getProduct(product)), /memory music video|memory-music-video/i, `${product} does not include a video`);
  }
});

test("pricing preview: Moment + video; two videos refused; a video needs a song", () => {
  const moment = C.getVariant("moment").variant.price.minor;
  const ok = C.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "memory-music-video", quantity: 1 }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.totalMinor, moment + 4900);
  assert.equal(C.previewOrder([{ sku: "journey-6", quantity: 1 }, { sku: "memory-music-video", quantity: 2 }]).reason, "memory_video_ineligible");
  assert.equal(C.previewOrder([{ sku: "memory-music-video", quantity: 1 }]).reason, "no_song_experience");
});

test("the draft: never preselected; one line only when a song is chosen; the choice follows its song only", () => {
  const moment = draftFor("moment");
  assert.equal(P.emptyDraft().memoryVideo, null);
  assert.ok(!P.draftLines(moment).some((l) => l.sku === "memory-music-video"), "not preselected");
  const chosen = { ...moment, memoryVideo: moment.units[0].memories[0].id };
  assert.deepEqual(P.draftLines(chosen).filter((l) => l.sku === "memory-music-video"), [{ sku: "memory-music-video", quantity: 1 }]);
  const payload = P.personalisationPayload(chosen, new Set());
  assert.equal(payload.units[0].memories[0].video, true);
  assert.ok(!("video" in P.personalisationPayload(moment, new Set()).units[0].memories[0]), "no flag unless chosen");

  const journey = draftFor("journey-6");
  const third = { ...journey, memoryVideo: journey.units[0].memories[2].id };
  const lines = P.draftLines(third);
  assert.equal(lines.filter((l) => l.sku === "memory-music-video").length, 1, "six songs, one video");
  assert.deepEqual(P.personalisationPayload(third, new Set()).units[0].memories.map((m) => m.video === true), [false, false, true, false, false, false]);
  // Changing to a product without that song removes the choice rather than moving it.
  assert.equal(P.chooseVariant(third, "moment").memoryVideo, null);
});

test("planning limits and platform: founder-supplied, pending verification, manual production only", () => {
  assert.deepEqual({ ...V.VIDEO_PLANNING_LIMITS }, { capacityPerPeriod: 45, maxVideoSeconds: 240, source: "FOUNDER_SUPPLIED_PROVIDER_LIMIT", verification: "PENDING_EXTERNAL_VERIFICATION" });
  assert.equal(V.SONG_TARGET_SECONDS, 195);
  assert.equal(V.SONG_MAX_SECONDS, 300);
  assert.deepEqual([...V.VIDEO_PRODUCTION_METHODS], ["MANUAL"]);
  assert.deepEqual({ ...V.VIDEO_PLATFORM }, { decision: "FOUNDER_SELECTED", account: "NOT_OPENED", integration: "PENDING", videoCapabilities: "PENDING_EXTERNAL_VERIFICATION" });
  assert.deepEqual([...V.VIDEO_DURATION_DECISIONS], ["ESCALATE_TO_FOUNDERS"], "no shortening option, and no full-song promise until the platform limit is verified");
  assert.ok(V.VIDEO_DURATION_STATUSES.includes("VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED"));
  assert.deepEqual([...V.VIDEO_JOB_STATUSES], ["INPUT_REQUIRED", "READY", "PRODUCTION_REQUIRED", "PRODUCTION_IN_PROGRESS", "CANDIDATE_READY", "QUALITY_CHECK_REQUIRED", "REWORK_REQUIRED", "READY_FOR_REVEAL", "REVEALED", "EXCEPTION"]);
  assert.ok(!V.VIDEO_JOB_STATUSES.some((s) => /APPROV/.test(s)), "no customer approval stage");
  const json = JSON.parse(read("public/api/data/video.json"));
  assert.equal(json.planning_limits.verification, "PENDING_EXTERNAL_VERIFICATION");
  assert.equal(json.price_minor, 4900);
});

test("customer copy is premium MCB: no AI, credits, generation or platform name; honest availability", () => {
  const copy = JSON.stringify(V.VIDEO_COPY) + read("src/pages/create/VideoOffer.tsx") + read("src/pages/order/VideoSection.tsx");
  assert.doesNotMatch(code(copy), /\bAI\b|credits?|generat|mozart/i);
  assert.deepEqual([...V.VIDEO_COPY.headline], ["Your memory.", "Your song.", "Your film."]);
  assert.equal(V.VIDEO_COPY.availability, "Limited monthly availability.");
  // The offer shows the server's own availability message; it never invents a count.
  const offer = read("src/pages/create/VideoOffer.tsx");
  assert.match(offer, /availability\.message/);
  assert.doesNotMatch(code(offer), /remaining\s*[=:]\s*\d|Math\.random|spaces left/);
  assert.match(offer, /disabled=\{full\}/, "cannot be added when fully booked");
});

test("analytics and offer counters carry no customer content", () => {
  const offer = read("src/pages/create/VideoOffer.tsx");
  // Only the params object is checked: the event name may depend on the choice, the data may not.
  for (const m of offer.matchAll(/trackFunnel\(([^)]*)\)/g)) assert.doesNotMatch(m[1].slice(m[1].indexOf("{")), /story|about|name|photo|memoryId|label/i, m[1]);
  assert.match(read("src/lib/videoOffer.ts"), /JSON\.stringify\(\{ event, productId \}\)/);
  const endpoint = read("public/api/video-offer-event.php");
  assert.match(endpoint, /INSERT INTO video_offer_counters \(day, product_id, event, count\)/);
  assert.doesNotMatch(code(endpoint), /ip_hash|email|order_id/i);
});

test("capacity is server-authoritative: locked holds before payment, reservation after, never oversold", () => {
  const session = read("public/api/checkout/session.php");
  assert.ok(session.indexOf("video_hold_for_checkout") < session.indexOf("stripe_request") || !session.includes("stripe_request"), "the hold comes before any Stripe session");
  assert.ok(session.indexOf("video_hold_for_checkout") < session.indexOf("$params = ["));
  assert.match(lib, /function video_lock_current_period[\s\S]*FOR UPDATE/);
  assert.match(lib, /video_period_used\(\$pdo, \(int\) \$period\['id'\]\) >= \(int\) \$period\['capacity'\]/);
  assert.match(lib, /'CAPACITY_EXCEPTION'/, "a payment without a space is an exception, not an oversell");
  assert.match(read("public/api/stripe/webhook.php"), /video_confirm_on_payment\(\$pdo, \$orderId\)/);
  assert.ok(V.VIDEO_HOLD_MINUTES > 24 * 60, "the hold outlives a Stripe Checkout session (24 h)");
  const readonly = lib.slice(lib.indexOf("function video_capacity_readonly("), lib.indexOf("\n}\n", lib.indexOf("function video_capacity_readonly(")));
  assert.doesNotMatch(readonly, /INSERT|UPDATE|DELETE/, "the Command Centre view writes nothing");
  assert.match(lib, /'PENDING ' \. strtoupper/, "capacity labelled pending platform verification");
});

test("the audio master is never edited; video masters are immutable copies verified by hash", () => {
  assert.doesNotMatch(code(lib + read("public/api/crm/video.php")), /UPDATE creative_masters|ffmpeg|sox |shell_exec|proc_open|\bexec\(/);
  assert.match(lib, /hash_file\('sha256', \$to \. '\/' \. \$c\['stored_name'\]\) !== \$c\['sha256'\]/);
  assert.match(lib, /UPDATE video_masters SET is_current = 0/);
  assert.doesNotMatch(lib, /UPDATE video_masters SET (stored_name|sha256|byte_size)/);
  assert.match(lib, /audio_master_changed/);
});

test("private delivery: signed ten-minute links, other orders refused, rights separate from marketing", () => {
  assert.match(lib, /\$exp = \(\$now \?\? time\(\)\) \+ 600;/);
  const player = read("public/api/order-video.php");
  assert.match(player, /vm\.order_id = :o/);
  assert.match(player, /X-Robots-Tag: noindex, nofollow/);
  assert.match(player, /find_access_token\(\$pdo, \$body\['token'\] \?\? null, 'STATUS'\)/);
  const media = read("public/api/order-video-media.php");
  assert.match(media, /rightsConfirmed/);
  assert.doesNotMatch(code(media), /customer_content_permissions/, "private production permission never becomes marketing permission");
  assert.match(V.VIDEO_MEDIA_RIGHTS_STATEMENT, /does not give MCB permission to use them publicly/);
  assert.doesNotMatch(code(read("src/pages/order/VideoSection.tsx")), /localStorage|sessionStorage/);
  // Staff players load authenticated files as blob: URLs; the site CSP must allow them (and nothing wider).
  assert.match(read("public/.htaccess"), /media-src 'self' blob:;/);
});

test("no platform call, credential or configuration", () => {
  for (const file of ["public/api/lib/video.php", "public/api/crm/video.php", "public/api/order-video.php", "public/api/order-video-media.php", "public/api/video-availability.php", "public/api/video-offer-event.php"]) {
    assert.doesNotMatch(code(read(file)), /curl_init|fsockopen|file_get_contents\(\s*['"]https?:|mozart/i, file);
  }
  assert.doesNotMatch(read("public/api/config.example.php"), /mozart|video_api|video.*api_key/i);
});
