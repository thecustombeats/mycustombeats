import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { READINESS_LABELS, ago, commandLink, humanise, money, parseCommandLink, type Json, type View } from "../lib/commandCentre";
import OrderView from "./command-centre/OrderView";
import { ActionCard, OrderRow, Panel, Status, Tile } from "./command-centre/ui";
import { card, eyebrow, field, primary, secondary } from "./command-centre/styles";

/**
 * /command-centre — the MCB Founder Command Centre.
 *
 * WHAT IS HAPPENING? WHAT NEEDS MY ATTENTION? WHAT REQUIRES MY DECISION?
 * HOW IS THE BUSINESS PERFORMING? IS ANY CUSTOMER OR ORDER IN TROUBLE?
 *
 * Staff and founders only: the CRM key is held in this tab's memory (never
 * stored) and sent as a Bearer header. No analytics, not indexed. Links and
 * cards only open things; every consequential action is an explicit, audited
 * request, and a financial decision needs Bella's or Lewis's own code.
 */

const NAV: { view: View; label: string }[] = [
  { view: "today", label: "MCB Today" },
  { view: "approvals", label: "Approvals" },
  { view: "orders", label: "Orders" },
  { view: "videos", label: "Videos" },
  { view: "customers", label: "Customers" },
  { view: "health", label: "Health & readiness" },
  { view: "notifications", label: "Notifications" },
  { view: "search", label: "Search" },
];

const CommandCentre = () => {
  const { hash } = useLocation();
  const link = parseCommandLink(hash);
  const [key, setKey] = useState("");
  const [staff, setStaff] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "all">("today");
  const [overview, setOverview] = useState<Json | null>(null);
  const [data, setData] = useState<Json | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [filter, setFilter] = useState("needs_action");
  const [query, setQuery] = useState("");

  const api = useCallback(async (path: string, body?: Json): Promise<Json> => {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setSignedIn(false);
      throw new Error("The CRM key was not accepted.");
    }
    if (!response.ok) throw new Error(payload.message ?? `Request failed (${response.status}).`);
    return payload;
  }, [key]);

  /** A private file (audio, artwork, photo) fetched with the key and shown from memory. */
  const fetchBlob = useCallback(async (path: string, type?: string): Promise<string> => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("That file could not be opened.");
    const blob = await response.blob();
    return URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
  }, [key]);

  const q = (extra: string) => `/api/crm/command-centre?${extra}&staff=${encodeURIComponent(staff)}`;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const run = async () => {
      try {
        if (link.order) {
          const found = await api(q(`view=search&q=${encodeURIComponent(link.order)}`));
          const match = found.results.find((o: Json) => o.reference === link.order);
          if (!cancelled) setOrderId(match ? match.order_id : null);
          if (!match) setMessage(`No paid order ${link.order} was found.`);
          return;
        }
        setOrderId(null);
        if (link.view === "today") setOverview(await api(q(`view=overview&period=${period}`)));
        else if (link.view === "approvals") setData(await api(q("view=approvals")));
        else if (link.view === "videos") setData(await api(q(`view=videos&period=${period}`)));
        else if (link.view === "orders") {
          const [ov, list] = await Promise.all([api(q(`view=overview&period=${period}`)), api(q(`view=orders&period=${period}${stage ? `&stage=${stage}` : ""}`))]);
          if (!cancelled) { setOverview(ov); setData(list); }
        } else if (link.view === "customers") setData(await api(q("view=customers")));
        else if (link.view === "health") {
          const [health, readiness] = await Promise.all([api(q("view=health")), api(q("view=readiness"))]);
          if (!cancelled) setData({ health, readiness });
        } else if (link.view === "notifications") setData(await api(q(`view=notifications&filter=${filter}`)));
      } catch (e) {
        if (!cancelled) setMessage((e as Error).message);
      }
    };
    setData(null);
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, link.view, link.order, link.open, period, stage, filter, api]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await api(`/api/crm/command-centre?view=health&staff=${encodeURIComponent(staff)}`);
      setSignedIn(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setData(await api(q(`view=search&q=${encodeURIComponent(query.trim())}`)));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const today = overview?.today;
  const PeriodSwitch = (
    <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
      {([["today", "Today"], ["week", "This week"], ["all", "All active"]] as const).map(([p, label]) => (
        <button key={p} type="button" aria-pressed={period === p} className={period === p ? primary : secondary} onClick={() => setPeriod(p)}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <Helmet>
        <title>MCB Command Centre</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <a href="#cc-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">Skip to content</a>
      <header className="bg-ink px-4 py-5 text-ivory sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">My Custom Beats</p>
            <p className="font-serif text-2xl !text-ivory sm:text-3xl">Founder Command Centre</p>
          </div>
          {signedIn && <p className="text-sm text-ivory/80">Signed in as {staff}</p>}
        </div>
        {signedIn && (
          <nav aria-label="Command Centre" className="mx-auto mt-4 max-w-7xl overflow-x-auto" tabIndex={-1}>
            <ul className="m-0 flex list-none gap-2 p-0 pb-1">
              {NAV.map((n) => {
                const current = link.view === n.view && !link.order;
                return (
                  <li key={n.view} className="shrink-0">
                    <a href={commandLink({ view: n.view })} aria-current={current ? "page" : undefined}
                      className={`inline-flex min-h-12 items-center rounded-full px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold ${current ? "bg-gold text-ink" : "text-ivory hover:bg-white/10"}`}>
                      {n.label}{n.view === "approvals" && overview?.approvals?.pending ? ` (${overview.approvals.pending})` : ""}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      <main id="cc-main" className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8">
        {!signedIn ? (
          <form onSubmit={signIn} className={`${card} mx-auto max-w-md space-y-4`}>
            <h1 className="font-serif text-3xl text-ink">Sign in</h1>
            <label className="block font-semibold">CRM key<input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={field} /></label>
            <label className="block font-semibold">Your name (for the audit trail)<input value={staff} onChange={(e) => setStaff(e.target.value)} className={field} /></label>
            <button className={primary} disabled={!key || !staff}>Open the Command Centre</button>
            {message && <p role="alert" className="font-semibold text-[#8A1F1F]">{message}</p>}
            {link.order && <p className="text-sm">After you sign in, order {link.order} opens. The link itself does nothing.</p>}
            <p className="text-sm text-ink/75">The key stays in this tab only and is forgotten when you close it.</p>
          </form>
        ) : (
          <>
            {message && <p role="status" className={`${card} whitespace-pre-wrap`}>{message} <button type="button" className="ml-2 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}

            {link.order ? (
              <>
                <a className={secondary} href={commandLink({ view: link.view })}>← Back</a>
                <h1 className="sr-only">Order {link.order}</h1>
                {orderId !== null && <OrderView key={`${orderId}-${link.open}`} orderId={orderId} open={link.open} api={api} fetchBlob={fetchBlob} staff={staff} />}
              </>
            ) : link.view === "today" ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={eyebrow}>{overview?.period?.label ?? "Today"} · times in UTC</p>
                    <h1 className="font-serif text-4xl text-ink">MCB Today</h1>
                  </div>
                  {PeriodSwitch}
                </div>
                {!overview ? <p role="status">Loading…</p> : (
                  <>
                    <Panel id="attention" title="Needs your attention" aside={<Status good={overview.attention.length === 0} label={overview.attention.length === 0 ? "Nothing waiting" : `${overview.attention.length} waiting`} />}>
                      {overview.attention.length === 0 ? <p className={card}>Nothing needs you right now.</p> : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{overview.attention.map((a: Json, i: number) => <ActionCard key={i} item={a} />)}</div>
                      )}
                    </Panel>
                    <Panel id="today-tiles" title={overview.period.label}>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                        <Tile label="Paid" value={today.paid} />
                        <Tile label="New memories" value={today.new_memories} />
                        <Tile label="Creating" value={today.creating} />
                        <Tile label="Needs quality check" value={today.needs_quality_check} emphasis={today.needs_quality_check > 0} />
                        <Tile label="Needs your approval" value={today.needs_your_approval} emphasis={today.needs_your_approval > 0} />
                        <Tile label="Being made" value={today.being_made} />
                        <Tile label="On the way" value={today.on_the_way} />
                        <Tile label="Delivered" value={today.delivered} />
                        <Tile label="Needs attention" value={today.needs_attention} emphasis={today.needs_attention > 0} />
                        <Tile label="Revenue" value={today.revenue ? money(today.revenue.net_paid_minor) : "—"} hint={today.revenue ? (today.revenue.test_orders > 0 ? `Plus ${money(today.revenue.test_paid_minor)} in TEST payments (not revenue)` : "Paid, live payments") : "See revenue by period below"} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Tile label="Estimated gross contribution" value={money(today.estimated_gross_contribution_minor)} hint="ESTIMATED · after expected fulfilment cost" />
                        <Tile label="Actual gross contribution" value={money(today.actual_gross_contribution_minor)} hint="ACTUAL · where actual fulfilment costs are recorded" />
                      </div>
                    </Panel>
                    <Pipeline overview={overview} onPick={(s) => { setStage(s); window.location.hash = commandLink({ view: "orders" }); }} />
                    <Panel id="money" title="Paid revenue">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {(["today", "week", "month"] as const).map((p) => {
                          const r = overview.revenue[p];
                          return (
                            <div key={p} className={card}>
                              <p className={eyebrow}>{{ today: "Today", week: "This week", month: "This month" }[p]}</p>
                              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-base">
                                <dt>Gross paid</dt><dd className="m-0 text-right font-semibold">{money(r.gross_paid_minor)}</dd>
                                <dt>Refunds</dt><dd className="m-0 text-right">{money(r.refunds_minor)}</dd>
                                <dt className="font-semibold">Net paid</dt><dd className="m-0 text-right font-semibold">{money(r.net_paid_minor)}</dd>
                                <dt className="text-sm text-ink/70">Paid orders</dt><dd className="m-0 text-right text-sm text-ink/70">{r.paid_orders}</dd>
                              </dl>
                              {r.test_orders > 0 && <p className="mt-2 text-sm text-ink/70">{r.test_orders} TEST payment(s), {money(r.test_paid_minor)} — rehearsal, not revenue.</p>}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-sm text-ink/70">{overview.revenue.refunds_note}</p>
                    </Panel>
                    <Profit profit={overview.profit} />
                    <Panel id="customers-summary" title="Customers needing help">
                      <CustomerList customers={overview.customers} />
                    </Panel>
                    <Panel id="health-summary" title="MCB system health" aside={<Status good={overview.health.status === "ALL_GOOD"} label={overview.health.label} />}>
                      <HealthList items={overview.health.items} />
                    </Panel>
                    {overview.videos && <VideoSummary videos={overview.videos} />}
                    <MusicPlatform platform={overview.music_platform} />
                  </>
                )}
              </>
            ) : link.view === "videos" ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h1 className="font-serif text-4xl text-ink">Videos</h1>
                  {PeriodSwitch}
                </div>
                {!data?.summary ? <p role="status">Loading…</p> : (
                  <>
                    <VideoSummary videos={data.summary} />
                    <Panel id="video-jobs" title="Videos in progress">
                      {data.jobs.length === 0 ? <p className={card}>No Memory Music Videos are in progress.</p> : (
                        <ul className="m-0 list-none space-y-2 p-0">
                          {data.jobs.map((j: Json) => (
                            <li key={j.video_job_id} className={`${card} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
                              <div className="min-w-0">
                                <p className="font-semibold text-ink">{j.order.reference} · song {j.song} · {j.order.customer}</p>
                                <p className="text-sm text-ink/80">{VIDEO_STATUS_LABELS[j.status] ?? humanise(j.status)} · {ago(j.since)}</p>
                              </div>
                              <a className={primary} href={commandLink({ view: "videos", order: j.order.reference, open: j.status === "QUALITY_CHECK_REQUIRED" ? "quality" : "card" })}>Open<span className="sr-only"> {j.order.reference}</span></a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                    <Panel id="video-metrics" title="Video product metrics">
                      <dl className={`${card} grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base`}>
                        <dt>Offer impressions</dt><dd className="m-0 text-right">{data.metrics.offer_impressions}</dd>
                        <dt>Selection rate</dt><dd className="m-0 text-right">{pct(data.metrics.selection_rate)}</dd>
                        <dt>Purchase rate</dt><dd className="m-0 text-right">{pct(data.metrics.purchase_rate)}</dd>
                        <dt>Videos purchased</dt><dd className="m-0 text-right">{data.metrics.videos_purchased}</dd>
                        <dt>Video revenue</dt><dd className="m-0 text-right">{money(data.metrics.video_revenue_minor)}</dd>
                        <dt>Average selling price</dt><dd className="m-0 text-right">{money(data.metrics.average_selling_price_minor)}</dd>
                        <dt>Capacity used</dt><dd className="m-0 text-right">{pct(data.metrics.capacity_utilisation)}</dd>
                        <dt>Average production time</dt><dd className="m-0 text-right">{data.metrics.average_production_hours === null ? "— Awaiting data" : `${data.metrics.average_production_hours} hours`}</dd>
                        <dt>Rework rate</dt><dd className="m-0 text-right">{pct(data.metrics.rework_rate)}</dd>
                        <dt>Quality check failure rate</dt><dd className="m-0 text-right">{pct(data.metrics.qc_failure_rate)}</dd>
                        <dt>Contribution where cost is known</dt><dd className="m-0 text-right">{money(data.metrics.contribution_minor_where_cost_known)}</dd>
                      </dl>
                      <p className="text-sm text-ink/80">{data.metrics.note}</p>
                    </Panel>
                  </>
                )}
              </>
            ) : link.view === "approvals" ? (
              <>
                <h1 className="font-serif text-4xl text-ink">Approvals</h1>
                <p className="text-base">Only decisions that need Bella or Lewis. Everyday staff tasks are not listed here.</p>
                {!data ? <p role="status">Loading…</p> : (
                  <>
                    <Panel id="pending" title="Waiting for a founder">
                      {data.pending.length === 0 ? <p className={card}>No decisions are waiting.</p> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{data.pending.map((a: Json, i: number) => <ActionCard key={i} item={{ ...a, title: a.kind === "SUPPLIER_PURCHASE" ? "Purchase approval required" : a.title, kind: a.kind === "SUPPLIER_PURCHASE" ? "PURCHASE_APPROVAL" : a.kind, priority: 1 }} />)}</div>}
                    </Panel>
                    <Panel id="decided" title="Decided">
                      {data.decided.length === 0 ? <p className={card}>No founder decisions recorded yet.</p> : (
                        <ul className="m-0 list-none space-y-2 p-0">{data.decided.map((d: Json, i: number) => (
                          <li key={i} className={card}><p className="font-semibold">{d.title} · {d.reference}</p><p className="text-sm">By {humanise(d.decided_by)} · {d.decided_at} UTC</p></li>
                        ))}</ul>
                      )}
                    </Panel>
                  </>
                )}
              </>
            ) : link.view === "orders" ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h1 className="font-serif text-4xl text-ink">Orders</h1>
                  {PeriodSwitch}
                </div>
                {overview && <Pipeline overview={overview} active={stage} onPick={setStage} />}
                {!data?.orders ? <p role="status">Loading…</p> : (
                  <Panel id="order-list" title={stage ? `${humanise(stage)} (${data.orders.length})` : `All orders (${data.orders.length})`} aside={stage ? <button type="button" className={secondary} onClick={() => setStage(null)}>Show all</button> : undefined}>
                    {data.orders.length === 0 ? <p className={card}>No orders here.</p> : <ul className="m-0 list-none space-y-2 p-0">{data.orders.map((o: Json) => <OrderRow key={o.order_id} order={o} />)}</ul>}
                  </Panel>
                )}
              </>
            ) : link.view === "customers" ? (
              <>
                <h1 className="font-serif text-4xl text-ink">Customers needing help</h1>
                <p>Every unresolved customer problem stays here until it is resolved, even when the order itself is complete.</p>
                {!data ? <p role="status">Loading…</p> : <CustomerList customers={data.customers} />}
              </>
            ) : link.view === "health" ? (
              <>
                <h1 className="font-serif text-4xl text-ink">Health &amp; readiness</h1>
                {!data ? <p role="status">Loading…</p> : (
                  <>
                    <Panel id="health" title="MCB system health" aside={<Status good={data.health.status === "ALL_GOOD"} label={data.health.label} />}>
                      <HealthList items={data.health.items} />
                    </Panel>
                    <Panel id="readiness" title="Launch readiness">
                      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
                        {data.readiness.readiness.map((r: Json) => (
                          <li key={r.key} className={card}>
                            <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{r.label}</span><Status good={r.status === "READY"} label={READINESS_LABELS[r.status] ?? r.status} /></p>
                            <p className="mt-1 text-sm text-ink/80">{r.detail}</p>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                    <MusicPlatform platform={data.readiness.music_platform} />
                  </>
                )}
              </>
            ) : link.view === "notifications" ? (
              <>
                <h1 className="font-serif text-4xl text-ink">Notifications</h1>
                <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                  {([["needs_action", "Needs action"], ["delivered", "Delivered"], ["failed", "Failed"], ["all", "All"]] as const).map(([f, label]) => (
                    <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? primary : secondary} onClick={() => setFilter(f)}>{label}</button>
                  ))}
                </div>
                {!data?.notifications ? <p role="status">Loading…</p> : (
                  <>
                    <div className={card}>
                      <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">Telegram:</span><Status good={data.bridge.telegram === "CONNECTED"} label={data.bridge.telegram === "CONNECTED" ? "Connected" : "Not connected"} /></p>
                      <p className="mt-1 text-sm">{data.bridge.detail}</p>
                    </div>
                    {data.notifications.length === 0 ? <p className={card}>Nothing here.</p> : (
                      <ul className="m-0 list-none space-y-2 p-0">{data.notifications.map((n: Json) => (
                        <li key={n.id} className={card}>
                          <p className="font-semibold">{n.title} · {n.reference}</p>
                          <p className="text-sm">{n.status} · via {n.channel} · {ago(n.created_at)}</p>
                          {n.order_id && n.reference?.startsWith("MCB-") && <a className={`${secondary} mt-2`} href={commandLink({ view: "notifications", order: n.reference, open: "card" })}>Open order<span className="sr-only"> {n.reference}</span></a>}
                        </li>
                      ))}</ul>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <h1 className="font-serif text-4xl text-ink">Search</h1>
                <form onSubmit={search} role="search" className="flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="cc-search" className="sr-only">Order reference, customer name, email or product</label>
                  <input id="cc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Order reference, customer name, email or product" className={field} />
                  <button className={primary} disabled={query.trim().length < 2}>Search</button>
                </form>
                {data?.results && (data.results.length === 0 ? <p className={card}>No paid orders match.</p> : <ul className="m-0 list-none space-y-2 p-0">{data.results.map((o: Json) => <OrderRow key={o.order_id} order={o} />)}</ul>)}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const Pipeline = ({ overview, onPick, active = null }: { overview: Json; onPick: (stage: string) => void; active?: string | null }) => (
  <Panel id="pipeline" title="Orders pipeline">
    <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4 xl:grid-cols-7">
      {overview.pipeline.map((p: Json) => (
        <li key={p.stage}>
          <button type="button" aria-pressed={active === p.stage} onClick={() => onPick(p.stage)}
            className={`flex min-h-20 w-full flex-col items-start justify-center rounded-2xl border-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold ${active === p.stage ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white text-ink hover:border-ink"}`}>
            <span className="font-serif text-3xl leading-none">{p.count}</span>
            <span className="mt-1 text-sm font-semibold">{p.label}</span>
          </button>
        </li>
      ))}
    </ol>
  </Panel>
);

const Profit = ({ profit }: { profit: Json }) => (
  <Panel id="profit" title="MCB profit snapshot">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {[profit.estimated, profit.actual].map((p: Json) => (
        <div key={p.label} className={card}>
          <p className={eyebrow}>{p.label}</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-base">
            <dt>Orders with cost data</dt><dd className="m-0 text-right">{p.orders}</dd>
            <dt>Revenue</dt><dd className="m-0 text-right">{money(p.revenue_minor)}</dd>
            <dt>{p.label === "ESTIMATED" ? "Expected fulfilment cost" : "Actual fulfilment cost"}</dt><dd className="m-0 text-right">{money(p.cost_minor)}</dd>
            <dt className="font-semibold">{p.label === "ESTIMATED" ? "Expected gross contribution" : "Actual gross contribution"}</dt><dd className="m-0 text-right font-semibold">{money(p.contribution_minor)}</dd>
            <dt>Gross contribution %</dt><dd className="m-0 text-right">{p.contribution_percent === null ? "— Awaiting data" : `${p.contribution_percent}%`}</dd>
          </dl>
        </div>
      ))}
    </div>
    <p className="text-sm text-ink/80">{profit.orders_awaiting_cost_data} physical order(s) awaiting cost data (not counted as zero). {profit.digital_orders_not_costed} digital order(s) are not costed. {profit.note} Excludes: {profit.excludes.join(", ")}.</p>
  </Panel>
);

const CustomerList = ({ customers }: { customers: Json[] }) =>
  customers.length === 0 ? <p className={card}>No customer is waiting for help.</p> : (
    <ul className="m-0 list-none space-y-2 p-0">
      {customers.map((c: Json, i: number) => (
        <li key={i} className={`${card} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
          <div>
            <p className="font-semibold">{c.label} · {c.order.reference}</p>
            <p className="text-sm">{c.order.customer} · open {ago(c.since)} · order stage: {c.order.stage_label}</p>
          </div>
          <a className={primary} href={commandLink({ view: "customers", order: c.order.reference, open: "card" })}>Open<span className="sr-only"> {c.order.reference}</span></a>
        </li>
      ))}
    </ul>
  );

const HealthList = ({ items }: { items: Json[] }) => (
  <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
    {items.map((i: Json) => (
      <li key={i.key} className={`${card} flex items-start justify-between gap-3`}>
        <span>{i.label}{i.detail?.length ? `: ${i.detail.join(", ")}` : ""}</span>
        <Status good={i.count === 0} label={i.count === 0 ? "OK" : String(i.count)} />
      </li>
    ))}
  </ul>
);

const VIDEO_STATUS_LABELS: Record<string, string> = {
  INPUT_REQUIRED: "Awaiting photographs", READY: "Waiting for the song", PRODUCTION_REQUIRED: "Ready to make", PRODUCTION_IN_PROGRESS: "Being made",
  CANDIDATE_READY: "Being checked", QUALITY_CHECK_REQUIRED: "Needs quality check", REWORK_REQUIRED: "Being remade", READY_FOR_REVEAL: "Ready", REVEALED: "Delivered", EXCEPTION: "Needs attention",
};

const pct = (rate: number | null | undefined) => (rate === null || rate === undefined ? "— Awaiting data" : `${Math.round(rate * 1000) / 10}%`);

const VideoSummary = ({ videos }: { videos: Json }) => (
  <Panel id="videos-summary" title="Memory Music Videos">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Video orders" value={videos.video_orders} />
      <Tile label="Awaiting input" value={videos.awaiting_input} />
      <Tile label="Ready to make" value={videos.ready_to_make} emphasis={videos.ready_to_make > 0} />
      <Tile label="Being made" value={videos.being_made} />
      <Tile label="Needs quality check" value={videos.needs_quality_check} emphasis={videos.needs_quality_check > 0} />
      <Tile label="Ready" value={videos.ready} />
      <Tile label="Delivered" value={videos.revealed} />
      <Tile label="Needs attention" value={videos.exceptions} emphasis={videos.exceptions > 0} />
    </div>
    <div className={card}>
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-serif text-xl text-ink">Video capacity · {videos.capacity.period_key}</span>
        <Status good={videos.capacity.state === "AVAILABLE"} label={videos.capacity.state === "FULL" ? "Full" : videos.capacity.state === "LOW" ? "Low" : "Available"} />
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-base">
        <dt>Planned</dt><dd className="m-0 text-right">{videos.capacity.planned}</dd>
        <dt>Reserved</dt><dd className="m-0 text-right">{videos.capacity.reserved + videos.capacity.held}</dd>
        <dt>Completed</dt><dd className="m-0 text-right">{videos.capacity.completed}</dd>
        <dt className="font-semibold">Remaining</dt><dd className="m-0 text-right font-semibold">{videos.capacity.remaining}</dd>
      </dl>
      <p className="mt-2 text-sm font-semibold text-[#7A5E1F]">{videos.capacity.label}</p>
      <p className="text-sm text-ink/80">Reserved includes spaces held for customers currently at checkout.</p>
    </div>
  </Panel>
);

const MusicPlatform = ({ platform }: { platform: Json }) => (
  <Panel id="music-platform" title="Music platform">
    <dl className={`${card} grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base`}>
      <dt className="font-semibold">Platform</dt><dd className="m-0">{platform.name.toUpperCase()}</dd>
      <dt className="font-semibold">Decision</dt><dd className="m-0">{humanise(platform.decision).toUpperCase()}</dd>
      <dt className="font-semibold">Account</dt><dd className="m-0">{humanise(platform.account).toUpperCase()}</dd>
      <dt className="font-semibold">Integration</dt><dd className="m-0">{humanise(platform.integration).toUpperCase()}</dd>
    </dl>
    <p className="text-sm text-ink/80">Songs are produced manually until the integration is verified. Nothing connects to the platform yet.</p>
  </Panel>
);

export default CommandCentre;
