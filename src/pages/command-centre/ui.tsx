import type { ReactNode } from "react";
import { ago, commandLink, money, humanise, type Json } from "../../lib/commandCentre";
import { card, eyebrow, primary } from "./styles";

export const Panel = ({ id, title, children, aside }: { id: string; title: string; children: ReactNode; aside?: ReactNode }) => (
  <section aria-labelledby={id} className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="font-serif text-2xl text-ink">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

export const Tile = ({ label, value, hint, emphasis = false }: { label: string; value: ReactNode; hint?: string; emphasis?: boolean }) => (
  <div className={`${card} ${emphasis ? "border-gold bg-[#FBF6EA]" : ""}`}>
    <p className={eyebrow}>{label}</p>
    <p className="mt-1 font-serif text-3xl leading-tight text-ink">{value}</p>
    {hint && <p className="mt-1 text-sm text-ink/70">{hint}</p>}
  </div>
);

/** One attention item. The button only opens the order; it performs nothing. */
export const ActionCard = ({ item }: { item: Json }) => {
  const o = item.order;
  const f = item.facts ?? {};
  return (
    <article className={`${card} flex flex-col gap-3 border-l-4 ${item.priority === 1 ? "border-l-[#9B2C2C]" : "border-l-gold"}`} aria-label={`${item.title}, ${o.reference}`}>
      <div>
        <p className={eyebrow}>{item.priority === 1 ? "Priority · " : ""}{item.title}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{o.reference}</p>
        <p className="text-base text-ink/80">{o.product}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink">
        <dt className="font-semibold">Customer</dt><dd className="m-0">{o.customer}</dd>
        {item.kind === "PURCHASE_APPROVAL" ? (
          <>
            <dt className="font-semibold">Customer paid</dt><dd className="m-0">{money(f.customer_paid_minor, o.currency)}{o.test_payment ? " (TEST)" : ""}</dd>
            <dt className="font-semibold">Expected fulfilment</dt><dd className="m-0">{money(f.expected_fulfilment_minor, o.currency)}</dd>
            <dt className="font-semibold">Estimated contribution</dt><dd className="m-0">{money(f.estimated_contribution_minor, o.currency)}</dd>
            <dt className="font-semibold">Destination</dt><dd className="m-0">{f.destination_country ?? "— Awaiting data"}</dd>
            <dt className="font-semibold">Payment</dt><dd className="m-0">{humanise(f.payment)}</dd>
            <dt className="font-semibold">MCB checks</dt><dd className="m-0">{humanise(f.mcb_checks)}</dd>
          </>
        ) : (
          <>
            {f.item && (<><dt className="font-semibold">What</dt><dd className="m-0">{f.item}</dd></>)}
            {f.problem && (<><dt className="font-semibold">Problem</dt><dd className="m-0">{humanise(f.problem)}</dd></>)}
          </>
        )}
        <dt className="font-semibold">Waiting</dt><dd className="m-0">{ago(item.since)}</dd>
      </dl>
      <a className={`${primary} self-start`} href={item.action.open === "final" ? `/operations#order=${o.reference}&action=PASS_QUALITY_CHECK` : commandLink({ view: "orders", order: o.reference, open: item.action.open })}>
        {item.action.label}<span className="sr-only"> for {o.reference}</span>
      </a>
    </article>
  );
};

export const OrderRow = ({ order }: { order: Json }) => (
  <li className={`${card} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
    <div className="min-w-0">
      <p className="font-semibold text-ink">{order.reference} · {order.customer}</p>
      <p className="text-sm text-ink/80">{order.product}</p>
      <p className="text-sm text-ink/70">{order.stage_label} · {ago(order.stage_since)}{order.test_payment ? " · TEST payment" : ""}</p>
    </div>
    <a className={primary} href={commandLink({ view: "orders", order: order.reference, open: "card" })}>Open<span className="sr-only"> {order.reference}</span></a>
  </li>
);

export const Status = ({ good, label }: { good: boolean; label: string }) => (
  <span className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${good ? "bg-[#E7F2EA] text-[#1E5631]" : "bg-[#FBEAEA] text-[#8A1F1F]"}`}>
    <span aria-hidden="true">{good ? "✓" : "!"}</span>{label}
  </span>
);
