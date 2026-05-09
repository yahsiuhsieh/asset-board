# Plaid Production And Cost Safety Checklist

Last reviewed: 2026-05-09

## Goal

Keep WealthVibe's Plaid integration useful for real estate monthly review while minimizing paid or limited Plaid usage. The current MVP should stay manual-first: users connect accounts, explicitly run Check & Sync, and explicitly find monthly rent or expense transactions.

Official references:

- [Plaid pricing and billing](https://plaid.com/docs/account/billing/)
- [Plaid Transactions overview](https://plaid.com/docs/transactions/)
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/)
- [Plaid Items API](https://plaid.com/docs/api/items/)
- [Plaid OAuth guide](https://plaid.com/docs/link/oauth/)

## Current Integration Shape

| Workflow | User trigger | Plaid endpoints | Cost posture |
| --- | --- | --- | --- |
| Add Accounts | User clicks Add Accounts and completes Link | `/link/token/create`, `/item/public_token/exchange`, `/accounts/get` | Creates a Transactions-enabled Item. This is the main production billing exposure. |
| Reconnect | User clicks Reconnect on a disconnected account | `/link/token/create` in update mode | Repairs an existing Item. It does not add a new product in current code. |
| Check & Sync | User clicks Check & Sync | `/item/get`, `/transactions/get` | Manual only. Checks connection health, then scans posted transactions from the last 60 days. |
| Find Rent Income / Find Transactions | User clicks the monthly review controls | `/transactions/get` | Manual month-level lookup for the selected review period. |
| Close Month | User clicks Close Status | `/transactions/get` through the existing monthly review flow | Final review gate. It can surface unclassified transactions again if the user removed instead of ignored them. |
| Remove Bank Connection | User clicks Remove for a connected account | `/item/remove` only when removing the last local account for that Plaid Item | Important offboarding step. For subscription products, Plaid documents `/item/remove` as required to end subscription billing for an Item unless the user revoked permission elsewhere. |

## Current Cost Guards In Code

- Development defaults to `BANK_TRANSACTION_PROVIDER=mock`.
- Production rejects the `mock` transaction provider.
- No webhook endpoint is implemented.
- No background or scheduled Plaid sync is implemented.
- No tests call live Plaid APIs.
- `Check & Sync` scans only the last 60 days.
- Initial Link requests only the Transactions product.
- Update mode does not request additional products.
- Pending transactions are skipped before entering the ledger.
- Duplicate detection reduces duplicate ledger rows after reconnects where Plaid transaction IDs may change.
- Removing the last locally tracked account for a Plaid Item calls `/item/remove`.

## Endpoints To Avoid Unless Explicitly Approved

Do not add these for the MVP without a product and cost review:

- `/transactions/refresh`: Plaid documents this as an optional add-on for on-demand extraction.
- `/accounts/balance/get`: Plaid distinguishes this from free cached balances returned by `/accounts/get`.
- Identity, Auth, Transfer, Assets, Income, Liabilities, Investments, Statements, Signal, and Enrich product endpoints.
- Scheduled polling or background sync.
- Webhook-triggered sync, unless the product needs freshness more than cost minimization.

## Production Before Connecting A Real Chase Account

Do not connect a real Chase account until all stabilization gates pass:

- Local verification passes: lint, build, and every real estate test script.
- Sandbox smoke test passes for Add Accounts, Check & Sync, monthly review, and annual CSV export.
- Plaid Dashboard plan is confirmed before switching `PLAID_ENV=production`.
- Production redirect URI is configured in the Plaid Dashboard.
- The first production test property and one required Chase account are chosen ahead of time.

For the first Chase test:

1. Set `PLAID_ENV=production` and use the Production `PLAID_SECRET`.
2. Confirm the app is using `BANK_TRANSACTION_PROVIDER=plaid`.
3. Connect only one Chase account. Do not select unrelated personal accounts.
4. Run one manual Check & Sync.
5. Review rent income and expense transactions for one month.
6. Ignore normal non-expense transactions; record only true property expenses.
7. Close the month and confirm the status stays ready or closed as expected.
8. Export the annual CSV and confirm rent and expense rows are present.
9. Check the Plaid Dashboard usage page after the test.
10. If the account should not remain connected, remove it in WealthVibe so the app calls `/item/remove`.

Remember that Plaid Trial plan limits, if applicable to the team, are Item-count based. Plaid documents that removing Trial Items does not restore the Trial Item limit.

## Stabilization Commands

Run these before the first real Chase connection:

```bash
npm run lint
npm run build
npm run test:real-estate-provider-containment
npm run test:real-estate-monthly-review
npm run test:real-estate-quality
npm run test:real-estate-export
npm run test:real-estate-statement
npm run test:real-estate-history
```

Also confirm that active app code does not include high-cost or non-MVP Plaid calls:

```bash
rg -n "transactions/refresh|accounts/balance|getIdentity|identityGet|authGet|assetReport|transfer" app components lib scripts
```

## Operational Rules For Users

- Use Ignore for normal bank transactions that are not rental-property expenses.
- Use Remove only for cleanup mistakes. Removed transactions can return on Find Transactions or Close Month if they still exist at Plaid.
- Use Check & Sync manually when freshness matters, such as before monthly close or annual export.
- Do not rely on Check & Sync as a real-time account monitor.

## Environment Checklist

Local development:

```env
BANK_TRANSACTION_PROVIDER=mock
PLAID_ENV=sandbox
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=http://localhost:3000/real-estate/plaid/oauth
PLAID_TRANSACTIONS_DAYS_REQUESTED=365
```

Production:

```env
BANK_TRANSACTION_PROVIDER=plaid
PLAID_ENV=production
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_COUNTRY_CODES=US
PLAID_REDIRECT_URI=https://your-domain.com/real-estate/plaid/oauth
PLAID_TRANSACTIONS_DAYS_REQUESTED=365
```

## Maintenance Review

Before adding any Plaid feature, answer these questions in the pull request:

1. Which Plaid product or endpoint is being added?
2. Is it free, subscription-based, per-request, or plan-dependent under the current Plaid agreement?
3. Can the workflow stay manual instead of background-triggered?
4. Can stored data satisfy the product need instead of another Plaid API call?
5. Does the change expose any vendor metadata or tokens to customer-facing UI?
