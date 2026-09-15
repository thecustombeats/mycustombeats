import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BUSINESS_SECTIONS, businessLink, humanise, money, rateText, type BusinessSection, type Json } from "../../lib/commandCentre";
import { poundsToMinor } from "../../lib/customerCare";
import { card, eyebrow, field, primary, secondary } from "./styles";
import { Panel, Status, Tile } from "./ui";

type Api = (path: string, body?: Json) => Promise<Json>;

/**
 * BUSINESS — MCB management intelligence for Bella and Lewis.
 *
 * Figures come from the server, calculated from recorded MCB data. Unknown is
 * shown as "Awaiting data", never £0; contribution always says how many orders
 * it is based on and is never called profit; small samples are "Early data".
 * Nothing on these screens spends, refunds, purchases or changes a price.
 */
const Business = ({ section, api, fetchBlob, staff }: { section: BusinessSection; api: Api; fetchBlob: (path: string, type?: string) => Promise<string>; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api(`/api/crm/business?section=${section}&staff=${encodeURIComponent(staff)}`);
      setData(result.section === section ? result : null);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [api, section, staff]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) { setData(null); load(); } });
    return () => { cancelled = true; };
  }, [load]);

  const exportCsv = async (dataset: string) => {
    try {
      const url = await fetchBlob(`/api/crm/business?export=${dataset}&staff=${encodeURIComponent(staff)}`, "text/csv");
      const a = document.createElement("a");
      a.href = url;
      a.download = `mcb-${dataset.replace(/_/g, "-")}.csv`;
      a.click();
      setMessage(`Exported ${humanise(dataset)} (recorded in the audit log). It contains aggregates and references only.`);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrow}>Management intelligence · {data?.timezone?.timezone ?? "UTC"}{data?.timezone && !data.timezone.configured ? " (business timezone not configured)" : ""}</p>
          <h1 className="font-serif text-4xl text-ink">Business</h1>
        </div>
      </div>
      <nav aria-label="Business sections" className="overflow-x-auto" tabIndex={-1}>
        <ul className="m-0 flex list-none gap-2 p-0 pb-1">
          {BUSINESS_SECTIONS.map(([s, label]) => (
            <li key={s} className="shrink-0">
              <a href={businessLink(s)} aria-current={s === section ? "page" : undefined} className={s === section ? primary : secondary}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      {message && <p role="status" className={card}>{message} <button type="button" className="ml-2 min-h-12 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}
      {/* A section only ever renders its own data: never the previous section's during a switch. */}
      {!data || data.section !== section ? <p role="status">Loading…</p> : (
        <>
          <p className="text-sm text-ink/80">{data.disclaimer}</p>
          {section === "overview" && <Overview data={data} />}
          {section === "products" && <Products data={data} />}
          {section === "videos" && <Videos video={data.video} />}
          {section === "customers" && <Customers data={data} />}
          {section === "suppliers" && <Suppliers routes={data.supplier_routes} />}
          {section === "support" && <Support data={data} />}
          {section === "data" && <DataQuality quality={data.data_quality} api={api} staff={staff} onDone={(m) => { setMessage(m); load(); }} exportCsv={exportCsv} />}
          {section !== "data" && (
            <details className={card}>
              <summary className="min-h-12 cursor-pointer font-semibold">What these words mean</summary>
              <dl className="mt-2 space-y-2">{data.definitions.map((d: Json) => <div key={d.term}><dt className="font-semibold">{d.term}</dt><dd className="m-0 text-sm">{d.meaning}</dd></div>)}</dl>
            </details>
          )}
        </>
      )}
    </>
  );
};

/** One alert finding in plain words: money as money, rates as percentages. */
const findingText = (key: string, value: unknown): string => {
  const label = humanise(key.replace(/_minor$/, "").replace(/_percent$/, ""));
  if (typeof value === "boolean") return `${label}: ${value ? "yes" : "no"}`;
  if (typeof value === "number" && key.endsWith("_minor")) return `${label}: ${money(value)}`;
  if (typeof value === "number" && key.endsWith("_percent")) return `${label}: ${value}%`;
  if (typeof value === "number" && key.endsWith("_rate")) return `${label}: ${rateText(value)}`;
  return `${label}: ${String(value)}`;
};

const known = (minor: number | null | undefined) => (minor === null || minor === undefined ? "— Awaiting data" : money(minor));
const Sample = ({ item }: { item: Json }) => (
  <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${item.early_data ? "bg-[#FBF6EA] text-[#7A5E1F]" : "bg-ink/5 text-ink"}`}>{item.label === "NO DATA" ? "No data yet" : item.early_data ? `Early data · ${item.sample_size}` : `Sample ${item.sample_size}`}</span>
);

/** A scrollable, keyboard-reachable table for wide figures. */
const Table = ({ label, columns, rows }: { label: string; columns: { key: string; label: string; render?: (row: Json) => ReactNode }[]; rows: Json[] }) => (
  <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto rounded-2xl border border-ink/10 bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold">
    <table className="min-w-full text-left text-sm">
      <caption className="sr-only">{label}</caption>
      <thead className="bg-ivory"><tr>{columns.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 ? <tr><td className="px-3 py-3" colSpan={columns.length}>No data yet.</td></tr> : rows.map((r, i) => (
          <tr key={i} className="border-t border-ink/10">{columns.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2">{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Contribution = ({ c }: { c: Json }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    {(["expected", "actual"] as const).map((b) => (
      <div key={b} className={card}>
        <p className={eyebrow}>{c[b].label} gross contribution · {c.label}{c.partial ? " (in progress)" : ""}</p>
        <p className="mt-1 font-serif text-3xl text-ink">{known(c[b].contribution_minor)}</p>
        <p className="text-sm">Based on {c[b].based_on}{c[b].contribution_percent !== null ? ` · ${c[b].contribution_percent}% of their net paid` : ""}</p>
        {c[b].incomplete_orders > 0 && <p className="text-sm font-semibold text-[#7A5E1F]">{c[b].incomplete_orders} order(s) awaiting cost data: {Object.entries(c[b].awaiting as Record<string, number>).map(([k, v]) => `${humanise(k)} (${v})`).join(", ")}</p>}
        {!c[b].whole_business && c.paid_orders > 0 && <p className="text-sm">Not whole-business profitability.</p>}
      </div>
    ))}
  </div>
);

const Overview = ({ data }: { data: Json }) => {
  const b = data.brief;
  return (
    <>
      <Panel id="brief" title={b.title}>
        <div className={`${card} space-y-2`}>
          <p className={eyebrow}>{b.period}</p>
          <p className="text-lg">Net paid {money(b.revenue.net_paid_minor)} · {b.revenue.orders} order(s) · average {known(b.revenue.average_order_minor)}{b.revenue.test_orders ? ` · ${b.revenue.test_orders} TEST (not revenue)` : ""}</p>
          <p>Actual gross contribution: {known(b.contribution.actual_minor)} from {b.contribution.based_on}</p>
          <p>Most units sold today: {b.most_units_today ? `${b.most_units_today.name} (${b.most_units_today.units})${b.most_units_today.tied ? " — tied" : ""}` : "no sales yet"}</p>
          <p>Video: {b.video.used}/{b.video.planned} planned spaces used · {b.video.label}</p>
          <p>Customer care: {b.customer_care.open} open · {b.customer_care.urgent} urgent</p>
          <p>Needs attention: {b.needs_attention.length ? b.needs_attention.map(humanise).join(", ") : "nothing from the commercial alerts"}</p>
          <p>Data missing: {b.data_missing.length ? b.data_missing.join("; ") : "none"}</p>
        </div>
      </Panel>
      <Panel id="revenue" title="Revenue">
        <Table label="Revenue by period (live GBP payments)" rows={Object.values(data.revenue)} columns={[
          { key: "label", label: "Period", render: (r) => `${r.label}${r.partial ? " (in progress)" : ""}` },
          { key: "gross", label: "Gross paid", render: (r) => money(r.gross_paid_minor) },
          { key: "refunds", label: "Refunds", render: (r) => `${money(r.refunds_minor)}${r.partial_refunds_minor ? ` (partial ${money(r.partial_refunds_minor)})` : ""}` },
          { key: "net", label: "Net paid", render: (r) => money(r.net_paid_minor) },
          { key: "orders", label: "Orders", render: (r) => String(r.orders) },
          { key: "aov", label: "Average order", render: (r) => known(r.average_order_minor) },
          { key: "test", label: "TEST (not revenue)", render: (r) => `${r.test.orders} · ${money(r.test.gross_paid_minor)}` },
          { key: "other", label: "Other currencies (not converted)", render: (r) => r.other_currencies.length ? r.other_currencies.map((o: Json) => `${o.orders} × ${money(o.gross_paid_minor, o.currency)}`).join(", ") : "—" },
        ]} />
      </Panel>
      <Panel id="contribution" title="Gross contribution">
        <Contribution c={data.contribution.month} />
        <Contribution c={data.contribution.all} />
        <p className="text-sm text-ink/80">{data.contribution.all.note}</p>
      </Panel>
      <Panel id="changes" title="What changed">
        <Table label="Complete period comparisons" rows={data.comparisons.complete} columns={[
          { key: "label", label: "Comparison" },
          { key: "cur", label: "Net paid", render: (r) => `${money(r.current.net_paid_minor)} vs ${money(r.previous.net_paid_minor)}` },
          { key: "chg", label: "Change", render: (r) => r.net_paid.change_minor === null ? "—" : `${money(r.net_paid.change_minor)}${r.net_paid.change_percent !== null ? ` (${r.net_paid.change_percent}%)` : ""}` },
          { key: "orders", label: "Orders", render: (r) => `${r.current.orders} vs ${r.previous.orders}` },
          { key: "early", label: "Sample", render: (r) => (r.early_data ? "Early data" : "—") },
        ]} />
        <p className="text-sm">{data.comparisons.note} Partial: {data.comparisons.partial.map((p: Json) => `${p.label} ${money(p.net_paid_minor)} from ${p.orders} order(s)`).join(" · ")}.</p>
      </Panel>
      <Panel id="alerts" title="Commercial alerts">
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
          {data.alerts.alerts.map((a: Json) => (
            <li key={a.type} className={`${card} space-y-1`}>
              <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{humanise(a.type)}</span>
                {a.status === "NOT_CONFIGURED" ? <span className="text-sm font-semibold">Not configured</span> : <Status good={a.status === "CLEAR"} label={a.status === "CLEAR" ? "Clear" : `${a.findings.length} found`} />}</p>
              <p className="text-sm">{a.meaning}</p>
              {a.findings.slice(0, 5).map((f: Json, i: number) => <p key={i} className="text-sm">{Object.entries(f).map(([k, v]) => findingText(k, v)).join(" · ")}</p>)}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink/80">{data.alerts.note}</p>
      </Panel>
      <Panel id="insights" title="Evidence to review">
        {data.recommendations.cards.length === 0 ? <p className={card}>Nothing to review yet.</p> : (
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
            {data.recommendations.cards.map((c: Json, i: number) => <li key={i} className={card}><p className={eyebrow}>{humanise(c.kind)}</p><p className="mt-1">{c.text}</p></li>)}
          </ul>
        )}
        <p className="text-sm text-ink/80">{data.recommendations.note}</p>
      </Panel>
    </>
  );
};

const Products = ({ data }: { data: Json }) => {
  const m = data.moment;
  const e = data.enhancements;
  return (
    <>
      <Panel id="moment" title="Moment" aside={<Sample item={m} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Price" value={money(m.price_minor)} hint={`With a Memory Music Video: ${money(m.with_video_price_minor)}`} />
          <Tile label="Moment orders" value={m.orders} hint={`${m.moment_only_orders} Moment only · ${m.moment_with_video_orders} with a video`} />
          <Tile label="Video attachment" value={rateText(m.video_attachment_rate)} />
          <Tile label="Average order" value={known(m.average_order_minor)} />
          <Tile label="Moment revenue" value={money(m.moment_revenue_minor)} />
          <Tile label="Refunds" value={money(m.refunds_minor)} />
          <Tile label="Actual contribution" value={known(m.actual_contribution_minor)} hint={`Based on ${m.actual_contribution_based_on}`} />
        </div>
      </Panel>
      <Panel id="enhancements" title="Packages and enhancements" aside={<Sample item={e} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Base product revenue" value={money(e.base_product_revenue_minor)} />
          <Tile label="Enhancement revenue" value={money(e.enhancement_revenue_minor)} />
          <Tile label="Enhancement attachment" value={rateText(e.enhancement_attachment_rate)} hint={`${e.orders_with_enhancement} of ${e.orders_with_enhancement + e.orders_without_enhancement} orders`} />
          <Tile label="Enhancements per order" value={e.average_enhancements_per_order ?? "— Awaiting data"} />
          <Tile label="Average order with" value={known(e.average_order_with_enhancement_minor)} />
          <Tile label="Average order without" value={known(e.average_order_without_enhancement_minor)} />
        </div>
        <p className="text-sm text-ink/80">{e.note}</p>
      </Panel>
      <Panel id="product-table" title="Product performance">
        <Table label="Product performance (live GBP orders)" rows={data.products.products} columns={[
          { key: "name", label: "Product", render: (r) => `${r.name}${r.retired ? " (no longer sold)" : ""}` },
          { key: "orders", label: "Orders", render: (r) => String(r.orders) },
          { key: "units", label: "Units", render: (r) => String(r.units) },
          { key: "rev", label: "Paid revenue", render: (r) => money(r.paid_revenue_minor) },
          { key: "asp", label: "Average price", render: (r) => known(r.average_selling_price_minor) },
          { key: "refund", label: "Refunds on orders", render: (r) => `${money(r.refund_value_on_orders_minor)} · ${rateText(r.refund_rate)}` },
          { key: "exp", label: "Expected contribution", render: (r) => `${known(r.expected.contribution_minor)} (${r.expected.complete_orders} of ${r.expected.attributable_orders})` },
          { key: "act", label: "Actual contribution", render: (r) => `${known(r.actual.contribution_minor)} (${r.actual.complete_orders} of ${r.actual.attributable_orders})${r.actual.contribution_percent !== null ? ` · ${r.actual.contribution_percent}%` : ""}` },
          { key: "cases", label: "Support cases", render: (r) => String(r.support_cases) },
          { key: "repl", label: "Replacement rate", render: (r) => rateText(r.replacement_rate) },
          { key: "sample", label: "Sample", render: (r) => <Sample item={r} /> },
        ]} />
        <p className="text-sm text-ink/80">{data.products.note}</p>
      </Panel>
    </>
  );
};

const Videos = ({ video: v }: { video: Json }) => (
  <>
    <Panel id="video-capacity" title="Memory Music Video capacity">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Planned" value={v.capacity.planned} hint={v.capacity.label} />
        <Tile label="Reserved" value={v.capacity.reserved} />
        <Tile label="Completed" value={v.capacity.completed} />
        <Tile label="Remaining" value={v.capacity.remaining} emphasis={v.capacity.state !== "AVAILABLE"} />
      </div>
      <p className="text-sm font-semibold text-[#7A5E1F]">{v.capacity.label} — a planning figure, not a verified platform allowance.</p>
    </Panel>
    <Panel id="video-commercial" title="Offer and sales" aside={<Sample item={v} />}>
      <dl className={`${card} grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base`}>
        <dt>Price</dt><dd className="m-0 text-right">{money(v.price_minor)}</dd>
        <dt>Offer views</dt><dd className="m-0 text-right">{v.offer_impressions}</dd>
        <dt>Selections</dt><dd className="m-0 text-right">{v.selections}</dd>
        <dt>Purchases (live)</dt><dd className="m-0 text-right">{v.purchases}</dd>
        <dt>Offer-to-purchase</dt><dd className="m-0 text-right">{rateText(v.offer_to_purchase_rate)}</dd>
        <dt>Attachment</dt><dd className="m-0 text-right">{rateText(v.attachment_rate)} of {v.eligible_orders} eligible</dd>
        <dt>Video revenue</dt><dd className="m-0 text-right">{money(v.video_revenue_minor)}</dd>
        <dt>Average selling price</dt><dd className="m-0 text-right">{known(v.average_selling_price_minor)}</dd>
        <dt>Capacity used</dt><dd className="m-0 text-right">{rateText(v.capacity.utilisation)}</dd>
        <dt>Rework rate</dt><dd className="m-0 text-right">{rateText(v.rework_rate)}</dd>
        <dt>Quality check failure rate</dt><dd className="m-0 text-right">{rateText(v.qc_failure_rate)}</dd>
        <dt>Average production time</dt><dd className="m-0 text-right">{v.average_production_hours === null ? "— Awaiting data" : `${v.average_production_hours} hours`}</dd>
        <dt>Refunds on video orders</dt><dd className="m-0 text-right">{money(v.refund_value_on_orders_minor)}</dd>
        <dt>Video support cases</dt><dd className="m-0 text-right">{v.support_cases}</dd>
        <dt>Known production cost</dt><dd className="m-0 text-right">{known(v.production_cost.known_cost_minor)} ({v.production_cost.with_recorded_cost} of {v.production_cost.videos})</dd>
        <dt>Known contribution</dt><dd className="m-0 text-right">{known(v.known_contribution_minor)}</dd>
      </dl>
      <p className="text-sm">{v.production_cost.note} Known contribution: {v.known_contribution_based_on}.</p>
      <p className="text-sm text-ink/80">{v.offer_counts_note}</p>
    </Panel>
    <Panel id="video-pricing" title="Pricing evidence">
      <div className={card}>
        <p>Current price {money(v.pricing_evidence.current_price_minor)}. Price points under review: {v.pricing_evidence.price_points_under_review_minor.map((p: number) => money(p)).join(", ")}.</p>
        <p className="mt-1 text-sm">{v.pricing_evidence.note}</p>
      </div>
    </Panel>
  </>
);

const Customers = ({ data }: { data: Json }) => {
  const c = data.customers;
  const cr = data.cruise;
  return (
    <>
      <Panel id="customer-value" title="Customers" aside={<Sample item={c} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Customers" value={c.customers} hint={`${c.first_time_customers} first-time · ${c.repeat_customers} repeat`} />
          <Tile label="Orders per customer" value={c.orders_per_customer ?? "— Awaiting data"} />
          <Tile label="Net paid per customer" value={known(c.net_paid_per_customer_minor)} />
          <Tile label="Repeat purchase rate" value={rateText(c.repeat_purchase_rate)} />
        </div>
        <p className="text-sm text-ink/80">{c.identity} {c.note}</p>
      </Panel>
      <Panel id="cruise" title="Cruise and voyage customers" aside={<Sample item={cr} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Orders" value={cr.orders} />
          <Tile label="Paid revenue" value={money(cr.paid_revenue_minor)} />
          <Tile label="Average order" value={known(cr.average_order_minor)} />
          <Tile label="Video attachment" value={rateText(cr.video_attachment_rate)} />
          <Tile label="Physical keepsake" value={rateText(cr.physical_keepsake_attachment_rate)} />
          <Tile label="Repeat purchase" value={rateText(cr.repeat_purchase_rate)} />
          <Tile label="Support cases per order" value={cr.support_cases_per_order ?? "— Awaiting data"} />
          <Tile label="Refund rate" value={rateText(cr.refund_rate)} />
        </div>
        <p className="text-sm text-ink/80">{cr.identified_by}</p>
      </Panel>
      <Panel id="occasions" title="Occasions">
        <Table label="Orders by occasion" rows={data.occasions.occasions} columns={[
          { key: "label", label: "Occasion" }, { key: "orders", label: "Orders", render: (r) => String(r.orders) },
          { key: "rev", label: "Paid revenue", render: (r) => money(r.paid_revenue_minor) }, { key: "aov", label: "Average order", render: (r) => money(r.average_order_minor) },
          { key: "s", label: "Sample", render: (r) => <Sample item={r} /> },
        ]} />
        <p className="text-sm text-ink/80">{data.occasions.note}</p>
      </Panel>
      <Panel id="geography" title="Countries">
        <Table label="Orders by delivery country" rows={data.geography.countries} columns={[
          { key: "country", label: "Country", render: (r) => (r.country === "DIGITAL" ? "Digital (no delivery)" : r.country === "UNKNOWN" ? "Unknown" : r.country) },
          { key: "orders", label: "Orders", render: (r) => String(r.orders) }, { key: "rev", label: "Paid revenue", render: (r) => money(r.paid_revenue_minor) },
          { key: "aov", label: "Average order", render: (r) => money(r.average_order_minor) },
          { key: "cost", label: "Actual fulfilment cost", render: (r) => `${known(r.actual_fulfilment_cost_minor)} (${r.actual_fulfilment_cost_based_on})` },
          { key: "con", label: "Actual contribution", render: (r) => `${known(r.actual_contribution_minor)} (${r.actual_contribution_based_on})` },
          { key: "exc", label: "Delivery exceptions", render: (r) => String(r.delivery_exceptions) }, { key: "s", label: "Sample", render: (r) => <Sample item={r} /> },
        ]} />
        <p className="text-sm text-ink/80">{data.geography.note}</p>
      </Panel>
      <Panel id="funnel" title={`Sales funnel · ${data.funnel.label}`}>
        <Table label="Funnel stages" rows={data.funnel.stages} columns={[
          { key: "stage", label: "Stage", render: (r) => humanise(r.stage) },
          { key: "count", label: "Count", render: (r) => (r.count === null ? "Analytics coverage incomplete" : String(r.count)) },
          { key: "note", label: "Source", render: (r) => r.note },
        ]} />
        <p className="text-sm">{data.funnel.conversions.map((c: Json) => `${humanise(c.from)} → ${humanise(c.to)}: ${rateText(c.rate)}`).join(" · ")}</p>
        <p className="text-sm text-ink/80">{data.funnel.note}</p>
      </Panel>
    </>
  );
};

const Suppliers = ({ routes }: { routes: Json }) => (
  <Panel id="routes" title="Supplier routes (staff only)">
    <Table label="Supplier route performance" rows={routes.routes} columns={[
      { key: "route", label: "Route", render: (r) => `${r.route_id}${r.verification_status ? ` · ${humanise(r.verification_status)}` : ""}` },
      { key: "orders", label: "Orders", render: (r) => String(r.orders) },
      { key: "cost", label: "Actual purchase cost", render: (r) => known(r.actual_purchase_cost_minor) },
      { key: "var", label: "Purchase variance", render: (r) => (r.purchase_variance_minor === null || r.purchase_variance_minor === undefined ? "— Awaiting data" : `${money(r.purchase_variance_minor)}${r.purchase_variance_percent !== null ? ` (${r.purchase_variance_percent}%)` : ""}`) },
      { key: "ship", label: "Shipping variance", render: (r) => known(r.shipping_variance_minor) },
      { key: "dispatch", label: "Days to dispatch", render: (r) => r.average_days_to_dispatch ?? "—" },
      { key: "transit", label: "Days in transit", render: (r) => r.average_days_in_transit ?? "—" },
      { key: "damage", label: "Damage", render: (r) => rateText(r.damage_rate) },
      { key: "wrong", label: "Wrong item", render: (r) => rateText(r.wrong_item_rate) },
      { key: "cancel", label: "Cancellations", render: (r) => rateText(r.cancellation_rate) },
      { key: "tracking", label: "Tracking", render: (r) => rateText(r.tracking_reliability) },
      { key: "cases", label: "Support cases", render: (r) => String(r.support_cases ?? 0) },
      { key: "repl", label: "Replacements", render: (r) => rateText(r.replacement_rate) },
      { key: "dest", label: "Destinations", render: (r) => Object.entries((r.destinations ?? {}) as Record<string, number>).map(([k, n]) => `${k} ${n}`).join(", ") || "—" },
      { key: "s", label: "Sample", render: (r) => <Sample item={r} /> },
    ]} />
    <p className="text-sm text-ink/80">{routes.note}</p>
  </Panel>
);

const Support = ({ data }: { data: Json }) => {
  const r = data.refunds;
  const p = data.replacements;
  const s = data.support;
  return (
    <>
      <Panel id="refunds" title="Refunds" aside={<Sample item={r} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Full refunds" value={money(r.full_refunds.minor)} hint={`${r.full_refunds.count} recorded`} />
          <Tile label="Partial refunds" value={money(r.partial_refunds.minor)} hint={`${r.partial_refunds.count} recorded`} />
          <Tile label="Refund value" value={money(r.refund_value_minor)} />
          <Tile label="Refund rate" value={rateText(r.refund_rate)} hint={`${r.refunded_orders} order(s)`} />
        </div>
        <p className="text-sm">By case type: {Object.entries(r.by_reason as Record<string, Json>).map(([k, v]) => `${humanise(k)} ${v.count} (${money(v.minor)})`).join(", ") || "—"}. By root cause: {Object.entries(r.by_root_cause as Record<string, Json>).map(([k, v]) => `${humanise(k)} ${v.count}`).join(", ") || "—"}.</p>
        <p className="text-sm text-ink/80">{r.note}</p>
      </Panel>
      <Panel id="replacements" title="Replacements and recovery cost">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Replacements required" value={p.required} />
          <Tile label="Authorised or later" value={p.authorised_or_later} hint={`${p.completed} completed`} />
          <Tile label="Known actual cost" value={known(p.known_actual_cost_minor)} hint={`${p.with_actual_cost} with a recorded cost`} />
          <Tile label="Authorised, cost not recorded" value={p.authorised_without_actual_cost} emphasis={p.authorised_without_actual_cost > 0} />
        </div>
        <p className="text-sm">Recovery cost per affected order: {known(p.recovery_cost_per_affected_order_minor)}.</p>
        <p className="text-sm text-ink/80">{p.note}</p>
      </Panel>
      <Panel id="burden" title="Support burden" aside={<Sample item={s} />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Cases per order" value={s.cases_per_order ?? "— Awaiting data"} hint={`${s.cases} case(s)`} />
          <Tile label="Repeat contacts" value={s.repeat_contacts} />
          <Tile label="Objective MCB errors" value={s.objective_mcb_errors} />
          <Tile label="Preference contacts" value={s.subjective_preference_contacts} />
          <Tile label="Damage" value={s.damage} />
          <Tile label="Wrong item" value={s.wrong_item} />
          <Tile label="Delivery problem" value={s.delivery_problem} />
          <Tile label="Video problem" value={s.video_problem} />
        </div>
        <p className="text-sm text-ink/80">{s.note}</p>
      </Panel>
      <Panel id="root-causes" title="Root causes">
        <Table label="Root causes of resolved cases" rows={data.root_causes.root_causes} columns={[
          { key: "cause", label: "Root cause", render: (x) => humanise(x.root_cause) }, { key: "count", label: "Cases", render: (x) => String(x.count) },
          { key: "rate", label: "Share", render: (x) => rateText(x.rate) }, { key: "products", label: "Products affected", render: (x) => x.products_affected.join(", ") || "—" },
          { key: "routes", label: "Routes affected", render: (x) => x.routes_affected.join(", ") || "—" },
          { key: "refunds", label: "Refund value", render: (x) => money(x.refund_value_minor) }, { key: "repl", label: "Known replacement cost", render: (x) => money(x.known_replacement_cost_minor) },
        ]} />
        <p className="text-sm text-ink/80">{data.root_causes.note}</p>
      </Panel>
    </>
  );
};

const DataQuality = ({ quality, api, staff, onDone, exportCsv }: { quality: Json; api: Api; staff: string; onDone: (m: string) => void; exportCsv: (d: string) => void }) => {
  const [reference, setReference] = useState("");
  const [target, setTarget] = useState<Json | null>(null);
  const [category, setCategory] = useState("");
  const [basis, setBasis] = useState("ACTUAL");
  const [amount, setAmount] = useState("");
  const [remedy, setRemedy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entryCategories = (quality.cost_categories as Json[]).filter((c) => c.entry.length > 0);
  const chosen = entryCategories.find((c) => c.category === category);

  const find = async () => {
    setError(null);
    try {
      setTarget((await api(`/api/crm/business?cost_target=${encodeURIComponent(reference.trim())}&staff=${encodeURIComponent(staff)}`)).target);
    } catch (e) {
      setTarget(null);
      setError((e as Error).message);
    }
  };
  const record = async () => {
    setError(null);
    const minor = amount.trim() === "0" ? 0 : poundsToMinor(amount);
    if (minor === null) {
      setError("Give the amount in pounds, e.g. 1.45. Leave a cost you do not know unrecorded.");
      return;
    }
    try {
      await api("/api/crm/business", { action: "RECORD_DIRECT_COST", staff, order_reference: target?.reference, category, basis, amount_minor: minor, note: note || null, ...(category === "REPLACEMENT_COST" ? { remedy_id: Number(remedy) } : {}) });
      setAmount("");
      setNote("");
      await find();
      onDone("Cost recorded. Nothing was spent.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const voidEntry = async (id: number) => {
    try {
      await api("/api/crm/business", { action: "VOID_DIRECT_COST", staff, entry_id: id, reason: "Recorded in error" });
      await find();
      onDone("Entry voided (kept in history).");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const c = quality.completeness;
  return (
    <>
      <Panel id="completeness" title="Data completeness">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile label="Actual cost data complete" value={`${c.actual_complete_orders} of ${c.paid_orders}`} hint={c.actual_complete_percent === null ? "No paid orders yet" : `${c.actual_complete_percent}% of paid orders`} emphasis={c.paid_orders > 0 && c.actual_complete_orders < c.paid_orders} />
          <Tile label="Expected cost data complete" value={`${c.expected_complete_orders} of ${c.paid_orders}`} />
        </div>
      </Panel>
      <Panel id="gaps" title="What is still missing">
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
          {quality.gaps.map((g: Json) => (
            <li key={g.key} className={`${card} flex items-start justify-between gap-3`}>
              <span>{g.label}{g.detail?.length ? `: ${g.detail.join(", ")}` : ""}</span>
              <Status good={g.count === 0} label={g.status === "ANALYTICS_COVERAGE_INCOMPLETE" ? "Coverage incomplete" : g.count === 0 ? "OK" : `${g.count} of ${g.of}`} />
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink/80">{quality.note} {quality.internal_allowance_note}</p>
      </Panel>
      <Panel id="record-cost" title="Record a direct cost">
        <div className={`${card} space-y-3`}>
          <p className="text-sm">Only costs with no other home are recorded here. Purchase and shipping costs are recorded on the partner order, video cost on the video job and refunds in Customer Care, so nothing is counted twice. An unknown cost stays unrecorded — never enter it as £0.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 font-semibold">Order reference<input className={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MCB-2026-000123" /></label>
            <button type="button" className={secondary} disabled={!/^MCB-\d{4}-\d{6}$/.test(reference.trim())} onClick={find}>Find order</button>
          </div>
          {target && (
            <>
              <p className="font-semibold">{target.reference} · {target.currency}{target.has_video ? " · has a Memory Music Video" : ""}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block font-semibold">Cost
                  <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Choose</option>
                    {entryCategories.map((x) => <option key={x.category} value={x.category}>{humanise(x.category)}</option>)}
                  </select>
                </label>
                <label className="block font-semibold">Basis
                  <select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}>
                    {(chosen?.entry ?? ["EXPECTED", "ACTUAL"]).map((b: string) => <option key={b} value={b}>{b === "ACTUAL" ? "Actual" : "Expected"}</option>)}
                  </select>
                </label>
                <label className="block font-semibold">Amount ({target.currency === "GBP" ? "£" : target.currency})<input inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                {category === "REPLACEMENT_COST" && (
                  <label className="block font-semibold">Replacement
                    <select className={field} value={remedy} onChange={(e) => setRemedy(e.target.value)}>
                      <option value="">Choose</option>
                      {target.replacement_remedies.map((r: Json) => <option key={r.remedy_id} value={r.remedy_id}>#{r.remedy_id} {humanise(r.type)} ({humanise(r.status)})</option>)}
                    </select>
                  </label>
                )}
              </div>
              {chosen && <p className="text-sm">{chosen.record_at}</p>}
              <label className="block font-semibold">Note{category === "OTHER_DIRECT_COST" ? "" : " (optional)"}<input className={field} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button type="button" className={primary} disabled={!category || !amount.trim() || (category === "REPLACEMENT_COST" && !remedy)} onClick={record}>Record cost</button>
              {target.entries.length > 0 && (
                <ul className="m-0 list-none space-y-2 p-0">
                  {target.entries.map((e: Json) => (
                    <li key={e.entry_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-2">
                      <span>{humanise(e.category)} · {e.basis === "ACTUAL" ? "Actual" : "Expected"} · {money(e.amount_minor, e.currency)} · {e.status === "VOIDED" ? "voided" : "current"} · {e.recorded_by}</span>
                      {e.status === "CURRENT" && <button type="button" className={secondary} onClick={() => voidEntry(e.entry_id)}>Void</button>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <p role="alert" className="font-semibold text-[#8A1F1F]">{error}</p>}
        </div>
      </Panel>
      <Panel id="exports" title="Exports (CSV)">
        <div className="flex flex-wrap gap-2">
          {["products", "supplier_routes", "refunds", "alerts", "root_causes", "geography", "data_quality"].map((d) => <button key={d} type="button" className={secondary} onClick={() => exportCsv(d)}>{humanise(d)}</button>)}
        </div>
        <p className="text-sm text-ink/80">Aggregates and order references only — never stories, lyrics, photos, messages, names, emails, addresses or payment details. Every export is recorded.</p>
      </Panel>
    </>
  );
};

export default Business;
