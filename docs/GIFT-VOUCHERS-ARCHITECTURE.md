# Gift vouchers and MCB Account Credit — architecture (not activated)

Sprint 5 · 14 September 2026 · **Design only. Nothing here is built or switched on.** The catalogue product `gift-voucher` stays `active: false`, has no SKU that can be ordered, and no page sells it.

## Rules already fixed in the catalogue (`src/data/catalogue/products.ts`, `storedValue`)

| Rule | Value |
|---|---|
| Currency | GBP only |
| Minimum value | £10 (1000 pence) |
| Partial redemption | Yes |
| Remaining balance kept | Yes |
| Reloadable (top-ups) | Yes |
| Can be bought as a gift | Yes |
| Reference | unique, 10 digits |
| Cash redemption | **No** |

## Data model (proposed)

```
stored_value_accounts
  id, reference CHAR(10) UNIQUE      -- random, not sequential; check digit recommended
  kind ENUM('GIFT_VOUCHER','ACCOUNT_CREDIT')
  currency CHAR(3) = 'GBP'
  status ENUM('ACTIVE','SUSPENDED','CLOSED')
  purchaser_customer_id NULL, holder_customer_id NULL
  expires_at NULL                    -- only if a period is legally approved
  created_at

stored_value_ledger                  -- append-only; balance = SUM(amount_minor)
  id, account_id
  entry_type ENUM('ISSUE','TOP_UP','REDEEM','REVERSE_REDEEM','ADJUSTMENT','EXPIRE')
  amount_minor INT                   -- positive credits, negative debits
  order_id NULL, stripe_payment_intent NULL
  actor VARCHAR(160), reason VARCHAR(160)
  idempotency_key UNIQUE
  created_at
```

The balance is never a stored number that can drift: it is the sum of the ledger. Every movement is an insert with an idempotency key.

## Flows (proposed)

1. **Purchase / top-up** — a normal Stripe Checkout for a GBP amount ≥ £10. Only the signature-verified webhook writes `ISSUE` or `TOP_UP`, inside the paid transaction, exactly as orders are paid today.
2. **Redemption** — at checkout the customer enters the reference (rate-limited, uniform "not found" answers to prevent enumeration). The server locks the account, computes `min(balance, order total)`, writes `REDEEM` against the order in the same transaction that reserves it, and charges only the remainder through Stripe. A £0 remainder completes without Stripe.
3. **Abandoned or failed checkout** — `REVERSE_REDEEM` releases the reservation.
4. **Refund of an order paid partly with credit** — credit goes back to the account as `REVERSE_REDEEM`; the card portion is refunded to the card. **Never cash** for the credit portion.
5. **Adjustments** — staff only, with reason, audited.

## What must be decided before activation (not assumed here)

- Whether vouchers expire, and for how long (consumer-law advice required).
- Terms and privacy wording; how vouchers are delivered to recipients.
- Accounting treatment of unredeemed balances.
- Whether Account Credit and Gift Vouchers share one ledger or two products.

## Guard rails for whoever builds it

- Never activate the catalogue product without the flows above and their tests.
- No balance in the browser is trusted; the server recomputes every time.
- No cash-out path; no transfer between accounts without a staff adjustment.
- References are unguessable and lookups are rate-limited.
