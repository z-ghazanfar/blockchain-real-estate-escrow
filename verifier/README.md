### Transactify Property Verifier

This folder contains a real verifier/oracle service that listens for
`VerificationRequested` events from the `TitleRegistry` contract and writes
back `recordVerificationResult` after it probes live data sources (US Census
geocoding API + optional municipal datasets). Perfect for demoing the
verification pipeline during class.

---

#### Files

- `core.js` – Shared functions (address parsing, Census lookup, mock dataset
  handling). We split this out so it can be unit tested.
- `propertyVerifier.js` – Runtime script built on `ethers` + `dotenv`. Watches
  the contract and calls into `core.js`.
- `mock-properties.json` – Optional overrides for addresses you already
  verified or need to force-approve (e.g., local county dataset dumps).
- `.env.example` – Template for the environment variables.
- `propertyVerifier.test.js` – Node test suite hitting the core logic (no RPC
  or external network required thanks to mocks).

---

#### Setup

```bash
cd verifier
cp .env.example .env      # fill RPC + contract address + verifier key
npm install               # installs ethers + dotenv (see package.json)
npm test                  # optional - run mocked verifier tests
npm run start             # or: node propertyVerifier.js
```

The service will:

1. Connect to the RPC endpoint in `.env`.
2. Watch the deployed `TitleRegistry` for `VerificationRequested`.
3. Try to match the property ID in `mock-properties.json`. If no hit, it
   transforms the ID (e.g., `123-MAIN-ST-NY`) into a one-line address and calls
   the public US Census geocoding API. A match there confirms the address exists
   and produces an evidence URL. If both fail, it attempts to reach the seller’s
   metadata URI as a last resort.
4. Call `recordVerificationResult` with a boolean and an evidence URI derived
   from the successful lookup (Census URL, municipal portal, etc.).

You can extend `lookupProperty` with additional APIs or county scrapers. The
important part is that this service signs verification results from the vetted
verifier wallet address you pass into the `TitleRegistry` constructor.
