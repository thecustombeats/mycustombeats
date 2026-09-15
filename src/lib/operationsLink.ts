/**
 * Founder notification deep links: /operations#order=MCB-YYYY-NNNNNN&action=NAME.
 *
 * The fragment names an order and an action to OPEN after sign-in — never a
 * credential, and never an approval. Anything that is not exactly that shape
 * is ignored.
 */
/** Reads `#order=MCB-YYYY-NNNNNN&action=NAME` — nothing else is accepted. */
export const parseOperationsLink = (hash: string): { reference: string | null; action: string | null } => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const reference = params.get("order");
  const action = params.get("action");
  return {
    reference: reference && /^MCB-\d{4}-\d{6}$/.test(reference) ? reference : null,
    action: action && /^[A-Z_]{3,40}$/.test(action) ? action : null,
  };
};
