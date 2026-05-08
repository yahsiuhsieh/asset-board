# Codex Personal Preferences

This file captures my working style and product preferences so future Codex sessions can make better default decisions.

## Communication Style

- Use Traditional Chinese for discussion unless code, UI copy, or technical names are clearer in English.
- Be direct and pragmatic. Give clear recommendations, tradeoffs, and priority order.
- When I ask "what should we do next?", answer from a product and asset-management usefulness perspective, not only from engineering convenience.
- If something is unnecessary for the MVP, say so clearly.
- Avoid broad, unrelated UI polish unless I explicitly ask for polish. When a task touches UI, make the affected UI visually polished, consistent, and pleasant to use.

## Engineering Preferences

- Inspect the existing codebase before proposing or changing implementation.
- Prefer the simplest maintainable solution.
- Do not add a new Supabase table when one or two columns on an existing table can reasonably solve the problem.
- Do not over-abstract early. Add abstractions only when they reduce real complexity or match an existing pattern.
- Do not revert unrelated changes.
- Do not start `npm run dev` unless I explicitly ask. I prefer to run the dev server manually.
- After meaningful code changes, run:
  - `npm run lint`
  - `npm run build`

## Supabase / Data Model Preferences

- Keep the schema simple and easy to understand.
- Use new cleanup migrations instead of editing migrations that may already have been run.
- Remove obsolete schema and UI together. If a feature is removed from the product, clean up related types, actions, queries, and Supabase fields/tables.
- Prefer transaction-ledger data over manual estimates when bank transactions are available.
- Keep raw/vendor/internal metadata out of customer-facing UI unless it is legally or operationally necessary.

## WealthVibe Product Direction

- WealthVibe is a practical real estate asset-management MVP, not a marketing site.
- The property page should feel like a performance dashboard:
  - key metrics first
  - charts before workflow forms
  - monthly review for rent and expenses
  - setup/admin tools tucked into small icons or modals
- Avoid large setup boxes once the setup is done, especially for bank connections.
- Keep customer-facing valuation generic, such as "Property Valuation" or "Current Value"; do not foreground vendor names like RentCast unless required.

## Real Estate Feature Priorities

- Highest-value areas:
  - rent collection tracking
  - expense transaction classification
  - monthly and YTD performance metrics
  - clean annual export for tax/accounting review
  - portfolio-level rollups after property-level workflows are stable
- Prefer actual bank transaction data over scheduled expense estimates.
- YTD metrics should use actual recorded transactions and be easy to explain.
- If a metric name implies YTD, calculate it consistently as year-to-date total divided by elapsed months.

## External API Preferences

- Be careful with limited API quotas, especially RentCast free-plan calls.
- In development and testing, prefer mock providers or cached/stored values when possible.
- Do not consume live API calls just to test UI behavior unless I explicitly approve it.
- Plaid is the preferred bank connection provider. Do not add other bank-link integrations unless explicitly requested.

## UI Preferences

- Any UI design or UI implementation must consider aesthetics, not only functionality.
- Dense, quiet, operational UI is preferred over decorative layouts.
- Use charts when they help understand performance, but avoid redundant charts.
- Use dropdowns/details for long transaction lists so the page stays scannable.
- Use icons for secondary setup/admin actions when the action is not central to daily use.
- Keep labels explicit when destructive actions are involved, e.g. "Delete Property" instead of just "Delete".

## Export Preference

- A useful next reporting feature is annual CSV export for rent and expense transactions.
- Start with CSV before PDF or Excel.
- Export should support tax/accounting review and include date, type, category, description, account, amount, property, and memo when available.
