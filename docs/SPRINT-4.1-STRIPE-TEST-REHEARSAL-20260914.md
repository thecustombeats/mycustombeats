# Sprint 4.1 — Stripe TEST-mode rehearsal
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**STRIPE TEST MODE ONLY. NOT DEPLOYED. NO LIVE CHARGE. NO PRODUCTION MIGRATION. LIVE CHECKOUT OFF.**

## Set-up

- Stripe account `acct_1SwM9rCKnc2we3QU` ("Custom Beats · sandbox", GB, GBP). The TEST secret key (`~/mcb-stripe-test.php`, mode 600, outside any repository) and the Stripe CLI login belong to the same account — checked by account id only.
- The site and API were built from `bbf86e7b` and served locally on http://localhost:8080 with a fresh database. Both secrets reached PHP through read-only container mounts; neither was copied into the repository or the build, nor printed.
- Webhooks: `stripe listen --forward-to http://localhost:8080/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Its signing secret was captured to a 600 file without display; the log was redacted as written.
- Resend remained the local stub. TEST-mode confirmations went to `resend.test_recipient` (a rehearsal inbox), never to the address typed.
- Payments were made through the real `/create` UI in headless Chrome, on Stripe's hosted TEST Checkout, with Stripe's test cards.

## Defect found and fixed

**Stripe Adaptive Pricing offered local currency.** The first TEST session opened with "Choose currency: ₹2,015.96 / £15.00", INR preselected for a visitor in India. A session paid in INR reports `currency: inr`, which the webhook correctly refuses as payment of a GBP order — so overseas customers' orders would have gone to PAYMENT_REVIEW instead of PAID, and the site's "payment is taken in GBP" would have been untrue. `checkout/session.php` now sends `adaptive_pricing[enabled]=false`; the webhook's strict currency check is unchanged. Two acceptance assertions added. The stub could not have shown this.

## Transactions (TEST mode)

| | Moment £15 | 7-inch Keepsake (mobile) | 6-song Journey |
|---|---|---|---|
| MCB order | 3 | 4 | 5 |
| Personalisation | 1 memory | 1 memory + photo, Priority Replacement, GB address | 6 chapters, standard vinyl (1 disc, not a picture disc) |
| Stripe session | `cs_test_a17ndOTJa1yS8erThe7nTt8gJ3hkWs9BKyWIyWvuMwVFcwV5C7LwG9Ymww` | `cs_test_b1Q07ne9mc6t5Xb4SGBgbV20rX7H75QVzacQzehIyGMF2eyu38v20L2b7F` | `cs_test_a1WI5XGEwHWEO2u0HtmRr6SgcXNzyHwjuEYfPEwG9oEBelTBRyufz3FaY1` |
| Stripe says | complete · paid · gbp · livemode false · adaptive pricing off | complete · paid · gbp · subtotal 11899 + shipping 495 = 12394 | complete · paid · gbp · 19900 + 495 = 20395 |
| PaymentIntent | `pi_3UFciYCKnc2we3QU1JmGWyfo` succeeded, 1500 received | `pi_3UFcixCKnc2we3QU0NfgbJxZ` succeeded, 12394 received | `pi_3UFcjQCKnc2we3QU0SuNm1ZW` succeeded, 20395 received |
| Webhook | `evt_1UFciZCKnc2we3QUak2FQAfG` → 200 | `evt_1UFciyCKnc2we3QUMG1PDa3Q` → 200 | `evt_1UFcjjCKnc2we3QUYMcl2ng8` → 200 |
| MCB order after | PAID, test mode, `MCB-2026-000001` | PAID, test mode, `MCB-2026-000002` | PAID, test mode, `MCB-2026-000003` |
| Confirmation | `[TEST]` email to rehearsal inbox | same | same |
| Thank-you page | "Payment confirmed" + reference, verified from the server | same | same |

Delivery on orders 4 and 5 was the **TEST_ONLY** fixture ("TEST ONLY — UK delivery (not a real rate)", £4.95), shown by Stripe as shipping.

Journey, before success: the declined test card (4000 0000 0000 0002) was refused on Stripe's page; the order stayed PENDING with no reference, no payment event and no email. Pressing Back returned to MCB's "Your order is saved" panel; continuing reused the same session, which was then paid.

Webhook re-delivery: `stripe events resend evt_1UFciZCKnc2we3QUak2FQAfG` reached the server (200) and changed nothing — one reference, one ORDER.PAID event, no extra email, one processed-event row, nothing filed for review.

Audit trail on each paid order: ORDER.CREATED → (UPLOAD.ATTACHED) → PERSONALISATION.COMPLETE → CHECKOUT.SESSION_CREATED → PAYMENT.RECEIVED → ORDER.PAID → CUSTOMER.CONFIRMATION.DUE → CUSTOMER.CONFIRMATION.SENT. No console errors.

Evidence: `preview-output/sprint-4.1/` (screenshots and `stripe-test-mode-report.json`; local, not committed).

## For the Founder

- Stripe shows customers the account name **"Custom Beats"** (Dashboard → Settings → Public details). Confirm or change to "My Custom Beats".
- Stripe Checkout offers **Apple Pay, Link, Amazon Pay and Revolut Pay** in addition to cards, from the Dashboard's payment method settings. The webhook handles delayed methods; choose which to offer before launch.
- The rehearsal used the local Stripe CLI forwarder. A production launch still needs a live webhook endpoint registered in the Dashboard, its signing secret in server config, and `stripe.live_checkout_approved`.
