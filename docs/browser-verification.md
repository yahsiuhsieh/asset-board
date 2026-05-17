# Browser Verification

WealthVibe has a small Playwright smoke suite for browser and mobile checks. The suite uses `WEALTHVIBE_E2E_FIXTURES=1`, which serves deterministic real estate fixture data from the app server instead of Supabase, Plaid, RentCast, or Mapbox.

## Commands

Install the test dependency and Chromium once:

```bash
npm install
npx playwright install chromium
```

Run the smoke suite:

```bash
npm run test:e2e
```

Debug visually:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

Run the full browser verification gate:

```bash
npm run verify:browser
```

By default Playwright starts the app at `http://127.0.0.1:3100` with fixture mode enabled. To test against an existing server, start it with the same fixture environment and pass `PLAYWRIGHT_BASE_URL`:

```bash
WEALTHVIBE_E2E_FIXTURES=1 PROPERTY_VALUATION_PROVIDER=mock BANK_TRANSACTION_PROVIDER=mock npm run dev -- --hostname 127.0.0.1 --port 3100
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
```

## Manual Checklist

- Desktop portfolio: open `/real-estate?annualReportYear=2026`, verify metrics, property cards, report actions, and no horizontal page overflow.
- Mobile portfolio: repeat the same route using a narrow viewport, then open and close the sidebar.
- Property detail: open Cedar Park Duplex, verify key metrics, performance trends, monthly review, financial details, location, and photo sections.
- Annual report: open `/real-estate/annual-report?year=2026`, verify the report preview and download the CSV.
- Rules: open `/real-estate/rules`, verify the create form and existing fixture rules render without submitting actions.

## Fixture Safety

- `WEALTHVIBE_E2E_FIXTURES=1` is guarded and throws in production.
- The fixture data uses `provider: "plaid"` ledger rows so annual report quality checks do not fail on mock ledger blockers.
- The fixture uses null coordinates and null signed photo URLs to avoid live Mapbox or Supabase Storage requests during browser tests.
