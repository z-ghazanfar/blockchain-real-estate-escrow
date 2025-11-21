# Transactify Escrow Bot

One-shot or long-lived automation for the marketplace contract. Finalizes ended auctions and settles/refunds escrow without manual keeper calls.

## Scripts
- `npm run once` — single sweep: iterates all listings, finalizes ended auctions, completes escrow if title moved, or refunds if past deadline.
- `npm run start` — long-lived bot: listens for events and polls pending escrows on an interval.

## Env
Create `.env` in this folder:
```
RPC_URL=wss://sepolia.gateway.tenderly.co/2iN1RFRS9IywHeIVSg5lfR
MARKETPLACE_ADDRESS=0x53Bfef2fb9BF8b9729dBB35e138dbb8aF20B59a2
AUTOMATION_PRIVATE_KEY=0x...
# Optional: POLL_INTERVAL_SECONDS=60 (for long-lived bot)
```
- Use any reachable Sepolia RPC (WSS preferred). The bot will auto-detect ws/http.

## How it works
- Finds ended auctions and calls `finalizeAuction`.
- For escrows, calls `previewEscrowAction` to decide `completeEscrow` vs `claimEscrowRefund`.
- Tracks listings using events when running long-lived; the one-shot just sweeps all ids and exits.

## Run
```
npm install
npm run once   # or: npm run start
```

Keep private keys secret; run this from a trusted host or scheduler.
