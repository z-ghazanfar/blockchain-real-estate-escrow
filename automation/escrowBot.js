import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const REQUIRED = ["RPC_URL", "MARKETPLACE_ADDRESS", "AUTOMATION_PRIVATE_KEY"];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`Missing env var ${key}`);
    process.exit(1);
  }
}

function loadAbi() {
  const artifactPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../artifacts/contracts/TransactifyMarketplace.sol/TransactifyMarketplace.json"
  );
  try {
    const raw = fs.readFileSync(artifactPath, "utf8");
    return JSON.parse(raw).abi;
  } catch (_) {
    return [
      "event AuctionFinalized(uint256 indexed listingId, address highestBidder, uint256 amount)",
      "event EscrowCompleted(uint256 indexed listingId, address buyer, uint256 amount)",
      "event EscrowRefunded(uint256 indexed listingId, address buyer, uint256 amount)",
      "function previewEscrowAction(uint256) external view returns (bool canRelease, bool canRefund, uint256 timeRemaining)",
      "function completeEscrow(uint256 listingId) external",
      "function claimEscrowRefund(uint256 listingId) external",
      "function getListing(uint256) external view returns(string,address,address,uint64,uint64,uint64,uint128,uint128,uint128,uint256,address,uint8,bool)",
      "function totalListings() external view returns(uint256)"
    ];
  }
}

const marketplaceAbi = loadAbi();

const rpcUrl = process.env.RPC_URL;
const provider = rpcUrl.startsWith("ws")
  ? new ethers.WebSocketProvider(rpcUrl)
  : new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(process.env.AUTOMATION_PRIVATE_KEY, provider);
const marketplace = new ethers.Contract(
  process.env.MARKETPLACE_ADDRESS,
  marketplaceAbi,
  wallet
);

const trackedListings = new Map();
const POLL_INTERVAL =
  Number(process.env.POLL_INTERVAL_SECONDS || "60") * 1000;

function trackListing(id) {
  if (!trackedListings.has(id)) {
    trackedListings.set(id, { lastAction: Date.now() });
    console.log(`📌 Tracking listing #${id} for escrow automation`);
  }
}

async function evaluateListing(id) {
  try {
    const [canRelease, canRefund, timeRemaining] =
      await marketplace.previewEscrowAction(id);
    if (!canRelease && !canRefund) {
      return;
    }
    if (canRelease) {
      console.log(`🔁 Triggering completeEscrow for listing #${id}`);
      const tx = await marketplace.completeEscrow(id);
      await tx.wait();
      console.log(`✅ Escrow completed for listing #${id}`);
      trackedListings.delete(id);
      return;
    }
    if (canRefund) {
      console.log(`🔁 Triggering claimEscrowRefund for listing #${id}`);
      const tx = await marketplace.claimEscrowRefund(id);
      await tx.wait();
      console.log(`💸 Escrow refunded for listing #${id}`);
      trackedListings.delete(id);
      return;
    }
  } catch (err) {
    console.error(`⚠️  Automation failed for listing #${id}: ${err.message}`);
  }
}

async function finalizeEndedAuctions() {
  const total = Number(await marketplace.totalListings());
  const now = Math.floor(Date.now() / 1000);
  for (let id = 1; id <= total; id++) {
    try {
      const listing = await marketplace.getListing(id);
      const state = Number(listing[11]); // EscrowState
      const exists = Boolean(listing[12]);
      if (!exists) continue;
      const biddingEnd = Number(listing[3]);
      if (state === 0 && now > biddingEnd) {
        console.log(`⏳ Finalizing auction #${id} (ended)`);
        const tx = await marketplace.finalizeAuction(id);
        await tx.wait();
        console.log(`✅ Auction #${id} finalized`);
        trackListing(id); // move into escrow tracking if applicable
      }
    } catch (err) {
      // swallow individual finalize errors to keep loop running
    }
  }
}

function bootstrapEvents() {
  marketplace.on("AuctionFinalized", (listingId) => {
    trackListing(Number(listingId));
  });
  marketplace.on("EscrowCompleted", (listingId) => {
    trackedListings.delete(Number(listingId));
  });
  marketplace.on("EscrowRefunded", (listingId) => {
    trackedListings.delete(Number(listingId));
  });
}

async function sweepExistingListings() {
  const total = Number(await marketplace.totalListings());
  for (let id = 1; id <= total; id++) {
    try {
      const listing = await marketplace.getListing(id);
      const state = Number(listing[11]);
      const highestBid = listing[9];
      const exists = Boolean(listing[12]);
      if (!exists) continue;
      if (state === 1 && highestBid > 0n) {
        trackListing(id);
      }
    } catch (err) {
      // swallow errors for missing slots
    }
  }
}

async function main() {
  console.log("Starting Transactify Escrow Bot");
  console.log(`Marketplace @ ${marketplace.target}`);
  bootstrapEvents();
  await sweepExistingListings();
  await finalizeEndedAuctions();
  setInterval(() => {
    finalizeEndedAuctions().catch(() => {});
    for (const id of trackedListings.keys()) {
      evaluateListing(id);
    }
  }, POLL_INTERVAL);
}

main();
