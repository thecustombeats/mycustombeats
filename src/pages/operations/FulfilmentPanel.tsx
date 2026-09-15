import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CONTENT_PERMISSION_SCOPES, EXCEPTION_RESOLUTIONS, FOUNDER_ONLY_RESOLUTIONS, FULFILMENT_EXCEPTION_TYPES, VARIANCE_REASONS } from "../../data/production/fulfilment";
import { FINANCIAL_AUTHORISERS } from "../../data/operations";

/**
 * The Fulfilment Controller on the staff order page (STAFF ONLY).
 *
 * MCB is the middleman: a person places every supplier order by hand, after
 * Bella or Lewis has authorised it. This panel records what happened —
 * supplier orders and their actual costs, parcels, tracking, exceptions,
 * evidence and permissions — through the same audited order actions as the
 * rest of the console. Nothing here checks out, pays, refunds or contacts a
 * partner, and nothing shown here reaches a customer page.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const input =
  "mt-1 w-full min-h-11 rounded-lg border border-ink/25 bg-white px-3 py-2 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep";
const btn =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-60";
const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-ink/40 px-4 py-2 text-base font-semibold text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep disabled:opacity-60";

const humanise = (value: string) => value.replace(/[._]/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const money = (minor: number | null | undefined, currency = "GBP") =>
  minor === null || minor === undefined ? "— Awaiting data" : `${(minor / 100).toFixed(2)} ${currency}`;
const today = () => new Date().toISOString().slice(0, 10);
const pounds = (value: string): number | undefined => (value.trim() === "" ? undefined : Math.round(Number(value) * 100));

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="font-semibold">{label}</span>{children}</label>
);

/** The founder decision card figures: economics, routes, destination, what REQUIRED would block. */
export const DecisionDetails = ({ decision }: { decision: Json }) => {
  const e = decision.economics ?? {};
  const cur = e.currency ?? "GBP";
  return (
    <div className="mt-3 space-y-3 text-sm">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Delivery destination</dt><dd className="m-0">{decision.destination?.summary ?? "not on file"} · {humanise(decision.destination_status ?? "")}</dd>
        <dt className="font-semibold">Customer revenue</dt><dd className="m-0">{money(e.revenue_minor, cur)}</dd>
        <dt className="font-semibold">Expected purchase</dt><dd className="m-0">{money(e.purchase_cost_minor, cur)}</dd>
        <dt className="font-semibold">Expected delivery provision</dt><dd className="m-0">{money(e.shipping_cost_minor, cur)}{e.contingency_minor ? ` + contingency ${money(e.contingency_minor, cur)}` : ""}{e.handling_minor ? ` + handling ${money(e.handling_minor, cur)}` : ""}</dd>
        <dt className="font-semibold">Total expected internal cost</dt><dd className="m-0">{money(e.total_cost_minor, cur)}</dd>
        <dt className="font-semibold">Estimated gross contribution</dt><dd className="m-0">{money(e.contribution_minor, cur)}{e.margin_basis_points !== null && e.margin_basis_points !== undefined ? ` (${(e.margin_basis_points / 100).toFixed(1)}%)` : ""}</dd>
        <dt className="font-semibold">Commercial check</dt><dd className="m-0">{humanise(e.status ?? "")}</dd>
      </dl>
      {e.missing?.length > 0 && <p><span className="font-semibold">Data still needed: </span>{e.missing.map(humanise).join(", ")}</p>}
      {e.safety?.violations?.length > 0 && <p className="font-semibold text-[#9B2C2C]">Commercial safety: {e.safety.violations.map(humanise).join(", ")}. The customer's paid price is honoured; a founder decides.</p>}
      <p className="text-espresso/75">Excludes: {(e.excludes ?? []).map(humanise).join(", ")}.</p>
      <ul className="m-0 list-disc pl-5">
        {(decision.lines ?? []).map((l: Json) => (
          <li key={l.sku}>
            {l.quantity} × {l.product}: {l.route ? (
              <>
                route {l.route.route_id} · {l.route.supplier ?? "partner not named"} · {humanise(l.route.shipping_model ?? "delivery model not recorded")} · {humanise(l.route.verification_status)}
                {l.route.production_estimate ? ` · production ${l.route.production_estimate}` : ""}{l.route.delivery_estimate ? ` · delivery ${l.route.delivery_estimate}` : ""}
                {l.route.limitations?.length > 0 ? ` · limitations: ${l.route.limitations.join("; ")}` : ""}
              </>
            ) : "no supplier route on file"}
            {l.destination ? ` · ${humanise(l.destination.status)}` : ""}
          </li>
        ))}
      </ul>
      <p>
        <span className="font-semibold">Enforcement {decision.enforcement}.</span>{" "}
        {decision.would_block_if_required?.length > 0
          ? `Under REQUIRED this would be blocked by: ${decision.would_block_if_required.map(humanise).join(", ")}.`
          : "Nothing here would block under REQUIRED."}
      </p>
    </div>
  );
};

interface Props {
  controller: Json;
  state: string | null;
  actions: string[];
  run: (action: string, body: Json) => Promise<boolean>;
  downloadEvidence: (id: number) => void;
}

const FulfilmentPanel = ({ controller, state, actions, run, downloadEvidence }: Props) => {
  const [supplierOrder, setSupplierOrder] = useState<Record<string, string>>({});
  const [parcelForm, setParcelForm] = useState<Record<string, string>>({ dispatched_on: today(), delivered_on: today() });
  const [exceptionForm, setExceptionForm] = useState<Record<string, string>>({});
  const [resolveForm, setResolveForm] = useState<Record<string, string>>({});
  const [permission, setPermission] = useState<Record<string, string>>({});
  const can = (action: string) => actions.includes(action);
  const w = controller.workspace;

  const recordSupplierOrder = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run("RECORD_SUPPLIER_ORDER", {
      supplier_order_reference: supplierOrder.reference,
      skus: supplierOrder.sku ? [supplierOrder.sku] : undefined,
      actual_purchase_cost_minor: pounds(supplierOrder.purchase ?? ""),
      actual_shipping_cost_minor: pounds(supplierOrder.shipping ?? ""),
      variance_reason: supplierOrder.variance_reason || undefined,
      expected_dispatch_date: supplierOrder.expected_dispatch_date || undefined,
      expected_delivery_date: supplierOrder.expected_delivery_date || undefined,
      confirmation_reference: supplierOrder.confirmation_reference || undefined,
      notes: supplierOrder.notes || undefined,
      currency: "GBP",
      send_email: true,
    });
    if (ok) setSupplierOrder({});
  };

  const resolve = async (event: FormEvent, exception: Json) => {
    event.preventDefault();
    const founderOnly = (FOUNDER_ONLY_RESOLUTIONS as readonly string[]).includes(resolveForm.resolution);
    const ok = await run("RESOLVE_FULFILMENT_EXCEPTION", {
      exception_id: exception.id,
      resolution: resolveForm.resolution,
      note: resolveForm.note,
      ...(founderOnly ? { founder: resolveForm.founder, founder_code: resolveForm.founder_code, confirm: resolveForm.confirm === "yes" } : {}),
    });
    if (ok) setResolveForm({});
  };

  return (
    <div className="space-y-6">
      {w && (
        <div>
          <h4 className="font-serif text-lg text-ink">Supplier order workspace</h4>
          <p className="text-sm">Authorised by {humanise(w.authorised_by)} at {w.authorised_at}. {w.note}</p>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-sm">
            {w.instructions.map((i: Json) => (
              <li key={i.sku}>
                {i.quantity} × {i.product}: {i.supplier ?? "partner not on file"}{i.configuration ? ` · ${i.configuration}` : ""}
                {i.product_url && <> · <a href={i.product_url} target="_blank" rel="noopener noreferrer" className="underline">partner product page<span className="sr-only"> (opens in a new window)</span></a></>}
                {i.order_instructions ? ` · ${i.order_instructions}` : ""}{i.cancellation_cutoff ? ` · cancellation: ${i.cancellation_cutoff}` : ""}
                {i.checkout_destination_check && <strong> · verify the destination at the partner checkout before ordering</strong>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {can("RECORD_SUPPLIER_ORDER") && (
        <form onSubmit={recordSupplierOrder} className="space-y-3 rounded-xl border border-ink/15 p-4" aria-labelledby="record-supplier-order">
          <h4 id="record-supplier-order" className="font-serif text-lg text-ink">Record a supplier order placed by hand</h4>
          <p className="text-sm">Never enter card numbers, security codes, passwords or account details.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Partner order reference"><input className={input} value={supplierOrder.reference ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, reference: e.target.value })} /></Field>
            <Field label="Item (if this order covers one item)">
              <select className={input} value={supplierOrder.sku ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, sku: e.target.value })}>
                <option value="">Every physical item</option>
                {(controller.decision?.lines ?? []).map((l: Json) => <option key={l.sku} value={l.sku}>{l.product}</option>)}
              </select>
            </Field>
            <Field label="Actual purchase (£)"><input className={input} inputMode="decimal" value={supplierOrder.purchase ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, purchase: e.target.value })} /></Field>
            <Field label="Actual partner delivery (£)"><input className={input} inputMode="decimal" value={supplierOrder.shipping ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, shipping: e.target.value })} /></Field>
            <Field label="If different from expected: why">
              <select className={input} value={supplierOrder.variance_reason ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, variance_reason: e.target.value })}>
                <option value="">No difference</option>
                {VARIANCE_REASONS.map((r) => <option key={r} value={r}>{humanise(r)}</option>)}
              </select>
            </Field>
            <Field label="Confirmation reference (optional)"><input className={input} value={supplierOrder.confirmation_reference ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, confirmation_reference: e.target.value })} /></Field>
            <Field label="Expected dispatch"><input type="date" className={input} value={supplierOrder.expected_dispatch_date ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, expected_dispatch_date: e.target.value })} /></Field>
            <Field label="Expected delivery"><input type="date" className={input} value={supplierOrder.expected_delivery_date ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, expected_delivery_date: e.target.value })} /></Field>
          </div>
          <Field label="Notes (internal)"><textarea rows={2} className={input} value={supplierOrder.notes ?? ""} onChange={(e) => setSupplierOrder({ ...supplierOrder, notes: e.target.value })} /></Field>
          <button className={btn} disabled={!supplierOrder.reference}>Record supplier order</button>
        </form>
      )}

      <div>
        <h4 className="font-serif text-lg text-ink">Supplier orders</h4>
        {controller.supplier_orders.length === 0 ? <p className="text-sm">None recorded.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Supplier orders table">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="pr-3">Reference</th><th className="pr-3">Route</th><th className="pr-3">By / authorised</th><th className="pr-3">Expected</th><th className="pr-3">Actual</th><th>Variance</th></tr></thead>
              <tbody>
                {controller.supplier_orders.map((s: Json) => (
                  <tr key={s.id} className="border-t border-ink/10">
                    <td className="pr-3">{s.reference}</td><td className="pr-3">{s.route_id ?? "—"}</td><td className="pr-3">{s.operator} / {humanise(s.financial_authoriser)}</td>
                    <td className="pr-3">{money(s.expected_total_cost_minor, s.currency)}</td><td className="pr-3">{money(s.actual_total_cost_minor, s.currency)}</td>
                    <td>{s.variance_minor === null ? "—" : `${money(s.variance_minor, s.currency)}${s.variance_reason ? ` (${humanise(s.variance_reason)})` : ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {controller.actual_economics && (
          <p className="mt-2 text-sm">Actual gross contribution {money(controller.actual_economics.contribution_minor, controller.actual_economics.currency)}{controller.actual_economics.contribution_variance_minor !== null ? ` · against expected ${money(controller.actual_economics.contribution_variance_minor, controller.actual_economics.currency)}` : ""}.</p>
        )}
      </div>

      <div>
        <h4 className="font-serif text-lg text-ink">Parcels</h4>
        <p className="text-sm">
          {controller.delivery_position.required === 0 ? "No parcels yet." : `${controller.delivery_position.delivered} of ${controller.delivery_position.required} required parcel(s) delivered.`}
          {controller.delivery_position.blocking_exceptions.length > 0 ? ` Blocking: ${controller.delivery_position.blocking_exceptions.map(humanise).join(", ")}.` : ""}
          {" "}The order is delivered only when every required parcel has arrived.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Carrier"><input className={input} value={parcelForm.carrier ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, carrier: e.target.value })} /></Field>
          <Field label="Tracking reference"><input className={input} value={parcelForm.tracking_reference ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, tracking_reference: e.target.value })} /></Field>
          <Field label="Tracking link (https)"><input type="url" className={input} value={parcelForm.tracking_url ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, tracking_url: e.target.value })} /></Field>
          <Field label="Dispatched on"><input type="date" className={input} value={parcelForm.dispatched_on ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, dispatched_on: e.target.value })} /></Field>
          <Field label="Estimated delivery"><input type="date" className={input} value={parcelForm.estimated_delivery_date ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, estimated_delivery_date: e.target.value })} /></Field>
          <Field label="Delivered on"><input type="date" className={input} value={parcelForm.delivered_on ?? ""} onChange={(e) => setParcelForm({ ...parcelForm, delivered_on: e.target.value })} /></Field>
        </div>
        <ul className="m-0 mt-3 list-none space-y-3 p-0">
          {controller.shipments.map((p: Json) => (
            <li key={p.id} className="rounded-xl border border-ink/10 p-3">
              <p className="font-semibold">Parcel {p.sequence} · {humanise(p.state)}{p.required ? "" : " · not required"}</p>
              <p className="text-sm">{p.carrier ?? "carrier not recorded"}{p.tracking_reference ? ` · ${p.tracking_reference}` : ""}{p.dispatched_on ? ` · sent ${p.dispatched_on}` : ""}{p.estimated_delivery_date ? ` · expected ${p.estimated_delivery_date}` : ""}{p.delivered_on ? ` · delivered ${p.delivered_on}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.state === "AWAITING_DISPATCH" && can("MARK_SHIPMENT_DISPATCHED") && (
                  <button type="button" className={ghost} disabled={!parcelForm.carrier} onClick={() => run("MARK_SHIPMENT_DISPATCHED", { shipment_id: p.id, carrier: parcelForm.carrier, tracking_reference: parcelForm.tracking_reference || undefined, tracking_url: parcelForm.tracking_url || undefined, dispatched_on: parcelForm.dispatched_on, estimated_delivery_date: parcelForm.estimated_delivery_date || undefined })}>Mark parcel {p.sequence} dispatched</button>
                )}
                {["DISPATCHED", "IN_TRANSIT", "DELAYED"].includes(p.state) && (
                  <>
                    {p.state !== "IN_TRANSIT" && <button type="button" className={ghost} onClick={() => run("UPDATE_SHIPMENT", { shipment_id: p.id, state: "IN_TRANSIT" })}>In transit</button>}
                    <button type="button" className={ghost} onClick={() => run("UPDATE_SHIPMENT", { shipment_id: p.id, state: "DELAYED", notify_customer: true })}>Delayed (tell the customer)</button>
                    <button type="button" className={ghost} onClick={() => run("MARK_SHIPMENT_DELIVERED", { shipment_id: p.id, delivered_on: parcelForm.delivered_on })}>Mark parcel {p.sequence} delivered</button>
                    <button type="button" className={ghost} onClick={() => run("MARK_SHIPMENT_LOST", { shipment_id: p.id })}>Lost</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {can("ADD_SHIPMENT") && (
          <button type="button" className={`${ghost} mt-3`} onClick={() => run("ADD_SHIPMENT", {})}>Add a parcel</button>
        )}
      </div>

      <div>
        <h4 className="font-serif text-lg text-ink">Fulfilment exceptions</h4>
        {controller.exceptions.length === 0 && <p className="text-sm">None.</p>}
        <ul className="m-0 list-none space-y-3 p-0">
          {controller.exceptions.map((x: Json) => (
            <li key={x.id} className={`rounded-xl border p-3 ${x.status === "OPEN" && x.blocking ? "border-[#9B2C2C]/50" : "border-ink/10"}`}>
              <p className="font-semibold">{humanise(x.type)} · {x.status}{x.blocking ? " · blocking" : ""}</p>
              {x.detail && <p className="text-sm">{x.detail}</p>}
              {x.next_action && <p className="text-sm">Next: {x.next_action}</p>}
              {x.resolution && <p className="text-sm">Resolved: {humanise(x.resolution)}{x.resolution_authorised_by ? ` · decided by ${humanise(x.resolution_authorised_by)}` : ""}</p>}
              {x.status === "OPEN" && can("RESOLVE_FULFILMENT_EXCEPTION") && (
                <form onSubmit={(e) => resolve(e, x)} className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Resolution">
                    <select className={input} value={resolveForm.exception === String(x.id) ? resolveForm.resolution ?? "" : ""} onChange={(e) => setResolveForm({ exception: String(x.id), resolution: e.target.value })}>
                      <option value="">Choose…</option>
                      {EXCEPTION_RESOLUTIONS.map((r) => <option key={r} value={r}>{humanise(r)}{(FOUNDER_ONLY_RESOLUTIONS as readonly string[]).includes(r) ? " (founder)" : ""}</option>)}
                    </select>
                  </Field>
                  <Field label="What was decided and done"><input className={input} value={resolveForm.exception === String(x.id) ? resolveForm.note ?? "" : ""} onChange={(e) => setResolveForm({ ...resolveForm, exception: String(x.id), note: e.target.value })} /></Field>
                  {resolveForm.exception === String(x.id) && (FOUNDER_ONLY_RESOLUTIONS as readonly string[]).includes(resolveForm.resolution) && (
                    <>
                      <Field label="Founder deciding">
                        <select className={input} value={resolveForm.founder ?? ""} onChange={(e) => setResolveForm({ ...resolveForm, founder: e.target.value })}>
                          <option value="">Choose…</option>
                          {FINANCIAL_AUTHORISERS.map((f) => <option key={f} value={f}>{humanise(f)}</option>)}
                        </select>
                      </Field>
                      <Field label="Your founder authorisation code"><input type="password" autoComplete="off" className={input} value={resolveForm.founder_code ?? ""} onChange={(e) => setResolveForm({ ...resolveForm, founder_code: e.target.value })} /></Field>
                      <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={resolveForm.confirm === "yes"} onChange={(e) => setResolveForm({ ...resolveForm, confirm: e.target.checked ? "yes" : "" })} /><span className="font-semibold">I make this decision for MCB</span></label>
                    </>
                  )}
                  <div className="sm:col-span-2"><button className={ghost} disabled={resolveForm.exception !== String(x.id) || !resolveForm.resolution || !resolveForm.note}>Resolve</button></div>
                </form>
              )}
            </li>
          ))}
        </ul>
        {can("RAISE_FULFILMENT_EXCEPTION") && (
          <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await run("RAISE_FULFILMENT_EXCEPTION", { type: exceptionForm.type, detail: exceptionForm.detail, blocking: exceptionForm.blocking === "yes", next_action: exceptionForm.next_action || undefined })) setExceptionForm({}); }}>
            <Field label="Raise an exception">
              <select className={input} value={exceptionForm.type ?? ""} onChange={(e) => setExceptionForm({ ...exceptionForm, type: e.target.value })}>
                <option value="">Choose…</option>
                {FULFILMENT_EXCEPTION_TYPES.filter((t) => !["COMMERCIAL_DATA_REQUIRED", "AUTHORISED_CARD_ALTERNATIVE"].includes(t)).map((t) => <option key={t} value={t}>{humanise(t)}</option>)}
              </select>
            </Field>
            <Field label="Detail (internal)"><input className={input} value={exceptionForm.detail ?? ""} onChange={(e) => setExceptionForm({ ...exceptionForm, detail: e.target.value })} /></Field>
            <Field label="Next action"><input className={input} value={exceptionForm.next_action ?? ""} onChange={(e) => setExceptionForm({ ...exceptionForm, next_action: e.target.value })} /></Field>
            <label className="flex items-center gap-2 self-end"><input type="checkbox" className="h-5 w-5" checked={exceptionForm.blocking === "yes"} onChange={(e) => setExceptionForm({ ...exceptionForm, blocking: e.target.checked ? "yes" : "" })} /><span className="font-semibold">Blocks delivery completion</span></label>
            <div className="sm:col-span-2"><button className={ghost} disabled={!exceptionForm.type}>Raise exception</button></div>
          </form>
        )}
      </div>

      {controller.evidence.length > 0 && (
        <div>
          <h4 className="font-serif text-lg text-ink">Customer evidence (private)</h4>
          <ul className="m-0 list-none space-y-2 p-0 text-sm">
            {controller.evidence.map((ev: Json) => (
              <li key={ev.id}>
                Case #{ev.service_request_id} · {humanise(ev.kind)}{ev.reference ? ` · “${ev.reference}”` : ""}
                {ev.has_file && <button type="button" className={`${ghost} ml-2`} onClick={() => downloadEvidence(ev.id)}>Download</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state === "COMPLETED" && (
        <div className="space-y-3">
          <h4 className="font-serif text-lg text-ink">Review request and content permission</h4>
          <p className="text-sm">Completion never waited for these. A review is never requested in exchange for anything, and a review is not permission to use the customer's words, photographs or song.</p>
          <p className="text-sm">Review: {controller.review_requested ? "requested" : "not requested"}.</p>
          {!controller.review_requested && can("RECORD_REVIEW_REQUEST") && (
            <div className="flex flex-wrap gap-2">
              {["EMAIL", "WHATSAPP", "PHONE"].map((c) => <button key={c} type="button" className={ghost} onClick={() => run("RECORD_REVIEW_REQUEST", { channel: c })}>Review requested by {humanise(c)}</button>)}
            </div>
          )}
          <ul className="m-0 list-disc pl-5 text-sm">
            {controller.content_permissions.map((p: Json) => <li key={p.scope}>{humanise(p.scope)}: {humanise(p.status)} ({humanise(p.granted_via)} · {p.evidence_reference})</li>)}
            {controller.content_permissions.length === 0 && <li>No marketing content permission recorded.</li>}
          </ul>
          {can("RECORD_CONTENT_PERMISSION") && (
            <form className="grid gap-2 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); if (await run("RECORD_CONTENT_PERMISSION", { scope: permission.scope, status: "GRANTED", granted_via: permission.granted_via, evidence_reference: permission.evidence_reference })) setPermission({}); }}>
              <Field label="Permission covers">
                <select className={input} value={permission.scope ?? ""} onChange={(e) => setPermission({ ...permission, scope: e.target.value })}>
                  <option value="">Choose…</option>
                  {CONTENT_PERMISSION_SCOPES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
                </select>
              </Field>
              <Field label="Given by">
                <select className={input} value={permission.granted_via ?? ""} onChange={(e) => setPermission({ ...permission, granted_via: e.target.value })}>
                  <option value="">Choose…</option>
                  {["WRITTEN_CONSENT", "EMAIL", "OTHER"].map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
                </select>
              </Field>
              <Field label="Where the consent is kept"><input className={input} value={permission.evidence_reference ?? ""} onChange={(e) => setPermission({ ...permission, evidence_reference: e.target.value })} /></Field>
              <div className="sm:col-span-3"><button className={ghost} disabled={!permission.scope || !permission.granted_via || !permission.evidence_reference}>Record permission</button></div>
            </form>
          )}
          {controller.lifecycle_hooks.length > 0 && <p className="text-sm">Prepared (nothing sent; consent required): {controller.lifecycle_hooks.map((h: Json) => humanise(h.hook)).join(", ")}.</p>}
        </div>
      )}
    </div>
  );
};

export default FulfilmentPanel;
