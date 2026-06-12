# RetroThriftCo Virtual Closet

A React + TypeScript + Vite + Firebase web app for managing resale inventory and
cross-platform listings, with a companion Chrome extension for marketplace
scraping and auth.

It tracks one inventory across **eBay (the anchor), Poshmark, Depop, Facebook
Marketplace, and Whatnot**, keeps real stock accurate as items sell on different
sites, surfaces what needs to be (de)listed, and rolls sales up into analytics.

## What it does

- **Unified import** — pull your active listings from each marketplace (via the
  extension) and match them to inventory.
- **Unified sales** — every sale across platforms in one chronological feed,
  marked by site.
- **Stock tools** (`/tools`) — reconciliation, delist queue, should-list, and
  last-sold widgets per platform, plus an eBay delist section for items whose
  real stock has hit 0.
- **Stock-accuracy model** — `real stock = eBay available qty − non-eBay sales`
  (Poshmark + Depop + in-person + Whatnot) since the calibrated baseline. When an
  item sells out on other sites, it's flagged to delist on eBay too.

## Structure

```
src/                  React app (pages, components, services, stores)
functions/            Firebase Cloud Functions (eBay/Depop/Poshmark APIs, sync,
                      matching, reconciliation)
depop-auth-extension/ Chrome MV3 extension — per-platform content scripts
                      (Depop / Poshmark / Facebook / Whatnot) + background worker
public/               Static assets
firebase.json, firestore.rules, firestore.indexes.json   Firebase config
```

## Tech stack

- React 18 + TypeScript (strict), Vite, Tailwind CSS
- Zustand (with immer) for state
- Firebase v9 modular SDK — Auth, Firestore, Hosting, Cloud Functions
- Firebase project: `closet-da8f2`

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Firebase + API config
npm run dev                  # local dev server
npm run build                # production build → dist/
```

Cloud Functions:

```bash
cd functions
npm install
npm run build
```

## Deploy

Hosting:

```bash
npx firebase-tools deploy --only hosting --project closet-da8f2
```

Functions:

```bash
npx firebase-tools deploy --only functions --project closet-da8f2
```

## Chrome extension

Load `depop-auth-extension/` as an unpacked extension (chrome://extensions →
Developer mode → Load unpacked). It captures listings and sold items from each
marketplace in your own logged-in session and syncs them to Firestore for the
app to import/match. Bump the `version` in `manifest.json` and reload after
changes.

## Notes

- Secrets (`.env*`, `.mcp.json`, service-account keys) and scraped data dumps are
  intentionally excluded from the repo — see `.gitignore`.
