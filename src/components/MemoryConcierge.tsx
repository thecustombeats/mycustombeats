import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BESPOKE, JOURNEY, KEEPSAKE, MOMENT, formatMinor, requireProduct } from '../data/catalogue';
import {
  budgetChoicesMinor,
  largestFixedSongCount,
  recommendMemory,
} from '../lib/memoryConcierge';
import type { ConciergeAnswers, ConciergeOption, MemoryIntent } from '../lib/memoryConcierge';

/**
 * Rules-based guidance over the canonical catalogue. Every name, capacity and
 * price shown here is read from `data/catalogue` through `lib/memoryConcierge`.
 */

type Step = 'intent' | 'songs' | 'budget' | 'result';

const INTENTS: readonly [MemoryIntent, string][] = [
  ['quick-song', `One quick song · ${MOMENT.name}`],
  ['keepsake', `A physical keepsake · ${KEEPSAKE.name}`],
  ['journey', `A multi-song album · ${JOURNEY.name}`],
  ['bespoke', `Something individually curated · ${BESPOKE.name}`],
];

const MAX_SONGS = largestFixedSongCount();
const SONG_CHOICES = Array.from({ length: MAX_SONGS }, (_, i) => i + 1);
const BUDGET_CHOICES = budgetChoicesMinor();

const stepsFor = (intent: MemoryIntent): Step[] =>
  intent === 'bespoke'
    ? ['intent', 'result']
    : intent === 'quick-song'
      ? ['intent', 'budget', 'result']
      : ['intent', 'songs', 'budget', 'result'];

const optionLine = (option: ConciergeOption) =>
  `${option.name} · ${option.songCount === 1 ? '1 song' : `${option.songCount} songs`} · ${formatMinor(option.priceMinor)}`;

export default function MemoryConcierge({ onChoose }: { onChoose: (productId: string, sku?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ConciergeAnswers>({ intent: 'keepsake', songs: 1, budgetMinor: null });
  const heading = useRef<HTMLHeadingElement>(null);

  const steps = stepsFor(answers.intent);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const questionCount = steps.length - 1;
  const result = recommendMemory(answers.intent === 'quick-song' ? { ...answers, songs: 1 } : answers);
  const product = requireProduct(result.productId);

  const move = (next: number) => { setStepIndex(next); requestAnimationFrame(() => heading.current?.focus()); };
  const control = 'min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink';

  return <aside className="my-10 rounded-2xl border border-ink/15 bg-white p-6 md:p-10 text-ink" aria-label="MCB Memory Concierge">
    <p className="text-sm uppercase tracking-widest text-ink/75">MCB Memory Concierge</p>
    <h3 ref={heading} tabIndex={-1} className="mt-3 mb-4 text-2xl md:text-3xl font-serif focus:outline-none">
      {open ? (step === 'result' ? 'A thoughtful place to begin' : `Let’s find your experience · ${stepIndex + 1} of ${questionCount}`) : 'Have a memory in mind, but unsure where to begin?'}
    </h3>
    {!open ? <><p className="max-w-2xl mb-5 text-base leading-relaxed">A few simple questions to help you choose. Take the guidance that feels right for your story.</p><button className={control} onClick={() => { setOpen(true); move(0); }}>Help me choose</button></> : <>
      {step === 'intent' && <fieldset><legend className="mb-4 text-lg">What would you like to create?</legend><div className="grid sm:grid-cols-2 gap-3">
        {INTENTS.map(([id, label]) => <label key={id} className={`${control} flex items-center gap-3 cursor-pointer`}><input type="radio" name="concierge-intent" value={id} checked={answers.intent === id} onChange={() => setAnswers({ ...answers, intent: id })} />{label}</label>)}
      </div></fieldset>}
      {step === 'songs' && <><label htmlFor="concierge-songs" className="block text-lg mb-4">How many songs or memories would you like to preserve?</label><select id="concierge-songs" className={control} value={answers.songs} onChange={e => setAnswers({ ...answers, songs: Number(e.target.value) })}>{SONG_CHOICES.map(n => <option key={n} value={n}>{n} {n === 1 ? 'song or memory' : 'songs or memories'}</option>)}<option value={MAX_SONGS + 1}>More than {MAX_SONGS}</option></select><p className="mt-4">Choose the closest fit. {BESPOKE.name} can explore ideas beyond these.</p></>}
      {step === 'budget' && <><label htmlFor="concierge-budget" className="block text-lg mb-4">Is there a budget you would like us to keep in mind?</label><select id="concierge-budget" className={control} value={answers.budgetMinor ?? ''} onChange={e => setAnswers({ ...answers, budgetMinor: e.target.value ? Number(e.target.value) : null })}><option value="">I’m exploring / prefer not to say</option>{BUDGET_CHOICES.map(minor => <option key={minor} value={minor}>Up to {formatMinor(minor)}</option>)}</select><p className="mt-4">Prices are in GBP. Optional extras and delivery can add to your total.</p></>}
      {step === 'result' && <div aria-live="polite">
        <h4 className="text-2xl font-serif mb-3">{result.option ? `${result.option.name} · ${formatMinor(result.option.priceMinor)}` : `${product.name} · ${product.disclosures.join(' · ')}`}</h4>
        <p className="max-w-2xl leading-relaxed">{result.reason}</p>
        {result.sameCapacity.length > 0 && <p className="mt-4 text-sm leading-relaxed">Also holds the same songs: {result.sameCapacity.map(optionLine).join('; ')}.</p>}
        {result.lowerPricedAlternative && <p className="mt-2 text-sm leading-relaxed">For less, {optionLine(result.lowerPricedAlternative)} would also hold your songs.</p>}
        {result.withinBudget === false && <p className="mt-4 font-medium">This is above the budget you selected. You can start with fewer memories or browse the experiences; there is no need to stretch your budget.</p>}
        <div className="mt-6">{result.option ? <button className={control} onClick={() => onChoose(result.productId, result.option?.sku)}>{product.cta}</button> : <Link className={control} to="/bespoke">{BESPOKE.cta}</Link>}</div>
        <p className="mt-5 text-sm leading-relaxed">Guidance is based on your choices and MCB’s published product rules. It is not a conversation with a person or a live AI service.</p>
      </div>}
      <div className="mt-6 flex flex-wrap gap-3">{stepIndex > 0 && <button className={control} onClick={() => move(stepIndex - 1)}>Back</button>}{step !== 'result' && <button className={`${control} font-semibold`} onClick={() => move(stepIndex + 1)}>{steps[stepIndex + 1] === 'result' ? 'See my suggestion' : 'Continue'}</button>}<button className="min-h-12 px-4 underline underline-offset-4" onClick={() => { setOpen(false); setStepIndex(0); }}>Browse without guidance</button></div>
    </>}
  </aside>;
}
