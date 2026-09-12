import { PACKAGES, isFixedPrice } from '../data/packages';
import type { PackageId } from '../data/packages';

export type MemoryIntent = 'moment' | 'song' | 'collection' | 'bespoke';
export interface ConciergeAnswers {
  intent: MemoryIntent;
  memories: 1 | 4 | 6;
  budget: number | null;
}
export interface ConciergeRecommendation {
  packageId: PackageId;
  reason: string;
  withinBudget: boolean;
}

/** Pure, auditable guidance. No personal stories, remote AI or tracking.
 * Budget never silently reduces the number of memories a customer requested.
 */
export function recommendMemory(a: ConciergeAnswers): ConciergeRecommendation {
  const packageId: PackageId = a.intent === 'bespoke' ? 'bespoke'
    : a.intent === 'moment' ? 'moment'
    : a.intent === 'song' ? 'keepsake'
    : a.memories === 6 ? 'heirloom' : a.memories === 4 ? 'journey' : 'keepsake';
  const pkg = PACKAGES.find(p => p.id === packageId)!;
  const withinBudget = a.budget === null || (isFixedPrice(pkg) && pkg.price.gbp <= a.budget);
  const reasons: Record<PackageId, string> = {
    moment: 'You want to capture one beautiful moment with the most accessible MCB experience.',
    keepsake: 'You want one fully personalised song to preserve a meaningful memory.',
    journey: 'Your story has four memories. Each can have its own photo, story and music style.',
    heirloom: 'Your story has six memories, each with its own photo, story and music style.',
    bespoke: 'Your idea needs a personal conversation and an individually agreed scope and price.',
  };
  return { packageId, withinBudget, reason: reasons[packageId] };
}
