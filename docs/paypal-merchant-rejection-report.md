# Sandbox merchant rejection — read-only diagnosis

Session: **2026-10-27**. Diagnostic observation timestamp:
**2026-10-26T23:43:22.462Z** (UTC reported by the runtime).

## Finding and safest next action

**Root cause remains undetermined.** The buyer-facing message suggests seller
eligibility or receiving restrictions, but no matching API issue code proves it.
The existing order now returns **404 `RESOURCE_NOT_FOUND` /
`INVALID_RESOURCE_ID`**. Stop payment attempts and inspect the existing Sandbox
Business account/app in the Developer Dashboard; escalate the missing order and
merchant rejection to PayPal with the debug ID below. Preserve the reservation.

No replacement order, capture, cancellation, reconciliation write, reservation
release, account/configuration change or financial-record change was performed.

## Fresh evidence versus historical evidence

| Check                                                                       | Result                                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Existing order                                                              | `9N317079B4816951W`                                                                                                  |
| Existing mandate                                                            | `8fb8ada6-ad12-5bc8-ac4c-90e6a07ed064`                                                                               |
| Existing `npm run paypal:test:status`                                       | Failed: `PAYPAL_REQUEST_REJECTED`; no fresh success artifact written                                                 |
| OAuth for configured Sandbox REST app                                       | HTTP 200; credentials/token not printed                                                                              |
| `GET https://api-m.sandbox.paypal.com/v2/checkout/orders/9N317079B4816951W` | HTTP 404, `RESOURCE_NOT_FOUND`, `INVALID_RESOURCE_ID`                                                                |
| GET `PayPal-Debug-Id`                                                       | `f341254500bcc`                                                                                                      |
| Current PayPal order status / purchase units / payee / approval links       | Unavailable because GET returned an error, not an order representation                                               |
| Last successful prior GET                                                   | `PAYER_ACTION_REQUIRED`, 6.00 USD, matching configured seller and attempt references; historical only                |
| Saved app-client-ID/merchant binding                                        | Matches the current configuration                                                                                    |
| Saved attempt merchant                                                      | Matches current `PAYPAL_MERCHANT_ID`                                                                                 |
| Saved approval URL                                                          | Official `https://www.sandbox.paypal.com/checkoutnow`, token equals existing order ID, no embedded credentials       |
| Local state                                                                 | `AWAITING_APPROVAL` / `RESERVED`; last remote observation `PAYER_ACTION_REQUIRED`; no error/capture ID               |
| Local accounting                                                            | USD cap1000 / request600 / held600 / consumed0 / available400 minor units                                            |
| Local mandate                                                               | `ACTIVE`, time expiry `2026-10-27T17:37:03.522Z`, not time-expired at diagnostic observation                         |
| Preservation check                                                          | Before/after financial rows, merchant policy, idempotency records, audit records and saved owner-auth file unchanged |
| Existing idempotency/audit counts                                           | Two / four                                                                                                           |

The current remote status **cannot be classified as approved, voided, completed or
still awaiting approval** from a 404. Expiry is plausible: the attempt was created
at `2026-10-26T17:37:07.025592Z`, approximately six hours before diagnosis. PayPal
documents a default three-hour order window and possible account-specific
extensions. That guidance does not establish this `PAYER_ACTION_REQUIRED` order's
actual expiry or prove that expiry caused the earlier merchant message. No
terminal-state or release decision was inferred from the error.

The actual credential-owned default seller matched `PAYPAL_MERCHANT_ID` on the
previous successful order reads; the current app/merchant binding still matches.
This supports seller routing consistency. **The Dashboard's linked Business
account, country, verification, receiving eligibility and restrictions cannot be
independently inspected with these client-credentials order reads.** OAuth success
alone does not verify any of those properties. A manual Dashboard check remains.

## Request construction and log review

- `web/src/server/paypal/client.ts`: `CAPTURE` intent, one purchase unit, exact
  `USD` / `6.00`, stable request ID and attempt reference/custom/invoice IDs.
- `web/src/server/paypal/test-config.ts`: `credentialSellerOnly=true`; the request
  omits `payee`, allowing the REST app's default seller rather than routing to an
  arbitrary merchant. The returned seller is validated against configuration.
- `payment_source.paypal.experience_context` supplies fixed loopback return/cancel
  URLs, `NO_SHIPPING`, `PAY_NOW`. This is a documented PayPal wallet redirect flow;
  no card-processing, vaulting, recurring, merchant-initiated, alternative payment
  source, platform fee or auto-capture instruction is supplied. No buyer identity,
  country, locale, currency conversion or regional override is injected.
- `web/src/server/paypal/service.ts` accepts the API-provided `approve` or
  `payer-action` link only on the official Sandbox origin with the expected token.
  The saved URL passed these checks. Its current usability is not established by
  its syntax or a historical successful GET.
- No incompatible payload setting was identified. USD is supported generally;
  this does not establish that this seller can receive USD or that the actual
  buyer/seller countries permit this transaction. Account countries are unknown.
- Sanitized `.tools/paypal-test-server.log` scan found no matching PayPal error
  codes/debug IDs. Existing client code discards error bodies and does not retain
  `PayPal-Debug-Id`; the original browser-side merchant rejection is not in local
  server logs. The diagnostic captured the fresh GET error/header in memory,
  without changing the payment client. No browser HAR or PayPal-hosted session log
  was available; do not equate the GET debug ID with the original checkout error.

## Specific manual Dashboard checks

1. **Developer Dashboard → Apps & Credentials → Sandbox → the existing REST app**:
   compare its client ID locally with `PAYPAL_CLIENT_ID`, then inspect the linked
   Sandbox account. Confirm it is the intended **Business** seller, not the buyer
   or a Live app. Do not paste credentials into reports/chat.
2. **Testing Tools → Sandbox Accounts → that Business account → View/Edit**:
   verify account type/country, provisioning status, confirmed email and verified
   status where exposed. Sign into that account at `www.sandbox.paypal.com`; check
   Business information's merchant ID equals `PAYPAL_MERCHANT_ID`, notifications,
   account limitations/Resolution Center and unfinished setup. Resolve actual
   Sandbox account restrictions/provisioning issues; ask PayPal support if the
   test account cannot be repaired. Creating orders is not a test for eligibility.
3. **Seller payment-receiving preferences and currency balances**: confirm USD
   receipts/conversion are allowed and foreign-currency, cross-border or payer
   restrictions do not block this specific buyer. Check app PayPal-payment
   capabilities where exposed. Country-specific domestic/cross-border rules must
   be evaluated against the actual seller and buyer countries. Do not falsify
   country fields or change the existing USD mandate to bypass restrictions.
4. **Separate Sandbox Personal buyer**: confirm it is distinct from the seller,
   active/unrestricted and has a usable Sandbox funding source. Check its country
   against seller receiving rules. Use a separate/private browser context to avoid
   a cached seller/Live login; pause actual approval attempts while the order is
   unavailable. No buyer password or payment details belong in this repository.
5. **Dashboard Sandbox API Calls / app logs, if available**: find the original
   create/get calls and the browser-attempt time. Save sanitized HTTP status,
   `name`, `details[].issue`, `PayPal-Debug-Id` and UTC time. Ask PayPal Developer
   Support whether the existing order expired and why this seller was rejected;
   supply order ID and GET debug ID `f341254500bcc` plus the error screenshot with
   personal information removed. Original checkout support IDs, if shown, are
   preferable for diagnosing that distinct hosted-checkout failure.

**Changes needed:** no proven application/configuration fix yet. Correct only a
confirmed Sandbox seller/account capability or receiving restriction first. If
the Dashboard reveals an app/merchant mismatch, plan a separately authorized
configuration/policy change; do not overwrite this mandate's immutable merchant
or rotate the saved owner. If PayPal confirms order expiry, a replacement intent
and disposition of the old reservation require explicit user authorization and
trusted resolution evidence. A missing webhook ID does not cause this manual
approval rejection; do not invent one. No Live switch or approval bypass is needed.

## Reproduction and verification

```powershell
# Existing authoritative read (currently fails with the sanitized rejection):
npm run paypal:test:status

# Safe fixed-order diagnostic, no financial POST and no database writes:
node --conditions=react-server --import tsx scripts/paypal-merchant-diagnose.ts
```

The diagnostic allows only Sandbox OAuth POST and this order's GET, uses read-only
database transactions with rollback, and outputs allowlisted metadata rather than
raw credentials, customer data or full approval links. Application execution and
accounting logic were not changed. Verification results are recorded in the active
handoff; earlier full test totals are historical, not rerun for this diagnosis.

References: [Orders errors](https://developer.paypal.com/api/rest/reference/orders/v2/errors/),
[Checkout flow and order window](https://developer.paypal.com/api/rest/integration/orders-api/api-use-cases/standard/),
[Sandbox account management](https://developer.paypal.com/tools/sandbox/accounts/).
