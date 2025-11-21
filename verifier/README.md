# Transactify Property Verifier

Off-chain service that listens for `VerificationRequested` and writes back `recordVerificationResult` after a real-world address check.

## Scripts
- `npm run once` — one sweep of recent requests; exits when done.
- `npm run start` — long-lived listener (uses WSS/HTTP RPC depending on `RPC_URL`).

## Env
Create `.env` in this folder:
```
RPC_URL=wss://sepolia.gateway.tenderly.co/2iN1RFRS9IywHeIVSg5lfR
TITLE_REGISTRY_ADDRESS=0x375292e685BAa1e3160a2b99aaeb2F3AAf6BF541
VERIFIER_PRIVATE_KEY=0x...
# Optional: VERIFIER_POLL_INTERVAL_MS=60000 (used for HTTP polling or one-shot)
# Optional: VERIFIER_START_BLOCK=<block number> (one-shot start point)
```
Use a reachable Sepolia RPC; WSS avoids HTTP filter polling.

## How it works
- On each request, builds a one-line address and checks Census (see `core.js` for the lookup logic).
- Writes `recordVerificationResult(propertyId, exists, evidenceURI)`.
- One-shot mode tracks the last processed block in `.lastBlock.json`.

## Run
```
npm install
npm run once   # or: npm run start
```

Keep the verifier key secure; run from trusted infra.
