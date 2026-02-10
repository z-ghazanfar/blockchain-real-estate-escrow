# Transactify
<img width="3248" height="2124" alt="CleanShot 2026-02-10 at 15 53 20@2x" src="https://github.com/user-attachments/assets/8cc12974-2c7b-42fa-88b3-9dddeba9263a" />
A smart-contract powered marketplace for real estate with title verification, trustless auctions, escrow automation, and agent commissions. Built for the Sepolia testnet with a simple frontend and optional off-chain automation.

## What it does
- **Title verification**: Sellers register properties; a verifier/oracle confirms real-world addresses and marks them verified on-chain.
<img width="3248" height="2124" alt="CleanShot 2026-02-10 at 15 54 25@2x" src="https://github.com/user-attachments/assets/b7dff872-2e7f-43fd-9aa1-47f276202201" />
- **Auctions & escrow**: Owners list verified properties. Bids lock funds until the auction ends; escrow settles only after title transfers.
<img width="3248" height="2124" alt="CleanShot 2026-02-10 at 15 54 22@2x" src="https://github.com/user-attachments/assets/479a8a75-d457-4dcd-925d-6eae72975406" />
- **Agent commissions**: Sellers can tag an agent on a listing; commissions accrue automatically on settlement and agents withdraw custodially from the AgentCommission contract.
<img width="3248" height="2124" alt="CleanShot 2026-02-10 at 15 56 35@2x" src="https://github.com/user-attachments/assets/dd5a03c8-b93b-432b-bf29-6c98c67b75ff" />
- **Automation**: Optional bots handle verification responses and escrow finalization, so users don’t need to manually call keepers.

## Contracts
- `TitleRegistry.sol` — stores property ownership + verification status, emits requests for off-chain verification.
- `TransactifyMarketplace.sol` — English auctions with buy-now option, anti-sniping, timed escrow, pending returns for outbid bidders.
- `AgentCommission.sol` — basis-point commission vault where agents withdraw their earnings.

## Frontend
- `index.html` — marketing/overview.
- `marketplace.html` — public view of live/settled listings from Sepolia.
- `dashboard.html` — dApp to register properties, list, bid, transfer title, and withdraw commissions. Marketplace listings support agent assignment.

## Automation
- `verifier/`: listens for `VerificationRequested` events and calls `recordVerificationResult`. Use `npm run start` (long-lived) or `npm run once` (single sweep). Env: `RPC_URL`, `TITLE_REGISTRY_ADDRESS`, `VERIFIER_PRIVATE_KEY`.
- `automation/`: escrow bot to finalize ended auctions and reconcile escrows. Use `npm run start` (long-lived) or `npm run once` (single sweep). Env: `RPC_URL`, `MARKETPLACE_ADDRESS`, `AUTOMATION_PRIVATE_KEY`.

## Deploying
- Hardhat scripts in `scripts/`:
  - `deployRegistry.js` — deploys TitleRegistry (needs `VERIFIER_ADDRESS`).
  - `de<img width="3248" height="2124" alt="CleanShot 2026-02-10 at 15 54 33@2x" src="https://github.com/user-attachments/assets/552f6d31-ce25-413b-a80a-5d349f4ad51e" />
ployMarketplace.js` — deploys marketplace (needs registry + agent commission addresses).
- Env for Hardhat: `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `TITLE_REGISTRY_ADDRESS`, `AGENT_COMMISSION_ADDRESS`, plus optional timing params.

## Running locally
- Install deps: `npm install`
- Frontend: open `index.html`, `marketplace.html`, or `dashboard.html` in a browser (uses configured contract addresses and RPC in code/env).
- Verifier: `cd verifier && npm install && npm run once` (or `npm run start`).
- Escrow bot: `cd automation && npm install && npm run once` (or `npm run start`).

## Current addresses (Sepolia)
- TitleRegistry: `0x375292e685BAa1e3160a2b99aaeb2F3AAf6BF541`
- TransactifyMarketplace: `0x53Bfef2fb9BF8b9729dBB35e138dbb8aF20B59a2`
- AgentCommission: `0xd2134C54971114178fD737fBec3d10412058E4ea`
- RPC (sample used): `wss://sepolia.gateway.tenderly.co/2iN1RFRS9IywHeIVSg5lfR`

## Notes
- Marketplace now enforces a single active listing per property ID; ended/cancelled/settled listings clear the slot.
- UI keeper automation is disabled by default; rely on the escrow bot or one-shot sweeps to finalize/refund.
- Address normalization is used for seller/agent checks; set an agent when creating a listing to exercise commission payouts.
