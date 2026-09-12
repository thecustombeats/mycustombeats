import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
const load = async path => {
  const { outputFiles } = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
};
const { recommendMemory } = await load('src/lib/memoryConcierge.ts');
const { mayFallBackToPaymentLink } = await load('src/lib/checkoutSession.ts');
const { PACKAGES, isFixedPrice } = await load('src/data/packages.ts');
test('canonical GBP prices match founder authority', () => {
  assert.deepEqual(PACKAGES.filter(isFixedPrice).map(p => [p.id, p.price.gbp]), [['moment',10],['keepsake',99],['journey',199],['heirloom',349]]);
  assert.equal(PACKAGES.find(p => p.id === 'bespoke').price, undefined);
});
test('only a recorded digital Moment without extras may use the verified fallback', () => {
  const valid = { packageId: 'moment', formatId: 'mp3', orderId: 12, items: [] };
  assert.equal(mayFallBackToPaymentLink(valid), true);
  for (const orderId of [null, undefined, 0, -1, 1.5, NaN, Infinity]) assert.equal(mayFallBackToPaymentLink({...valid, orderId}), false);
  for (const packageId of ['keepsake','journey','heirloom','bespoke','unknown']) assert.equal(mayFallBackToPaymentLink({...valid, packageId}), false);
  assert.equal(mayFallBackToPaymentLink({...valid, formatId:'vinyl'}), false);
  assert.equal(mayFallBackToPaymentLink({...valid, items:[{id:'vinyl',quantity:1}]}), false);
});
test('guidance preserves scope and discloses budget mismatch', () => {
  assert.deepEqual(recommendMemory({intent:'collection',memories:4,budget:99}), {packageId:'journey', withinBudget:false, reason:'Your story has four memories. Each can have its own photo, story and music style.'});
  assert.equal(recommendMemory({intent:'collection',memories:6,budget:349}).packageId, 'heirloom');
  assert.equal(recommendMemory({intent:'song',memories:1,budget:349}).packageId, 'keepsake');
  assert.equal(recommendMemory({intent:'moment',memories:1,budget:349}).packageId, 'moment');
  assert.equal(recommendMemory({intent:'bespoke',memories:6,budget:349}).withinBudget, false);
});
