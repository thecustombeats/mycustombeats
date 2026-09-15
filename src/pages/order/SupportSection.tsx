import { useId, useState } from "react";
import type { FormEvent } from "react";
import { SUPPORT_COPY, SUPPORT_DIGITAL_ISSUES, SUPPORT_EMAIL } from "../../data/production/customer-care";
import {
  LinkError,
  formatDay,
  sendCaseMessage,
  sendCaseSatisfaction,
  sendSupportEvidence,
  sendSupportRequest,
  type DigitalIssue,
  type EvidenceKind,
  type OrderProgress,
  type SupportCase,
  type SupportKind,
} from "../../lib/customerOrder";

/**
 * MCB customer care on the private order page.
 *
 * "Need help with your order?" in plain choices, and "We're helping with your
 * order" for anything already raised: a plain status, MCB's latest reply,
 * whether MCB needs anything, and a way to reply. Nothing here names a
 * supplier, partner, provider or internal step, and nothing is sent to
 * analytics. Ordinary order help is by email or this page — never WhatsApp.
 */

const card = "rounded-3xl border border-ink/10 bg-white p-6 md:p-8";
const label = "block text-base font-semibold text-ink";
const field =
  "mt-2 w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";
const button =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-ink/30 bg-white px-6 py-3 text-base font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";
const alert = "rounded-xl bg-[#FDECEC] px-4 py-3 text-base font-semibold text-[#9B2C2C]";

const PHYSICAL_KINDS: SupportKind[] = ["DAMAGED_OR_FAULTY", "WRONG_ITEM", "MANUFACTURING_DEFECT", "DELIVERY_PROBLEM"];
const DIGITAL_KINDS: SupportKind[] = ["VIDEO_PROBLEM", "DIGITAL_DELIVERY_PROBLEM"];
const OTHER_DETAILS_KINDS: SupportKind[] = ["WRONG_ITEM", "VIDEO_PROBLEM", "DIGITAL_DELIVERY_PROBLEM", "INCORRECT_DETAIL"];

const errorText = (e: unknown, fallback: string) => (e instanceof LinkError ? Object.values(e.fields)[0] ?? e.message : fallback);

/** Optional evidence. Helpful, never a condition of getting help. */
const AddEvidence = ({ token, caseId, onDone }: { token: string; caseId: number; onDone?: () => void }) => {
  const ids = useId();
  const [kind, setKind] = useState<EvidenceKind>("PARCEL_PHOTO");
  const [photo, setPhoto] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const isVideo = kind === "UNBOXING_VIDEO_REFERENCE";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const result = await sendSupportEvidence(token, caseId, { kind, ...(photo && !isVideo ? { photo } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) });
      setStatus(result.message);
      setPhoto(null);
      setReference("");
      onDone?.();
    } catch (e) {
      setError(errorText(e, "We couldn't add that just now. Your message is safe with us."));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 border-t border-ink/10 pt-6" aria-labelledby={`${ids}-heading`}>
      <h4 id={`${ids}-heading`} className="font-serif text-xl text-ink">Add a photo (optional)</h4>
      <p className="text-base leading-relaxed">A photo of the parcel or the item helps us put things right quickly. It is not needed for us to help you.</p>
      <div>
        <label htmlFor={`${ids}-kind`} className={label}>What is it?</label>
        <select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)} className={field}>
          <option value="PARCEL_PHOTO">A photo of the parcel</option>
          <option value="PRODUCT_PHOTO">A photo of the item</option>
          <option value="UNBOXING_VIDEO_REFERENCE">I recorded the opening (tell us where it is)</option>
          <option value="OTHER">Something else (for example a screenshot)</option>
        </select>
      </div>
      {!isVideo && (
        <div>
          <label htmlFor={`${ids}-photo`} className={label}>Photo (JPEG, PNG, WebP or HEIC, up to 10 MB)</label>
          <input id={`${ids}-photo`} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className={field} />
        </div>
      )}
      <div>
        <label htmlFor={`${ids}-reference`} className={label}>{isVideo ? "Where is the recording? We'll ask for it if we need it." : "Anything to add (optional)"}</label>
        <input id={`${ids}-reference`} value={reference} maxLength={500} onChange={(e) => setReference(e.target.value)} className={field} />
      </div>
      {status && <p role="status" className="text-base font-semibold text-ink">{status}</p>}
      {error && <p role="alert" className={alert}>{error}</p>}
      <button type="submit" disabled={sending || (!photo && !reference.trim())} className={button}>{sending ? "Adding…" : "Add"}</button>
    </form>
  );
};

/** One conversation the customer has with MCB. */
const CaseCard = ({ token, item, onChanged }: { token: string; item: SupportCase; onChanged: () => void }) => {
  const ids = useId();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [evidence, setEvidence] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (reply.trim().length < 2) {
      setError("Please write your message.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sendCaseMessage(token, item.case_id, reply.trim());
      setReply("");
      setStatus(result.message);
      onChanged();
    } catch (e) {
      setError(errorText(e, "We couldn't send that just now. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const answer = async (value: "YES" | "NO") => {
    setError(null);
    try {
      const result = await sendCaseSatisfaction(token, item.case_id, value);
      setStatus(result.message);
      onChanged();
    } catch (e) {
      setError(errorText(e, "We couldn't save that just now."));
    }
  };

  return (
    <li className="rounded-2xl border border-ink/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl text-ink">{item.type}</h3>
        <p className="text-base text-espresso/75">Sent {formatDay(item.opened_on)}</p>
      </div>
      <p className={`mt-3 inline-flex min-h-10 items-center rounded-full px-4 text-base font-semibold ${item.needs_you ? "bg-gold/20 text-ink" : "bg-ink/5 text-ink"}`}>{item.status_label}</p>
      <p className="mt-3 text-base leading-relaxed">{item.next_step}</p>
      {item.summary && <p className="mt-2 text-base leading-relaxed text-ink">{item.summary}</p>}

      <ol className="m-0 mt-5 list-none space-y-3 p-0" aria-label="Your conversation with MCB">
        {item.thread.map((m, i) => (
          <li key={i} className={`rounded-2xl px-4 py-3 ${m.from === "MCB" ? "bg-[#F3EEE4]" : "bg-ivory"}`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-espresso/75">{m.from === "MCB" ? "MCB" : "You"} · {formatDay(m.at.slice(0, 10))}</p>
            <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-ink">{m.body}</p>
          </li>
        ))}
      </ol>

      {item.satisfaction.asked && (
        <fieldset className="mt-5 rounded-2xl border border-ink/10 p-4">
          <legend className="px-1 text-base font-semibold text-ink">{item.satisfaction.question}</legend>
          <p className="text-sm text-espresso/75">Optional — it helps us look after you.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={secondary} onClick={() => answer("YES")}>Yes</button>
            <button type="button" className={secondary} onClick={() => answer("NO")}>No</button>
          </div>
        </fieldset>
      )}

      <form onSubmit={send} className="mt-5 space-y-3">
        <label htmlFor={`${ids}-reply`} className={label}>{item.needs_you ? "Your reply" : "Add a message"}</label>
        <textarea id={`${ids}-reply`} rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} className={field} />
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={sending} className={button}>{sending ? "Sending…" : "Send"}</button>
          {item.can_add_evidence && !evidence && <button type="button" className={secondary} onClick={() => setEvidence(true)}>Add a photo</button>}
        </div>
      </form>
      {status && <p role="status" className="mt-3 text-base font-semibold text-ink">{status}</p>}
      {error && <p role="alert" className={`mt-3 ${alert}`}>{error}</p>}
      {evidence && <AddEvidence token={token} caseId={item.case_id} />}
    </li>
  );
};

/** "Need help with your order?" — the structured choices, then a few words. */
const NeedHelp = ({ token, progress, onChanged }: { token: string; progress: OrderProgress; onChanged: () => void }) => {
  const ids = useId();
  const physical = progress.workflow === "PHYSICAL";
  const kinds = progress.support_kinds ?? [];
  const [kind, setKind] = useState<SupportKind | null>(null);
  const [item, setItem] = useState(progress.items[0]?.key ?? "");
  const [issue, setIssue] = useState<DigitalIssue | "">("");
  const [otherDetails, setOtherDetails] = useState(false);
  const [priority, setPriority] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const chosen = progress.items.find((i) => i.key === item);
  const offersPriority = physical && kind === "DAMAGED_OR_FAULTY" && chosen?.priority_replacement;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!kind) {
      setError("Please choose what this is about.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Please tell us a little more (at least 10 characters).");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sendSupportRequest(token, {
        kind,
        ...(physical && PHYSICAL_KINDS.includes(kind) && item ? { item } : {}),
        ...(DIGITAL_KINDS.includes(kind) && issue ? { issue } : {}),
        ...(OTHER_DETAILS_KINDS.includes(kind) && otherDetails ? { otherCustomerDetails: true } : {}),
        ...(offersPriority ? { priorityReplacement: priority } : {}),
        description: description.trim(),
      });
      setDone(result.message);
      setCaseId(result.evidence ? result.case_id : null);
      onChanged();
    } catch (e) {
      setError(errorText(e, "We couldn't send that just now. Please try again."));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div role="status" className={card}>
        <h2 className="font-serif text-2xl text-ink">Thank you</h2>
        <p className="mt-3 text-lg leading-relaxed">{done}</p>
        {caseId !== null && <AddEvidence token={token} caseId={caseId} />}
        <button type="button" className={`${secondary} mt-6`} onClick={() => { setDone(null); setKind(null); setDescription(""); setCaseId(null); }}>Ask about something else</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-6`} aria-labelledby={`${ids}-heading`}>
      <div>
        <h2 id={`${ids}-heading`} className="font-serif text-2xl text-ink">{SUPPORT_COPY.heading}</h2>
        <p className="mt-2 text-lg leading-relaxed">{SUPPORT_COPY.intro}</p>
      </div>
      <fieldset>
        <legend className={label}>What is it about?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {kinds.map((k) => (
            <label key={k.kind} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-base text-ink ${kind === k.kind ? "border-gold-dark bg-gold/10" : "border-ink/15"}`}>
              <input type="radio" name={`${ids}-kind`} value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} className="h-5 w-5 accent-[#856823]" />
              {k.label}
            </label>
          ))}
        </div>
        {kind === "INCORRECT_DETAIL" && <p className="mt-3 text-base leading-relaxed text-espresso/80">{SUPPORT_COPY.incorrectDetailHelp}</p>}
      </fieldset>

      {physical && kind && PHYSICAL_KINDS.includes(kind) && progress.items.length > 0 && (
        <div>
          <label htmlFor={`${ids}-item`} className={label}>Which item?</label>
          <select id={`${ids}-item`} value={item} onChange={(e) => setItem(e.target.value)} className={field}>
            {progress.items.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </select>
        </div>
      )}

      {kind && DIGITAL_KINDS.includes(kind) && (
        <div>
          <label htmlFor={`${ids}-issue`} className={label}>What's happening? (optional)</label>
          <select id={`${ids}-issue`} value={issue} onChange={(e) => setIssue(e.target.value as DigitalIssue | "")} className={field}>
            <option value="">Choose if it helps</option>
            {SUPPORT_DIGITAL_ISSUES.map((i) => <option key={i.issue} value={i.issue}>{i.label}</option>)}
          </select>
        </div>
      )}

      {kind && OTHER_DETAILS_KINDS.includes(kind) && (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-ink/15 px-4 py-3 text-base text-ink">
          <input type="checkbox" checked={otherDetails} onChange={(e) => setOtherDetails(e.target.checked)} className="mt-1 h-5 w-5 accent-[#856823]" />
          <span>{SUPPORT_COPY.otherCustomerDetails}</span>
        </label>
      )}

      {offersPriority && (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-ink/15 px-4 py-3 text-base text-ink">
          <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} className="mt-1 h-5 w-5 accent-[#856823]" />
          <span>
            Request MCB Priority Replacement for this item
            {chosen?.priority_replacement?.request_by && (
              <span className="block text-espresso/75">Requests for this service can be made until {formatDay(chosen.priority_replacement.request_by)}.</span>
            )}
          </span>
        </label>
      )}

      <div>
        <label htmlFor={`${ids}-description`} className={label}>Tell us what happened</label>
        <textarea id={`${ids}-description`} rows={5} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} aria-describedby={`${ids}-help`} />
        <p id={`${ids}-help`} className="mt-2 text-base text-espresso/75">
          {physical ? "If something is damaged, a photo helps — you can add one after sending. " : ""}{SUPPORT_COPY.serviceTarget}
        </p>
      </div>
      {physical && <p className="text-base leading-relaxed text-espresso/80">Your normal consumer rights are not affected, whether or not you chose MCB Priority Replacement.</p>}
      {error && <p role="alert" className={alert}>{error}</p>}
      <button type="submit" disabled={sending} className={button}>{sending ? "Sending…" : "Send to MCB"}</button>
      <p className="text-base text-espresso/80">
        You can also email <a className="font-semibold text-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </form>
  );
};

const SupportSection = ({ token, progress, onChanged }: { token: string; progress: OrderProgress; onChanged: () => void }) => {
  const cases = progress.support ?? [];
  return (
    <>
      {cases.length > 0 && (
        <section className={card} aria-labelledby="order-care">
          <h2 id="order-care" className="font-serif text-2xl text-ink">{SUPPORT_COPY.caseHeading}</h2>
          <ul className="m-0 mt-5 list-none space-y-5 p-0">
            {cases.map((c) => <CaseCard key={c.case_id} token={token} item={c} onChanged={onChanged} />)}
          </ul>
        </section>
      )}
      <NeedHelp token={token} progress={progress} onChanged={onChanged} />
    </>
  );
};

export default SupportSection;
