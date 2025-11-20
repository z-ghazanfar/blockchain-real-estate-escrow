### Transactify Escrow Bot

This service automates escrow settlement for the marketplace contract. It
listens for `AuctionFinalized` events, tracks escrow windows, and automatically
calls `completeEscrow` when ownership has transferred or `claimEscrowRefund`
after the deadline expires.

---

#### Setup

```bash
cd automation
cp .env.example .env          # fill in RPC URL, marketplace address, bot key
npm install
npm run start
```

Environment variables:

- `RPC_URL` – Sepolia (or chosen network) JSON-RPC endpoint.
- `MARKETPLACE_ADDRESS` – deployed `TransactifyMarketplace` address.
- `AUTOMATION_PRIVATE_KEY` – wallet that submits automation txns (fund with gas).
- `POLL_INTERVAL_SECONDS` – optional; how often to poll outstanding escrows.

---

#### How it works

1. Subscribes to `AuctionFinalized` and adds the listing to an in-memory queue.
2. Periodically calls `previewEscrowAction(listingId)` to check whether title
   transfer has happened or the deadline expired.
3. Triggers `completeEscrow` or `claimEscrowRefund` accordingly, removing the
   listing from the queue once settled.
4. On startup it also scans existing listings and resumes automation for any
   previously pending escrows.

You can extend this bot with monitoring/alerting (Slack, PagerDuty) or run it in
a cron/PM2/Heroku worker so settlement is truly hands-off. The smart contract
still permits manual calls, so the bot is just an optional automation layer.
