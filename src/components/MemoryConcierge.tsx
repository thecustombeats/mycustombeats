import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PACKAGES, formatPrice } from '../data/packages';
import { recommendMemory } from '../lib/memoryConcierge';
import type { ConciergeAnswers, MemoryIntent } from '../lib/memoryConcierge';

export default function MemoryConcierge({ onChoose }: { onChoose: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ConciergeAnswers>({ intent: 'song', memories: 1, budget: null });
  const heading = useRef<HTMLHeadingElement>(null);
  const result = recommendMemory(answers);
  const pkg = PACKAGES.find(p => p.id === result.packageId)!;
  const move = (next: number) => { setStep(next); requestAnimationFrame(() => heading.current?.focus()); };
  const control = 'min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink';
  return <aside className="my-10 rounded-2xl border border-ink/15 bg-white p-6 md:p-10 text-ink" aria-label="MCB Memory Concierge">
    <p className="text-sm uppercase tracking-widest text-ink/75">MCB Memory Concierge</p>
    <h3 ref={heading} tabIndex={-1} className="mt-3 mb-4 text-2xl md:text-3xl font-serif focus:outline-none">
      {open ? (step === 3 ? 'A thoughtful place to begin' : `Let’s find your experience · ${step + 1} of 3`) : 'Have a memory in mind, but unsure where to begin?'}
    </h3>
    {!open ? <><p className="max-w-2xl mb-5 text-base leading-relaxed">Three simple questions to help you choose. Take the guidance that feels right for your story.</p><button className={control} onClick={() => { setOpen(true); move(0); }}>Help me choose</button></> : <>
      {step === 0 && <fieldset><legend className="mb-4 text-lg">What would you like to create?</legend><div className="grid sm:grid-cols-2 gap-3">
        {([['moment', 'One beautiful Moment · £10'], ['song', 'One fully personalised song'], ['collection', 'Several memories as a collection'], ['bespoke', 'Something beyond the packages']] as [MemoryIntent, string][]).map(([id, label]) => <label key={id} className={`${control} flex items-center gap-3 cursor-pointer`}><input type="radio" name="concierge-intent" value={id} checked={answers.intent === id} onChange={() => setAnswers({ ...answers, intent: id })} />{label}</label>)}
      </div></fieldset>}
      {step === 1 && <fieldset><legend className="mb-4 text-lg">How many memories would you like to preserve?</legend><p className="mb-4">Choose the closest fit. Bespoke can explore ideas beyond these packages.</p><div className="flex flex-wrap gap-3">{([1, 4, 6] as const).map(n => <label className={`${control} flex gap-3 items-center`} key={n}><input type="radio" name="concierge-count" checked={answers.memories === n} onChange={() => setAnswers({ ...answers, memories: n, intent: answers.intent === 'bespoke' ? 'bespoke' : n > 1 ? 'collection' : answers.intent })}/>{n} {n === 1 ? 'memory' : 'memories'}</label>)}</div></fieldset>}
      {step === 2 && <><label htmlFor="concierge-budget" className="block text-lg mb-4">Is there a budget you would like us to keep in mind?</label><select id="concierge-budget" className={control} value={answers.budget ?? ''} onChange={e => setAnswers({ ...answers, budget: e.target.value ? Number(e.target.value) : null })}><option value="">I’m exploring / prefer not to say</option><option value="10">Up to £10</option><option value="99">Up to £99</option><option value="199">Up to £199</option><option value="349">Up to £349</option></select><p className="mt-4">Prices are in GBP. Physical extras and delivery can add to your total.</p></>}
      {step === 3 && <div aria-live="polite"><h4 className="text-2xl font-serif mb-3">{pkg.name} · {formatPrice(pkg)}</h4><p className="max-w-2xl leading-relaxed">{result.reason}</p>{!result.withinBudget && <p className="mt-4 font-medium">{pkg.id === 'bespoke' ? 'Bespoke needs a quote before we can confirm a budget fit.' : 'This is above the budget you selected. You can start with fewer memories or browse the packages; there is no need to stretch your budget.'}</p>}<div className="mt-6">{pkg.id === 'bespoke' ? <Link className={control} to="/full-package">Explore Bespoke</Link> : <button className={control} onClick={() => onChoose(pkg.id)}>Explore {pkg.name}</button>}</div><p className="mt-5 text-sm leading-relaxed">Guidance is based on your choices and MCB’s package rules. It is not a conversation with a person or a live AI service.</p></div>}
      <div className="mt-6 flex flex-wrap gap-3">{step > 0 && <button className={control} onClick={() => move(step - 1)}>Back</button>}{step < 3 && <button className={`${control} font-semibold`} onClick={() => move(step + 1)}>{step === 2 ? 'See my suggestion' : 'Continue'}</button>}<button className="min-h-12 px-4 underline underline-offset-4" onClick={() => {setOpen(false);setStep(0);}}>Browse without guidance</button></div>
    </>}
  </aside>;
}
