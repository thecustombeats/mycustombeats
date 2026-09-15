/**
 * MCB Creative Factory core — provider-independent (15 September 2026).
 *
 * Policy and contracts: the 195-second target and 300-second ceiling kept
 * apart from physical capacity (UNVERIFIED, never invented), the DEFERRED
 * provider decision with no provider dependency, provider-neutral MCB
 * documents, minimal payloads and private surfaces. Run: npm test
 *
 * Server behaviour is proven against PHP in tests/creative-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => { const p = join(dir, name); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#|\*).*$/gm, "");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-cf-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as creative from "${root}src/data/production/creative.ts";
export * as ops from "${root}src/data/operations.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
`);
const outFile = join(root, "node_modules", `.mcb-cf-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
const M = await import(outFile);
const C = M.creative;
const generated = JSON.parse(read("public/api/data/creative.json"));

test("duration policy: 195-second target, 300-second ceiling, and five minutes is never the default", () => {
  assert.equal(C.CREATIVE_DURATION_POLICY.targetSeconds, 195);
  assert.equal(C.CREATIVE_DURATION_POLICY.maxSeconds, 300);
  assert.notEqual(C.CREATIVE_DURATION_POLICY.targetSeconds, C.CREATIVE_DURATION_POLICY.maxSeconds);
  assert.equal(C.targetProgrammeSeconds(4), 780);
  assert.notEqual(C.targetProgrammeSeconds(4), 4 * 300);
  assert.equal(generated.duration.target_seconds, 195);
  assert.equal(generated.duration.max_seconds, 300);
  // Every place a duration defaults, it defaults to the target.
  const factory = code(read("public/api/lib/creative-factory.php"));
  assert.match(factory, /'target_duration_seconds' => \(int\) \$policy\['target_seconds'\]/);
  assert.doesNotMatch(factory, /'target_duration_seconds' => \(int\) \$policy\['max_seconds'\]/);
});

test("physical capacity is a separate policy from the current catalogue, UNVERIFIED with no invented figures", () => {
  const physical = M.catalogue.PRODUCTS.flatMap((p) => p.variants).filter((v) => v.fulfilment === "PHYSICAL" && v.vinyl && v.songCount);
  assert.deepEqual(C.PHYSICAL_MEDIA_CAPACITY_POLICY.map((p) => p.sku).sort(), physical.map((v) => v.sku).sort());
  for (const p of C.PHYSICAL_MEDIA_CAPACITY_POLICY) {
    const v = physical.find((x) => x.sku === p.sku);
    assert.equal(p.songCount, v.songCount, p.sku);
    assert.equal(p.sideCount, v.vinyl.discCount * 2, p.sku);
    assert.equal(p.status, "UNVERIFIED");
    for (const f of ["verifiedTotalCapacitySeconds", "verifiedPerSideSeconds", "preferredProgrammeSeconds", "hardManufacturingMaximumSeconds", "source", "lastVerifiedDate"]) assert.equal(p[f], null, `${p.sku}.${f}`);
    for (const f of ["sku", "format", "sideCount", "version", "masteringNotes", "supplierRestrictions"]) assert.ok(f in p);
  }
  assert.deepEqual([...new Set(C.PHYSICAL_MEDIA_CAPACITY_POLICY.map((p) => p.songCount))].sort((a, b) => a - b), [1, 3, 4, 6, 12]);
  const qc = code(read("public/api/lib/creative-qc.php"));
  assert.match(qc, /'CAPACITY_UNVERIFIED'/);
  assert.match(qc, /'audio_modified' => false/);
  assert.doesNotMatch(qc, /ffmpeg|sox|lame|shorten|time_stretch|speed_up|exec\(|shell_exec|proc_open/i, "no automatic editing or compression");
});

test("Mozart AI founder selected, integration pending: no PRIMARY, no adapter but MANUAL, every candidate capability UNKNOWN", () => {
  assert.equal(C.PROVIDER_DECISION_STATUS, "FOUNDER_SELECTED");
  assert.equal(C.PROVIDER_INTEGRATION_STATUS, "PENDING");
  assert.deepEqual({ ...C.SELECTED_MUSIC_PLATFORM }, { providerId: "candidate-mozart-ai", name: "Mozart AI", decision: "FOUNDER_SELECTED", account: "NOT_YET_OPENED", integration: "PENDING", capabilitiesVerified: false });
  const candidates = C.PROVIDER_REGISTRY.filter((p) => p.kind === "CANDIDATE");
  assert.ok(candidates.length >= 2);
  for (const p of candidates) {
    assert.equal(p.role, "DISABLED");
    assert.equal(p.adapter, null);
    assert.ok(Object.values(p.capabilities).every((v) => v === "UNKNOWN"), p.id);
    assert.deepEqual(Object.keys(p.capabilities).sort(), [...C.PROVIDER_CAPABILITY_FIELDS].sort());
  }
  assert.ok(!C.PROVIDER_REGISTRY.some((p) => p.role === "PRIMARY" || p.role === "FALLBACK"));
  const providers = code(read("public/api/lib/creative-providers.php"));
  for (const m of ["prepare", "validateCapability", "generate", "status", "retrieve", "normaliseMetadata", "registerCandidate", "handleError"]) assert.match(providers, new RegExp(`public function ${m}\\(`), m);
  assert.match(providers, /'primary' => null/);
  assert.match(providers, /return \$providerId === 'manual' \? new ManualProviderAdapter\(\) : null;/);
});

test("no ElevenLabs/Mozart dependency, provider key or external music call anywhere in code", () => {
  const files = [...walk("src"), ...walk("public/api"), "package.json"].filter((p) => /\.(ts|tsx|php|mjs|json)$/.test(p) && !p.startsWith("src/data/production/creative.ts") && !p.startsWith("public/api/data/") && !/^public\/api\/(_test-|config\.php$)/.test(p));
  for (const p of files) {
    const text = code(read(p));
    assert.doesNotMatch(text, /elevenlabs|eleven_music|mozart|xi-api-key|api\.elevenlabs|suno|udio\.com/i, p);
  }
  for (const p of walk("public/api").filter((f) => /creative/.test(f) && f.endsWith(".php"))) {
    assert.doesNotMatch(code(read(p)), /curl_init|file_get_contents\(\s*['"]https?:|fsockopen|stream_socket_client/, `${p} makes no network call`);
  }
  const pkg = JSON.parse(read("package.json"));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /eleven|mozart|music|suno/i.test(d)));
  assert.doesNotMatch(read("public/api/config.example.php"), /eleven|mozart|music_api_key|'api_key' => '[^']+'/i);
});

test("MCB documents are provider-neutral; the provider payload is the smallest possible", () => {
  const qc = code(read("public/api/lib/creative-qc.php"));
  assert.match(qc, /'schema' => 'mcb\.composition_plan\.v1'/);
  for (const k of ["type", "target_seconds", "lyric_section_index", "instrumentation", "positive_directions", "negative_directions", "emotional_role", "adherence", "fact_refs"]) assert.match(qc, new RegExp(`'${k}' =>`), k);
  const payloadFn = code(read("public/api/lib/creative-providers.php")).split("function creative_provider_payload")[1];
  for (const forbidden of ["mcb_reference", "email", "story", "fact", "ledger", "order_id", "address", "phone", "stripe", "memory"]) {
    assert.doesNotMatch(payloadFn, new RegExp(`'${forbidden}`, "i"), forbidden);
  }
  for (const allowed of ["request_id", "duration", "music", "sections", "lyrics", "title"]) assert.match(payloadFn, new RegExp(`'${allowed}'`), allowed);
});

test("data minimisation: the factory intake selects only creative columns", () => {
  const intake = code(read("public/api/lib/creative-factory.php")).split("function creative_intake")[1].split("\nfunction ")[0];
  for (const forbidden of ["email", "phone", "whatsapp", "address", "stripe", "total_minor", "amount", "customer_id", "affiliate", "ip_hash", "delivery", "checkout_token", "supplier", "margin"]) {
    assert.doesNotMatch(intake, new RegExp(forbidden, "i"), forbidden);
  }
});

test("Fact Ledger classifications, lyric sections, QC outcomes and master kinds are the defined contracts", () => {
  assert.deepEqual([...C.FACT_CLASSIFICATIONS], ["EXACT", "SEMANTIC", "CREATIVE_GUIDANCE"]);
  for (const t of ["NAME", "RELATIONSHIP", "DATE", "YEAR", "PLACE", "OCCASION", "MILESTONE", "MEMORY", "TRAVEL_MEMORY", "REQUESTED_PHRASE", "MUSIC_DIRECTION", "MOOD", "EXCLUSION"]) assert.ok(C.FACT_TYPES.includes(t), t);
  for (const s of ["INTRO", "VERSE", "PRE_CHORUS", "CHORUS", "BRIDGE", "OUTRO", "INSTRUMENTAL", "SPOKEN"]) assert.ok(C.LYRIC_SECTION_TYPES.includes(s), s);
  assert.deepEqual([...C.ATTEMPT_OUTCOMES], ["PROVIDER_FAIL", "TECHNICAL_FAIL", "FACT_FAIL", "CREATIVE_FAIL", "PASS"]);
  assert.deepEqual([...C.CREATIVE_QC_OUTCOMES], ["PASS", "REGENERATE", "ESCALATE"]);
  assert.deepEqual([...C.MASTER_KINDS], ["PRODUCTION_MASTER", "CUSTOMER_LISTENING_COPY", "PHYSICAL_MEDIA_MASTER"]);
  assert.ok(C.AUDIO_CONTAINERS.includes("FLAC") && C.AUDIO_CONTAINERS.includes("WAV"));
  for (const g of ["pop", "rock", "country", "dance", "ballad", "jazz", "swing", "ballroom", "waltz"]) assert.ok(C.GENRE_FAMILIES.includes(g), g);
  assert.equal(C.STYLE_TO_DIRECTION.Waltz.genre, "waltz");
  assert.ok(C.DEFAULT_MAX_GENERATION_ATTEMPTS >= 1 && C.DEFAULT_MAX_GENERATION_ATTEMPTS <= 10);
  // Every catalogued style maps, so a customer's choice is never silently dropped.
  const styles = JSON.parse(read("public/api/data/personalisation.json")).styles;
  for (const s of styles) assert.ok(C.STYLE_TO_DIRECTION[s], s);
});

test("automation events and founder notifications include the Creative Factory, without private text", () => {
  const need = ["CREATIVE.JOB_READY", "CREATIVE.FACT_LEDGER_READY", "CREATIVE.STORY_MAP_READY", "CREATIVE.LYRICS_REQUIRED", "CREATIVE.LYRICS_READY", "CREATIVE.PLAN_READY", "CREATIVE.GENERATION_REQUIRED", "CREATIVE.GENERATION_STARTED", "CREATIVE.CANDIDATE_READY", "CREATIVE.TECHNICAL_QC_PASSED", "CREATIVE.FACT_QC_PASSED", "CREATIVE.CREATIVE_QC_REQUIRED", "CREATIVE.CREATIVE_QC_PASSED", "CREATIVE.MASTER_READY", "CREATIVE.ALBUM_QC_REQUIRED", "CREATIVE.ALBUM_READY", "AUDIO.CAPACITY_CHECK_REQUIRED", "AUDIO.CAPACITY_PASSED", "AUDIO.CAPACITY_EXCEPTION", "CREATIVE.EXCEPTION"];
  for (const e of need) assert.ok(M.ops.AUTOMATION_EVENTS.includes(e), e);
  assert.equal(M.ops.EVENT_MODEL["CREATIVE.READY"], "QUALITY_CHECK.READY", "existing semantics reused");
  const types = M.ops.FOUNDER_NOTIFICATIONS.map((n) => n.type);
  assert.ok(types.includes("CREATIVE_EXCEPTION") && types.includes("AUDIO_CAPACITY_EXCEPTION"));
  const factory = code(read("public/api/lib/creative-factory.php"));
  for (const call of factory.match(/notify_founders_about_order\([^;]+;/g) ?? []) {
    assert.doesNotMatch(call, /story|lyric|text|transcript|value/i, call);
  }
});

test("private surfaces: staff-only, audited, not indexed, no analytics, nothing public", () => {
  for (const p of ["public/api/crm/creative.php", "public/api/crm/creative-file.php"]) {
    const src = code(read(p));
    assert.match(src, /require_crm_key\(\);/, p);
    assert.match(src, /creative_access_log/, p);
  }
  assert.match(read("public/api/.htaccess"), /RedirectMatch 403 \^\/api\/data\//);
  assert.doesNotMatch(read("public/catalogue.json"), /target_seconds|max_seconds|fact_ledger|capacity_profile|verified_per_side|provider_decision|composition_plan|lyric_package|generation_attempt|music_direction/i);
  for (const p of walk("src").filter((f) => !f.startsWith("src/data/production/"))) assert.doesNotMatch(read(p), /data\/production\/creative/, p);
  assert.match(read("src/lib/analytics.ts"), /operations/, "the staff console is excluded from analytics");
  const panel = read("src/pages/operations/CreativeFactoryPanel.tsx");
  assert.doesNotMatch(panel, /localStorage|sessionStorage|document\.cookie|gtag|dataLayer/);
  assert.match(read("public/api/config.example.php"), /Retention of creative material: NOT SET/);
});
