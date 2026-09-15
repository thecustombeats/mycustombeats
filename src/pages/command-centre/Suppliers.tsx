import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { SUPPLIER_SECTIONS, commandLink, humanise, money, supplierLink, supplierView, type Json, type SupplierSection } from "../../lib/commandCentre";
import { poundsToMinor } from "../../lib/customerCare";
import { card, eyebrow, field, primary, secondary } from "./styles";
import { Panel } from "./ui";

type Api = (path: string, body?: Json) => Promise<Json>;

/**
 * SUPPLIERS — who can make each product, where they deliver, what it is
 * expected to cost and what it actually cost, for Bella, Lewis and staff.
 *
 * Decision support only. A route "recommended for review" is never an
 * authorisation: nothing on these screens purchases, pays, refunds or places an
 * order. Bella or Lewis authorises every purchase with their own code, then a
 * person places it and records the reference and actual cost.
 */
const Suppliers = ({ section, api, staff }: { section: SupplierSection; api: Api; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lookup, setLookup] = useState({ sku: "", country: "" });
  const view = supplierView(section);

  const load = useCallback(async (extra = "") => {
    try {
      const result = await api(`/api/crm/suppliers?view=${view}&staff=${encodeURIComponent(staff)}${extra}`);
      setData(result.view === view ? { ...result, section } : null);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [api, view, section, staff]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) { setData(null); load(); } });
    return () => { cancelled = true; };
  }, [load]);

  const find = (event: FormEvent) => {
    event.preventDefault();
    load(`&sku=${encodeURIComponent(lookup.sku)}&country=${encodeURIComponent(lookup.country.trim().toUpperCase())}`);
  };

  return (
    <>
      <div>
        <p className={eyebrow}>Supplier intelligence · decision support only</p>
        <h1 className="font-serif text-4xl text-ink">Suppliers</h1>
        <p className="mt-1 text-base text-ink/80">Nothing here buys anything. A recommended route is for review; Bella or Lewis authorises every purchase with their own code.</p>
      </div>
      <nav aria-label="Supplier sections" className="overflow-x-auto" tabIndex={-1}>
        <ul className="m-0 flex list-none gap-2 p-0 pb-1">
          {SUPPLIER_SECTIONS.map(([s, label]) => (
            <li key={s} className="shrink-0">
              <a href={supplierLink(s)} aria-current={s === section ? "page" : undefined} className={s === section ? primary : secondary}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      {message && <p role="status" className={card}>{message} <button type="button" className="ml-2 min-h-12 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}
      {/* A section only ever renders its own data: never the previous section's during a switch. */}
      {!data || data.section !== section ? <p role="status">Loading…</p> : (
        <>
          {section === "overview" && <Overview data={data} />}
          {section === "orders" && <OrdersToRoute data={data} api={api} staff={staff} onDone={(m) => { setMessage(m); load(); }} />}
          {section === "finder" && <Finder data={data} lookup={lookup} setLookup={setLookup} onFind={find} />}
          {section === "data" && <DataNeeded data={data} />}
          {section === "evidence" && <Evidence data={data} />}
        </>
      )}
    </>
  );
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const TileItems = ({ tile }: { tile: Json }) => (
  <ul className="mt-2 space-y-2 text-sm">
    {tile.items.slice(0, 50).map((item: Json, i: number) => (
      <li key={i} className="border-t border-ink/10 pt-2">
        {item.reference ? (
          <a className="inline-flex min-h-11 items-center font-semibold underline" href={commandLink({ view: "orders", order: item.reference, open: "card" })}>{item.reference}</a>
        ) : item.route_id ? (
          <span className="font-semibold">{item.supplier ?? item.route_id}</span>
        ) : (
          <span className="font-semibold">{item.product ?? item.label}</span>
        )}
        {item.route_id && <span> · {humanise(item.state)} · {(item.products ?? []).join(", ")}{item.reverify ? " · Reverify route" : ""}</span>}
        {item.why && <span> · {item.why}</span>}
        {item.type && <span> · {humanise(item.type)}</span>}
        {item.kind === "NEW_SALES" && <span> · {item.product}</span>}
        {item.template_label && <span> · {item.template_label}: {item.missing}</span>}
        {item.authorised_by && <span> · authorised by {humanise(item.authorised_by)}</span>}
        {item.note && <p className="m-0 text-ink/70">{item.note}</p>}
      </li>
    ))}
  </ul>
);

const Overview = ({ data }: { data: Json }) => {
  const c = data.catalogue;
  return (
    <>
      {!data.route_data_present && <p className={`${card} border-gold bg-[#FBF6EA]`}>No partner route data is loaded on this server yet, so every product shows as needing a route. Route data is uploaded privately, never published.</p>}
      <Panel id="supplier-overview" title="At a glance">
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {data.tiles.map((t: Json) => (
            <li key={t.key} className={card}>
              <p className={eyebrow}>{t.label}</p>
              <p className="mt-1 font-serif text-3xl leading-tight text-ink">{t.count}</p>
              {t.count > 0 && (
                <details>
                  <summary className="min-h-12 cursor-pointer py-3 font-semibold">Show {plural(t.count, "item")}</summary>
                  <TileItems tile={t} />
                </details>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel id="supplier-catalogue" title="Physical catalogue">
        <div className={card}>
          <p className="text-lg font-semibold">{c.mapped_physical_skus} of {c.expected_physical_skus} physical products mapped</p>
          <ul className="mt-2 space-y-1 text-base">
            {c.families.map((f: Json) => <li key={f.family}>{f.label}: {f.mapped} of {f.expected}</li>)}
          </ul>
          {c.cards.status !== "MAPPED" && (
            <p className="mt-3 text-base font-semibold text-[#7A5E1F]">Pop-up cards: {c.cards.mapped} of {c.cards.expected} listings recorded. Bella or Lewis to supply each card&apos;s name, price point, image and personalisation.</p>
          )}
          <p className="mt-2 text-sm">Card price points: {c.cards.price_points.map((p: Json) => `${p.label} ${money(p.price_minor)}`).join(" · ")}.</p>
        </div>
      </Panel>
      <p className="text-sm text-ink/80">New-sale commercial safety: {humanise(data.enforcement.new_sale_safety)}. Route freshness: {data.enforcement.route_freshness_days ? `${data.enforcement.route_freshness_days} days` : "not configured (routes are never marked stale automatically)"}. {data.no_money_moves}</p>
    </>
  );
};

const certainty = (o: Json): string => `${humanise(o.destination.certainty)} destination · ${humanise(o.shipping_certainty)} shipping`;

const RouteOption = ({ o, recommended }: { o: Json; recommended: boolean }) => (
  <div className={`${card} ${recommended ? "border-gold" : ""}`}>
    <p className="font-semibold">{o.supplier ?? o.route_id} <span className="font-normal text-ink/70">· {humanise(o.route_type ?? "route type not recorded")} · {o.route_id}</span></p>
    <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="font-semibold">Verification</dt><dd className="m-0">{humanise(o.verification.state)}{o.verification.freshness.verified_date ? ` · checked ${o.verification.freshness.verified_date}` : ""}{o.verification.reverify ? " · Reverify route" : ""}</dd>
      <dt className="font-semibold">Certainty</dt><dd className="m-0">{certainty(o)}</dd>
      <dt className="font-semibold">Expected direct cost</dt><dd className="m-0">{o.expected_cost.complete ? money(o.expected_cost.total_minor, o.expected_cost.currency ?? "GBP") : `— Awaiting data (${o.expected_cost.missing.map(humanise).join(", ")})`}</dd>
      <dt className="font-semibold">Availability</dt><dd className="m-0">{humanise(o.availability.status)}{o.availability.checked_date ? ` · ${o.availability.checked_date}` : ""}</dd>
      <dt className="font-semibold">Fallback</dt><dd className="m-0">{o.fallback.route_id ? `${o.fallback.route_id}${o.fallback.available ? "" : " (not usable here)"}` : "None recorded"}</dd>
      {o.international_evidence && (<><dt className="font-semibold">Destination evidence</dt><dd className="m-0">{[o.international_evidence.shipping_rule, o.international_evidence.tracking, o.international_evidence.customs_duties, o.international_evidence.delivery_estimate, o.international_evidence.restrictions].filter(Boolean).join(" · ") || "—"}</dd></>)}
    </dl>
    {o.risks.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{o.risks.map((r: string) => <li key={r}>{r}</li>)}</ul>}
    <p className="mt-2 text-xs text-ink/70">{o.expected_cost.note}</p>
  </div>
);

const Recommendation = ({ rec }: { rec: Json | null }) => rec ? (
  <div className={`${card} border-l-4 border-l-gold`}>
    <p className={eyebrow}>{rec.label}</p>
    <p className="mt-1 text-base font-semibold">{rec.route_id}</p>
    <p className="text-base">{rec.explanation}</p>
    <p className="mt-1 text-sm text-ink/70">{rec.note}</p>
  </div>
) : <p className={card}>No usable route for this product and destination. A person must find one; the customer is never told a country-only restriction.</p>;

const Groups = ({ result }: { result: Json }) => (
  <div className="space-y-4">
    {Object.entries(result.groups as Record<string, Json[]>).map(([g, list]) => (
      <section key={g} aria-label={result.group_labels[g]} className="space-y-2">
        <h3 className="text-lg font-semibold">{result.group_labels[g]} ({list.length})</h3>
        {list.length === 0 ? <p className="text-sm text-ink/70">None.</p> : list.map((o) => <RouteOption key={o.route_id} o={o} recommended={o.route_id === result.recommendation?.route_id} />)}
      </section>
    ))}
  </div>
);

const Finder = ({ data, lookup, setLookup, onFind }: { data: Json; lookup: { sku: string; country: string }; setLookup: (v: { sku: string; country: string }) => void; onFind: (e: FormEvent) => void }) => (
  <>
    <Panel id="finder" title="Route finder">
      <form className={`${card} grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end`} onSubmit={onFind}>
        <label className="block text-base font-semibold">Product
          <select className={field} value={lookup.sku} required onChange={(e) => setLookup({ ...lookup, sku: e.target.value })}>
            <option value="">Choose a product</option>
            {data.products.map((p: Json) => <option key={p.sku} value={p.sku}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-base font-semibold">Customer&apos;s delivery country
          <input className={field} value={lookup.country} maxLength={2} pattern="[A-Za-z]{2}" placeholder="GB" autoComplete="off" onChange={(e) => setLookup({ ...lookup, country: e.target.value })} aria-describedby="finder-hint" />
        </label>
        <button type="submit" className={primary}>Find routes</button>
        <p id="finder-hint" className="text-sm text-ink/70 sm:col-span-3">Routes are matched to where the customer&apos;s order is delivered, never to where MCB is.</p>
      </form>
    </Panel>
    {data.result && (
      <Panel id="finder-result" title={`${data.result.product} · ${data.result.destination.country_code ?? "no country"}`}>
        <p className="text-base">{humanise(data.result.status)} · {humanise(data.result.routing_mode)}</p>
        <Recommendation rec={data.result.recommendation} />
        <Groups result={data.result} />
      </Panel>
    )}
  </>
);

const DecisionForm = ({ order, line, reasons, api, staff, onDone }: { order: Json; line: Json; reasons: string[]; api: Api; staff: string; onDone: (m: string) => void }) => {
  const usable = line.options.filter((o: Json) => o.group !== "UNSUPPORTED");
  const [routeId, setRouteId] = useState<string>(line.recommendation?.route_id ?? usable[0]?.route_id ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deviates = routeId !== (line.recommendation?.route_id ?? "");
  const id = `${order.reference}-${line.sku}`;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const body: Json = { action: "RECORD_ROUTE_DECISION", staff, order_reference: order.reference, sku: line.sku, route_id: routeId, note: note || undefined };
      if (deviates) body.deviation_reason = reason;
      const minor = cost ? poundsToMinor(cost) : null;
      if (minor !== null) Object.assign(body, { confirmed_delivered_cost_minor: minor, confirmed_delivered_currency: currency, delivered_cost_evidence: evidence });
      await api("/api/crm/suppliers", body);
      onDone(`Route choice recorded for ${order.reference}. This does not authorise any purchase.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (usable.length === 0) return <p className="text-sm font-semibold">No usable route to choose. Raise a fulfilment exception for a founder decision.</p>;
  return (
    <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} aria-label={`Record the route for ${line.product}`}>
      <label className="block text-base font-semibold" htmlFor={`${id}-route`}>Route
        <select id={`${id}-route`} className={field} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          {usable.map((o: Json) => <option key={o.route_id} value={o.route_id}>{o.supplier ?? o.route_id}{o.route_id === line.recommendation?.route_id ? " (recommended for review)" : ""}</option>)}
        </select>
      </label>
      {deviates && (
        <label className="block text-base font-semibold" htmlFor={`${id}-reason`}>Why a different route
          <select id={`${id}-reason`} className={field} value={reason} required onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {reasons.map((r) => <option key={r} value={r}>{humanise(r)}</option>)}
          </select>
        </label>
      )}
      <label className="block text-base font-semibold sm:col-span-2" htmlFor={`${id}-note`}>Note{deviates ? " (required)" : " (optional)"}
        <textarea id={`${id}-note`} className={field} rows={2} maxLength={500} required={deviates} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {line.delivered_cost_confirmation_required && (
        <fieldset className="grid grid-cols-1 gap-3 rounded-2xl border border-ink/10 p-3 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-base font-semibold">Confirmed delivered cost (required before purchase)</legend>
          <label className="block text-sm font-semibold" htmlFor={`${id}-cost`}>Amount
            <input id={`${id}-cost`} className={field} inputMode="decimal" value={cost} required onChange={(e) => setCost(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold" htmlFor={`${id}-currency`}>Currency
            <input id={`${id}-currency`} className={field} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
          <label className="block text-sm font-semibold" htmlFor={`${id}-evidence`}>Where it was confirmed
            <input id={`${id}-evidence`} className={field} maxLength={300} value={evidence} required onChange={(e) => setEvidence(e.target.value)} />
          </label>
        </fieldset>
      )}
      {error && <p role="alert" className="text-base font-semibold text-[#8A1F1F] sm:col-span-2">{error}</p>}
      <button type="submit" className={`${primary} sm:col-span-2 sm:justify-self-start`}>Record route choice</button>
    </form>
  );
};

const OrdersToRoute = ({ data, api, staff, onDone }: { data: Json; api: Api; staff: string; onDone: (m: string) => void }) => (
  <Panel id="orders-to-route" title="Orders to route">
    <p className="text-base">Review the route for each item before Bella or Lewis authorises the purchase. Recording a route choice never authorises spend.</p>
    {data.orders.length === 0 ? <p className={card}>No physical orders are waiting for a route.</p> : (
      <ul className="m-0 list-none space-y-4 p-0">
        {data.orders.map((order: Json) => (
          <li key={order.order_id} className={card}>
            <p className="text-lg font-semibold"><a className="underline" href={commandLink({ view: "orders", order: order.reference, open: "card" })}>{order.reference}</a> · {humanise(order.state)} · delivers to {order.country_code ?? "— Awaiting data"}</p>
            {order.unmet_before_authorisation.length > 0 && <p className="mt-1 font-semibold text-[#8A1F1F]">Before authorisation: confirm the delivered cost for {order.unmet_before_authorisation.map((u: Json) => u.product).join(", ")}.</p>}
            {order.lines.map((line: Json) => (
              <details key={line.sku} className="mt-3 border-t border-ink/10 pt-2" open={!line.decision}>
                <summary className="min-h-12 cursor-pointer py-3 text-base font-semibold">{line.product}{line.decision ? ` · route chosen by ${line.decision.decided_by}` : " · route not reviewed yet"}</summary>
                <Recommendation rec={line.recommendation} />
                {line.decision && <p className="mt-2 text-base">Chosen: {line.decision.route_id}{line.decision.deviation_reason ? ` (${humanise(line.decision.deviation_reason)}: ${line.decision.note})` : ""}{line.decision.confirmed_delivered_cost_minor !== null ? ` · delivered cost confirmed ${money(line.decision.confirmed_delivered_cost_minor, line.decision.confirmed_delivered_currency)}` : ""}</p>}
                <details className="mt-2">
                  <summary className="min-h-12 cursor-pointer py-3">All routes for this item ({line.options.length})</summary>
                  <div className="space-y-2">{line.options.map((o: Json) => <RouteOption key={o.route_id} o={o} recommended={o.route_id === line.recommendation?.route_id} />)}</div>
                </details>
                <DecisionForm order={order} line={line} reasons={data.deviation_reasons} api={api} staff={staff} onDone={onDone} />
              </details>
            ))}
          </li>
        ))}
      </ul>
    )}
  </Panel>
);

const DataNeeded = ({ data }: { data: Json }) => {
  const manufacturing = data.tiles.find((t: Json) => t.key === "manufacturing_data_missing")?.items ?? [];
  return (
    <>
      <Panel id="research" title="Supplier data needs review">
        <p className="text-base">Research to do with partners. This is not purchasing.</p>
        <List label="Supplier data needing review" rows={data.research} render={(r) => (
          <><span className="font-semibold">{r.label}</span>{r.product ? ` · ${r.product}` : ""}{r.route_id ? ` · ${r.route_id}` : ""}<p className="m-0 text-sm text-ink/80">{r.detail}</p></>
        )} />
      </Panel>
      <Panel id="manufacturing" title="Manufacturing data required">
        <p className="text-base">Production specifications still missing. Known values are shown; nothing unknown is filled in.</p>
        <List label="Manufacturing data required" rows={manufacturing} render={(m) => (
          <><span className="font-semibold">{m.label}</span> · {m.template_label}{m.blocks_manufacture ? " · needed before manufacture" : ""}<p className="m-0 text-sm text-ink/80">Missing: {m.missing}{m.known.length ? `. Known: ${m.known.join("; ")}` : ""}.</p></>
        )} />
      </Panel>
    </>
  );
};

const List = ({ label, rows, render }: { label: string; rows: Json[]; render: (row: Json) => ReactNode }) => (
  rows.length === 0 ? <p className={card}>Nothing outstanding.</p> : (
    <ul aria-label={label} className="m-0 list-none space-y-2 p-0">
      {rows.map((r, i) => <li key={i} className={card}>{render(r)}</li>)}
    </ul>
  )
);

const Evidence = ({ data }: { data: Json }) => (
  <Panel id="route-evidence" title="Route evidence">
    <p className="text-base">Each part is shown on its own, with the number of orders behind it. There is no combined score, and no partner is switched automatically.</p>
    {data.scorecards.length === 0 ? <p className={card}>No routes or partner orders recorded yet.</p> : (
      <ul className="m-0 list-none space-y-3 p-0">
        {data.scorecards.map((s: Json) => {
          const c = s.components;
          const cost = c.COST_COMPLETENESS;
          return (
            <li key={s.route_id} className={card}>
              <p className="text-lg font-semibold">{s.supplier ?? s.route_id} <span className="font-normal text-ink/70">· {s.route_id}</span></p>
              <p className="text-sm font-semibold">{c.SAMPLE_SIZE.label === "INSUFFICIENT DATA" ? "Insufficient data" : c.SAMPLE_SIZE.label === "EARLY DATA" ? `Early data · ${c.SAMPLE_SIZE.sample_size} order(s)` : `Sample of ${c.SAMPLE_SIZE.sample_size}`}</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="font-semibold">Verification quality</dt><dd className="m-0">{humanise(c.VERIFICATION_QUALITY.state)}</dd>
                <dt className="font-semibold">Cost completeness</dt><dd className="m-0">{cost.orders_with_actual_product_cost} of {cost.of} with actual product cost · {cost.orders_with_tax_duty_recorded} with tax or duty recorded</dd>
                <dt className="font-semibold">Product: expected / actual</dt><dd className="m-0">{money(cost.expected_product_minor)} / {money(cost.actual_product_minor)} (difference {money(cost.product_variance_minor)})</dd>
                <dt className="font-semibold">Shipping: expected / actual</dt><dd className="m-0">{money(cost.expected_shipping_minor)} / {money(cost.actual_shipping_minor)} (difference {money(cost.shipping_variance_minor)})</dd>
                <dt className="font-semibold">Total: expected / actual</dt><dd className="m-0">{money(cost.expected_total_minor)} / {money(cost.actual_total_minor)} (difference {money(cost.total_variance_minor)})</dd>
                <dt className="font-semibold">Destination certainty</dt><dd className="m-0">Supported {c.DESTINATION_CERTAINTY.supported.join(", ") || "none recorded"}{c.DESTINATION_CERTAINTY.unsupported.length ? ` · unsupported ${c.DESTINATION_CERTAINTY.unsupported.join(", ")}` : ""}</dd>
                <dt className="font-semibold">Tracking evidence</dt><dd className="m-0">{humanise(c.TRACKING_EVIDENCE.capability)}{c.TRACKING_EVIDENCE.parcels_with_tracking_share !== null ? ` · ${Math.round(c.TRACKING_EVIDENCE.parcels_with_tracking_share * 100)}% of parcels tracked` : ""}</dd>
                <dt className="font-semibold">Fulfilment reliability</dt><dd className="m-0">{c.FULFILMENT_RELIABILITY.avg_days_to_dispatch ?? "—"} days to dispatch · {c.FULFILMENT_RELIABILITY.avg_days_in_transit ?? "—"} days in transit</dd>
                <dt className="font-semibold">Customer problems</dt><dd className="m-0">{c.CUSTOMER_PROBLEM_RATE.problems ?? 0} problem(s) · {c.CUSTOMER_PROBLEM_RATE.support_cases} support case(s) · {c.CUSTOMER_PROBLEM_RATE.replacements} replacement(s)</dd>
              </dl>
              <p className="mt-2 text-xs text-ink/70">{cost.note}</p>
            </li>
          );
        })}
      </ul>
    )}
  </Panel>
);

export default Suppliers;
