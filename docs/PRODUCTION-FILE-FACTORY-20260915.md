# MCB™ Production File Factory

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `25c428e1`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO MUSIC OR ARTWORK PROVIDER SELECTED OR CALLED. NO SUPPLIER PURCHASE. NO PAID ACTION.**

## 1. Pipeline

```
MCB AUDIO MASTER(S) + CUSTOMER PHOTO(S) + PERSONALISATION
→ ARTWORK CREATIVE JOB (one per record)        → source-photo preparation where needed
→ CREATIVE ART MASTER (MCB's composition)      → MCB VISUAL QC (PASS / REWORK / ESCALATE)
→ PRODUCTION RENDER JOB (art master × template id × template version × SKU × output spec)
→ PRINT PRODUCTION MASTER                       → AUTOMATED FILE QC (+ MCB manual safe-zone review)
→ AUDIO CAPACITY QC (Creative Factory, verified capacity only)
→ MANUFACTURING PACKAGE (READY / NOT_READY / MANUFACTURING_DATA_REQUIRED)
→ MCB final quality check → FULFILMENT.READY (= FULFILMENT.APPROVAL_REQUIRED)
→ Bella OR Lewis authorises (own code) → supplier order placed BY HAND → recorded
```

- **No customer approval** of artwork or anything else.
- **No new order state machine:** the factory sits under the existing lifecycle (creative → quality check → fulfilment ready).

## 2. Art is not manufacturing

- **Creative Art Master** (`artwork_art_masters`)
  - MCB's artistic composition for a record. It has no template id and is never template-dependent.
  - Each version records source photos (same order and record only), personalisation (Fact Ledger) version, a hash of the job input, creation method (MANUAL_DESIGN or MCB_INTERNAL today; AI_PROVIDER and OTHER_APPROVED_PROVIDER exist but are refused while the provider is DEFERRED), provider, file facts, SHA-256 and visual QC.
  - New versions never overwrite old ones. A new art master makes previous print files non-current; they are not deleted.
- **Print Production Master** (`print_production_masters`)
  - Rendered from one art master to one template id and version, through a render job.
  - Versioned and never overwritten or deleted.
  - Records its file QC, safe-zone status and lineage (render job → art master).
- **Template changes:** a new template version needs a new render job (unique per art master × template × version), which produces a new print-master version. Old files stay tied to their old template version.

## 3. Artwork Creative Job input (minimal)

The job input contains:
- reference, product (SKU and name);
- photo references with dimensions and preparation status;
- occasions;
- EXACT and occasion/milestone facts from the Fact Ledger, and its version;
- album and track titles;
- internal visual direction;
- MCB brand rules (general only; the full brand guidelines are not in the repository);
- the product's template context;
- provider decision DEFERRED.

It never includes an address, email, phone, payment data, costs, margin, credentials or story text.

## 4. Visual QC

- **Criteria:** correct photographs, names, dates, title, occasion; spelling; image quality; crop/composition; facial visibility (or not applicable); text legibility; visual balance; premium standard; MCB branding (or not applicable); no other customer's material.
- **Outcomes:**
  - PASS (no concerns) creates the render jobs.
  - REWORK sends it back for a new version.
  - ESCALATE raises ARTWORK_EXCEPTION to the Founders (reason code only).

## 5. Source photographs

- **Unchanged rule:** artwork-ready means square and at least 2500 × 2500 px; larger squares pass. The £15 Artwork Preparation Service is once per order, and multiple unready photos raise ARTWORK_EXCEPTION with no automatic charge.
- **Preparation records:** SOURCE_READY → PREPARATION_REQUIRED → PREPARATION_IN_PROGRESS → PREPARED (a note of what was done plus confirmation that people and content were preserved), or UNUSABLE (with a note, and ARTWORK_EXCEPTION) or EXCEPTION.
- **Use in art masters:** an art master may only use SOURCE_READY or PREPARED photographs. Nothing invents or replaces faces or details.

## 6. Templates, safe zones, file QC

The templates are exactly as supplied:

| Template | Geometry | Missing from the manufacturer |
|---|---|---|
| Sleeve front | 3756 × 3827 px, bleed and top/bottom spine 3 mm / 35 px | — |
| Sleeve back | 3756 × 3756 px, bleed 3 mm / 35 px | — |
| 12-inch disc | 302 mm, 7.23 mm hole, 2–3 mm bleed, 38.1 mm creative exclusion | pixel canvas |
| 10-inch / 7-inch disc | 250 mm / 174 mm | holes not verified; pixel canvas |
| Heart, double gatefold | — | TEMPLATE_REQUIRED |

- **`manufacturingDataRequired`:** the missing items a package cannot do without: disc pixel canvas, heart dieline, gatefold template.
- **Safe zones:** every safe zone is `UNVERIFIED` and nothing is invented. Each print file needs MCB's manual review (important faces and text clear of trim edges and the centre exclusion). It is recorded as `MANUAL_REVIEW_PASSED`.
- **File QC checks:**
  - file exists, readable, type;
  - exact dimensions (sleeves) or square (discs);
  - orientation;
  - template id, version and metadata (the render job's output spec must equal the current template);
  - bleed, spine and centre-exclusion metadata;
  - safe zone;
  - trim metadata (`MISSING_FROM_MANUFACTURER` where not supplied);
  - order/reference, SKU, art master (current and visually passed), source association;
  - hash.
- **Failures:** nothing is stored, the render job shows `FILE_QC_FAILED`, and the queue shows a production exception.

## 7. Manufacturing package (`manufacturing_packages`)

**Canonical and internal.** It contains:
- order and records (SKU, quantity);
- ordered tracks with titles, audio master ids/versions, hashes and durations, and physical media masters;
- side allocation, programme length and capacity result;
- album QC and album title;
- art master and print masters with template versions and safe-zone status;
- other physical items with the personalisation they need (plaque text, frame heading);
- final MCB QC;
- delivery address present (yes/no only);
- status and blockers.

It holds no credentials, costs or address. It is versioned by content: rebuilding the same content is the same version, so repeated builds or events create no duplicate package, event, pack or notification.

| Status | When |
|---|---|
| **READY** | audio masters ready + album QC PASS + art master visual QC PASS + every production file current and QC-passed + VERIFIED capacity PASSED + final MCB QC passed + delivery address on record |
| **MANUFACTURING_DATA_REQUIRED** | only manufacturer information is missing (template data, unverified capacity). Never shown as READY. Raises a FULFILMENT_EXCEPTION notification (reason only). |
| **NOT_READY** | anything MCB still has to do, named per blocker (e.g. `RECORD_12:TRACK_6:AUDIO_MASTER_MISSING`, `…:PRODUCTION_FILE_NOT_READY:SLEEVE_12_FRONT`, `…:AUDIO_CAPACITY_EXCEPTION`) |

**Gating** follows `creative.enforcement`:
- **REQUIRED:** a physical order cannot become fulfilment-ready, be authorised or be recorded as ordered until the package is READY.
- **ADVISORY:** the package is built and shown to the founder, and a known capacity overflow still blocks.

## 8. Founder approval and the supplier order pack

- **Notification:** FULFILMENT_APPROVAL_REQUIRED carries reference, product, payment VERIFIED, QC PASSED, manufacturing package status, the required action and the deep link. No story, photo, address, supplier, link or cost.
- **Protected page:** the deep link `/operations#order=…&action=AUTHORISE_SUPPLIER_PURCHASE` opens a CRM-signed-in page showing:
  - order, product, payment, QC, supplier order readiness;
  - manufacturing package status, version and blockers;
  - the supplier order pack: supplier, configuration, estimated cost, delivery provision, supplier product link, destination limitations, notes.
  - Opening it authorises nothing.
- **Supplier order pack** (`supplier_order_packs`, STAFF ONLY):
  - Prepared automatically when a package is READY.
  - Contains lines with internal supplier data from `api/data/supplier-orders.json` (server-only, never committed; `NOT_ON_FILE` when absent), production files, audio masters, sides, and the delivery details needed to order by hand.
  - States: `PREPARED` → `ORDER_PLACED` (who, when) → `SUPERSEDED`.
- **Financial control:**
  - Only Bella or Lewis authorises, with their own code (AUTHORISE_SUPPLIER_PURCHASE).
  - The order can be recorded as placed (CONFIRM_FULFILMENT) only after that, and the pack records it.
  - No code purchases, pays, refunds or subscribes.

## 9. Files, limits, formats

- **Role limits** (`uploads.role_limits`), never compression:

| Role | Default |
|---|---|
| CUSTOMER_SOURCE_PHOTO | 10 MB |
| CREATIVE_ART_MASTER | 100 MB |
| PRINT_PRODUCTION_MASTER | 100 MB |
| AUDIO_PRODUCTION_MASTER | 250 MB |
| CUSTOMER_LISTENING_COPY | 50 MB |

- **Server upload settings:** staff endpoints in `api/crm/` get 260 MB PHP upload limits (`api/crm/.user.ini`, `api/crm/.htaccess`). The customer photo endpoint keeps 11 MB. Preflight reports whether the host honours them. Oversized files are refused with a named role (413).
- **Storage:** private (`mcb-uploads/production/art`, `…/print`), random names, 0600. Downloads need the CRM key and a staff name, and are logged.
- **MP3:** a supported format, but duration inspection is `NOT_AVAILABLE` with header-only PHP. An MP3 listening copy is accepted. An MP3 candidate or production master cannot pass the duration checks (`DURATION_INSPECTION_NOT_AVAILABLE_FOR_FORMAT`), rather than being called unsupported. A future audio probe (for example an ffprobe-capable worker) would lift this. WAV, FLAC and AIFF remain the preferred production formats.

## 10. Events

**New events:** ARTWORK.CREATIVE_JOB_READY, ARTWORK.CREATIVE_MASTER_READY, ARTWORK.VISUAL_QC_REQUIRED, ARTWORK.VISUAL_QC_PASSED, PRODUCTION.RENDER_REQUIRED, PRODUCTION.MASTER_READY, PRODUCTION.FILE_QC_PASSED, MANUFACTURING.PACKAGE_REQUIRED, MANUFACTURING.PACKAGE_READY, MANUFACTURING.DATA_REQUIRED.

**Reused:**
- FULFILMENT.APPROVAL_REQUIRED ≡ FULFILMENT.READY
- ARTWORK.READY (a component's current print file)
- existing exception notifications (ARTWORK_EXCEPTION, FULFILMENT_EXCEPTION, AUDIO_CAPACITY_EXCEPTION)

All events are deduplicated.

**Exceptions route internally:** ARTWORK_EXCEPTION, ARTWORK_TEMPLATE_REQUIRED, ARTWORK_SAFE_ZONE_UNVERIFIED (enforced as a manual review step), PRODUCTION_FILE_EXCEPTION (queue), AUDIO_CAPACITY_EXCEPTION, MANUFACTURING_DATA_REQUIRED, FULFILMENT_EXCEPTION.

## 11. Staff UX

- **Structured panel:** on `/operations`, a *Production files and manufacturing package* panel covers:
  - visual direction;
  - photo preparation buttons;
  - art master upload (method, photos);
  - visual QC dropdowns;
  - print file upload per component with the safe-zone review tick;
  - package status, blockers and rebuild;
  - supplier pack summary.
- **Founder card:** the approval card shows the package and pack.
- **Advanced JSON:** raw JSON document editing in the Creative Factory panel is labelled **ENGINEERING / ADVANCED** and is not the founder workflow.

## 12. Database — prepared, not run

`db/migrations/2026-09-15-production-file-factory.sql` is additive and idempotent. Applied to the previous schema it equals a fresh `db/schema.sql` (tested). It adds seven tables plus `order_artwork.art_master_id` and `print_master_id`. Preflight check: `production_file_factory_migration_applied`.
