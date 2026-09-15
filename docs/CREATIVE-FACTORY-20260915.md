# MCB™ Creative Factory Core — provider-independent

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `478eb469`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO MUSIC PROVIDER SELECTED, CONNECTED, KEYED OR CALLED. NO PAID ACTION.**

The factory builds everything around music generation, so a provider can later be connected through an adapter. **Provider decision: DEFERRED.** Until it changes, songs wait at `GENERATION_REQUIRED` (awaiting a provider), and staff can register manually generated audio to test the whole pipeline.

## 1. Pipeline

```
ORDER.READY_FOR_PROCESSING → creative job (one per song) → memory ingestion → FACT LEDGER
→ ALBUM MAP (several songs, first) → STORY MAP → LYRIC PACKAGE → LYRIC FACT QC (+ person's semantic review)
→ MUSIC DIRECTION → MCB COMPOSITION PLAN → GENERATION REQUIRED → provider adapter (DEFERRED → MANUAL)
→ CANDIDATE → TECHNICAL QC → FACT/CONTENT QC → CREATIVE QC → MCB MASTER
→ ALBUM QC (several songs) → PHYSICAL CAPACITY QC (records) → MCB's existing quality check → reveal / fulfilment
```

- **Automatic steps:**
  - jobs and albums;
  - Fact Ledger v1, from what the customer supplied only;
  - album map and story skeletons;
  - Music Direction, derived from the customer's catalogued style;
  - the composition plan, derived from reviewed lyrics;
  - every objective check;
  - the provider route.
- **Where it stops for a person, or a future AI job/provider:**
  - authored lyrics;
  - semantic review;
  - generation;
  - Creative QC;
  - album review;
  - exceptions.
- **No customer approval** exists anywhere in the factory. All correction and regeneration is internal.

Job statuses: `LYRICS_REQUIRED`, `LYRICS_QC_FAILED`, `LYRICS_REVIEW_REQUIRED`, `PLAN_REQUIRED`, `GENERATION_REQUIRED` (`waiting_on: AWAITING_PROVIDER`), `CANDIDATE_QC`, `FACT_REVIEW_REQUIRED`, `CREATIVE_QC_REQUIRED`, `MASTER_REQUIRED`, `MASTER_READY`, `EXCEPTION`.

## 2. Policies (`src/data/production/creative.ts` → server-only `api/data/creative.json`)

| Policy | Value |
|---|---|
| Target song duration | **195 s (3:15)** — the default everywhere a duration defaults |
| Maximum individual song | **300 s (5:00)** — a ceiling, never the default |
| Normal target programme | songs × 195 s (4 songs = **780 s**, not 1,200 s) |
| Plan tolerance | plan sections total within ±10% of the target, never above 300 s |
| Preferred finished window | not set (optional server config); only the ceiling rejects, and the deviation from 195 s is recorded |
| Physical capacity | a separate policy: one profile per record SKU from the current catalogue (sides = discs × 2). **All UNVERIFIED, with null figures.** |
| Attempts per song | 3 by default (`creative.max_generation_attempts`, 1–10) |
| Minimum production sample rate | 44.1 kHz by default (`creative.min_sample_rate_hz`) |

**Verified capacity** can only come from `api/data/physical-capacity.json` (server-only), with these fields:
- `sku`, `version`;
- `verified_per_side_seconds` and/or `verified_total_capacity_seconds`;
- optional `hard_manufacturing_maximum_seconds` and `preferred_programme_seconds`;
- `source`, `last_verified_date`, `mastering_notes`, `supplier_restrictions`.

An incomplete entry is ignored and the capacity stays UNVERIFIED.

## 3. Documents: versioned and immutable (`creative_artifacts`)

| Document | Scope | Content |
|---|---|---|
| **Fact Ledger** | album | facts with `id, type, value, accepted_forms, pronunciation, source, classification (EXACT / SEMANTIC / CREATIVE_GUIDANCE), importance, tracks, verification`, plus `exclusions` |
| **Album map** | album (2+ songs), created **before** song briefs | per track: number, working title, memory, narrative role, allocated facts, emotional role, target duration, energy, relationship to neighbours, deliberate variation; duplication controls |
| **Story map** | song | opening, progression, important memories, emotional build, central statement, climax, resolution, allocated facts, musical movement (songs need not share one structure) |
| **Lyric package** | song | title; sections INTRO / VERSE / PRE_CHORUS / CHORUS / BRIDGE / OUTRO / INSTRUMENTAL / SPOKEN with text, direction, fact references, emotional intention; pronunciation notes; exclusions |
| **Music Direction** | song | genre, subgenre, era influence, BPM range, key, mode, time signature, instrumentation, vocal presentation and intensity, mood, energy, production character, language, positive and negative directions, target and maximum duration. Artist imitation is refused; describe characteristics instead. |
| **MCB composition plan** | song | ordered sections: type, target seconds, lyric section, instrumentation, positive and negative direction, emotional role, adherence (STRICT for fact-bearing sections), fact references. Schema `mcb.composition_plan.v1`; no provider format. |

Fact Ledger v1 holds only what the customer supplied:
- memory → SEMANTIC, CRITICAL;
- about → RELATIONSHIP, SEMANTIC;
- occasion → SEMANTIC;
- a chosen style → SEMANTIC;
- "Let MCB choose" → CREATIVE_GUIDANCE.

No EXACT fact is inferred. Names, dates and places are added in a new version by a person, or later by an AI extraction job. A revision cannot remove or reword a customer-supplied fact.

## 4. Lyric and content fact QC

Objective checks (`creative_fact_qc`) compare lyrics (or a supplied transcript of what was sung) with the Fact Ledger and the track's allocation. Matching works on normalised word-token sequences with transliteration, never raw substrings.

| Check | Result |
|---|---|
| `INCORRECT_EXACT_FACT` — a near miss of an EXACT fact ("Margret" for "Margaret") | FAIL |
| `MISSING_REQUIRED_EXACT_FACT` — a CRITICAL or referenced EXACT fact absent | FAIL |
| `ALLOCATED_MEMORY_NOT_REFERENCED` — the track's memory not used | FAIL |
| `UNALLOCATED_FACT_REFERENCE` | FAIL |
| `WRONG_CUSTOMER_CONTAMINATION` — another customer's EXACT name or place | FAIL |
| `PROHIBITED_PHRASE` — ledger exclusions plus `creative.prohibited_phrases` | FAIL |
| `DUPLICATED_LYRICS` — word 3-shingle similarity ≥ 0.6 with another track | FAIL |
| `UNSUPPLIED_YEAR` — possibly an invented fact | REVIEW |
| SEMANTIC facts allocated to the track | REVIEW by a person |

`creative_semantic_reviewer()` is the interface for a future AI-assisted semantic reviewer; it is **DEFERRED** today. Objective failures can't be reviewed away.

## 5. Provider boundary (`lib/creative-providers.php`)

- **Interface:** `MusicProviderAdapter` defines `prepare`, `validateCapability`, `generate`, `status`, `retrieve`, `normaliseMetadata`, `registerCandidate` and `handleError`.
- **Adapters:** only `ManualProviderAdapter` exists.
- **Roles:** PRIMARY / FALLBACK / MANUAL / DISABLED. The candidates (Eleven Music, Mozart AI) are DISABLED, have no adapter, and every capability is **UNKNOWN**.
- **Route:** `creative_generation_route()` returns `primary: null` while DEFERRED, even if server config names one.
- **Provider payload** (`creative_provider_payload`) contains only an opaque request id, duration, music characteristics, sections with the words to sing, and the title. It never includes an order reference, name, contact, story, Fact Ledger or photographs.
- **Capability registry fields:** supplied lyrics, structured plans, duration maximum, formats, lossless output, stems, reference audio, editing/inpainting, async jobs, multilingual, pronunciation control, seed/reproducibility, metadata, commercial-use review, privacy review, API availability, cost model.

## 6. Attempts, QC and masters

- **Attempts** (`creative_generation_attempts`) are one row each and never overwritten. Each records:
  - the versions of ledger, story, lyrics, direction and plan;
  - provider, model and generation id;
  - requested and actual duration, requested output;
  - status, failure reason;
  - estimated and actual cost where reported;
  - timestamps.
- **Outcomes:** PROVIDER_FAIL, TECHNICAL_FAIL, FACT_FAIL, CREATIVE_FAIL, PASS.
- **Retry cap:** reaching the cap makes the song **CREATIVE_EXCEPTION**, with an event and a founder notification (no lyrics or story). Any further attempt is refused. A person may authorise exactly one more attempt, with a note.
- **Technical QC** reads the audio header only; there is no decoding and no toolchain.
  - **Formats:** WAV, FLAC and AIFF give duration, sample rate and channels. MP3 is readable but has no reliable header duration, so it fails `DURATION_READABLE` as a candidate.
  - **Checks:** file exists, readable, supported type, duration readable, duration ≤ 300 s, sample rate, channels, size, SHA-256, order and reference match, job match, attempt match.
  - **Short songs:** a valid shorter song is not rejected for missing 195 s.
- **Creative QC** is a person's: emotional impact, lyric quality, vocal quality, musical quality, production quality, genre fit, story fit, memorability, pronunciation and premium standard, each PASS or CONCERN. The outcome is PASS (no concerns), REGENERATE or ESCALATE.
- **Masters** (`creative_masters`):
  - A PRODUCTION_MASTER is promoted only from a candidate with technical, fact and creative QC all passed. It stores QC evidence, versions and provenance, and is versioned, never overwritten.
  - CUSTOMER_LISTENING_COPY and PHYSICAL_MEDIA_MASTER are separate registered files, with `derived_from_master_id` and a conversion note. MCB transcodes nothing.

## 7. Album and physical programme

- **Album QC** for 2+ songs:
  - **Objective checks:** expected master count, sequence, chapter allocation against the album map, missing memories, duplicated titles, duplicated lyrics, every track's QC complete, total programme.
  - **A person's review:** narrative progression, musical cohesion, deliberate variation.
  - The album must PASS before physical fulfilment.
- **Vinyl programme QC:** track durations are split into contiguous sides in track order, balanced to minimise the longest side, then compared **only** with VERIFIED capacity.
  - **Unverified capacity** → `CAPACITY_UNVERIFIED`.
  - **Exceeded capacity** → `AUDIO_CAPACITY_EXCEPTION`, with an event and a founder notification.
  - Audio is never shortened, sped up, compressed, edited or removed (`audio_modified: false`).

## 8. Gate into MCB's existing quality check and fulfilment

`creative_fulfilment_gate()` runs at `PASS_QUALITY_CHECK`; the capacity check also runs at `AUTHORISE_SUPPLIER_PURCHASE`.

| `creative.enforcement` | Effect |
|---|---|
| `ADVISORY` (default in this RC) | unfinished factory work is returned as a warning |
| `REQUIRED` | every song mastered, album QC PASS and (records) capacity PASSED before the quality check can pass |
| both | an exceeded **VERIFIED** capacity blocks the quality check and the purchase authorisation |

- **Moment:** MASTER READY → existing QC → reveal.
- **Record:** all masters + album QC + artwork READY + capacity PASSED + final QC → FULFILMENT READY.

## 9. Events and notifications

**Events:**
- CREATIVE.JOB_READY, FACT_LEDGER_READY, STORY_MAP_READY, LYRICS_REQUIRED, LYRICS_READY, PLAN_READY
- CREATIVE.GENERATION_REQUIRED, GENERATION_STARTED, CANDIDATE_READY
- CREATIVE.TECHNICAL_QC_PASSED, FACT_QC_PASSED, CREATIVE_QC_REQUIRED, CREATIVE_QC_PASSED
- CREATIVE.MASTER_READY, ALBUM_QC_REQUIRED, ALBUM_READY, EXCEPTION
- AUDIO.CAPACITY_CHECK_REQUIRED, CAPACITY_PASSED, CAPACITY_EXCEPTION

All are deduplicated and published through `/api/crm/automation-events`. The existing CREATIVE.READY ≡ QUALITY_CHECK.READY mapping is unchanged.

**Founder notifications:** CREATIVE_EXCEPTION and AUDIO_CAPACITY_EXCEPTION. They carry a reason code only.

## 10. Staff surfaces

- **`GET /api/crm/creative?order_id=&staff=`:** everything for the order. Access is logged.
- **`POST /api/crm/creative`:** `UPDATE_FACT_LEDGER`, `UPDATE_ALBUM_MAP`, `UPDATE_STORY_MAP`, `UPDATE_MUSIC_DIRECTION`, `SUBMIT_LYRICS`, `LYRICS_REVIEW`, `SUBMIT_PLAN`, `RECORD_PROVIDER_FAILURE`, `FACT_REVIEW`, `CREATIVE_QC`, `PROMOTE_MASTER`, `ALBUM_QC_REVIEW`, `RUN_CAPACITY_CHECK`, `RESOLVE_EXCEPTION`.
- **`POST /api/crm/creative-file`** (multipart): `REGISTER_CANDIDATE`, `REGISTER_DERIVED_MASTER`. **`GET`** downloads, with access logged.
- **`GET /api/crm/creative?view=metrics&staff=`:**
  - attempts per song, generation minutes, failure rate;
  - regeneration reasons, attempts per master, production time;
  - per-provider figures;
  - cost only where a provider reports it (null today).
- **`GET /api/crm/creative?view=providers`:** the decision and capability registry.
- **`/operations`:** a Creative Factory panel on each paid order. Provider candidates are code-reviewed data, not a runtime form.

## 11. Privacy and security

- **Access:**
  - CRM key only, with a staff name for every read; the worker key is refused.
  - Every object is checked against the order named, so another order's ids return 404.
- **Storage:** audio lives in private storage (`mcb-uploads/creative/`, random names, 0600), and policy files are denied over HTTP.
- **Public surfaces:** no analytics on `/operations`; nothing in the public catalogue or the customer page.
- **Notifications and events:** no lyrics, story or name.
- **Retention of creative material:** **NOT SET**, pending legal review.

## 12. Database — prepared, not run

`db/migrations/2026-09-15-creative-factory.sql` only creates tables. It is idempotent, and applied to the previous schema it equals a fresh `db/schema.sql` (tested). It adds seven tables: `creative_albums`, `creative_jobs`, `creative_artifacts`, `creative_generation_attempts`, `creative_candidates`, `creative_masters` and `creative_access_log`. Preflight check: `creative_factory_migration_applied`.

## 13. Not built, by decision

- The music provider, its adapter, account, key and costs.
- AI lyric writing, fact extraction and semantic QC. Only the interfaces and contracts exist.
- Audio decoding, loudness measurement and transcoding.
- Manufacturer capacity figures.
- A retention period for creative material.
