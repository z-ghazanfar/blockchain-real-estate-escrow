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
      "function finalizeAuction(uint256 listingId) external",
      "function getListing(uint256) external view returns(string,address,address,uint64,uint64,uint64,uint128,uint128,uint128,uint256,address,uint8,bool)",
      "function totalListings() external view returns(uint256)"
    ];
  }
}

const marketplaceAbi = loadAbi();

async function main() {
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

  const total = Number(await marketplace.totalListings());
  const now = Math.floor(Date.now() / 1000);
  const code = await provider.getCode(marketplace.target);
  if (!code || code === "0x") {
    console.error(`No contract code found at ${marketplace.target}. Check RPC/network/address.`);
    return;
  }
  console.log(`Scanning ${total} listings...`);

  for (let id = 1; id <= total; id++) {
    try {
      const l = await marketplace.getListing(id);
      const state = Number(l[11]);
      const biddingEnd = Number(l[3]);
      const highestBid = l[9];
      const exists = Boolean(l[12]);
      if (!exists) {
        console.log(
          `#${id} skipped (no listing exists in slot) raw propertyId="${l[0] || ""}" seller=${l[1] || "0x0"}`
        );
        continue; // exists flag
      }

      console.log(
        `#${id} state=${state} highestBid=${ethers.formatEther(highestBid)} biddingEnd=${biddingEnd} now=${now}`
      );

      // Unknown state guard: try to finalize if auction likely ended
      if (state > 4) {
        console.log(`#${id} has unexpected state ${state}; attempting finalize as safeguard.`);
        if (biddingEnd > 0 && now > biddingEnd) {
          try {
            const tx = await marketplace.finalizeAuction(id);
            await tx.wait();
            console.log(`✅ Safeguard finalized auction #${id}`);
            continue;
          } catch (e) {
            console.error(`❌ Safeguard finalize failed for #${id}: ${e.shortMessage || e.message}`);
          }
        }
      }

      // Finalize ended auctions
      if (state === 0 && now > biddingEnd) {
        console.log(`⏳ Finalizing auction #${id}`);
        const tx = await marketplace.finalizeAuction(id);
        await tx.wait();
        console.log(`✅ Auction #${id} finalized`);
        continue; // move to next listing
      }

      // Escrow actions
      if (state === 1 && highestBid > 0n) {
        const [canRelease, canRefund] = await marketplace.previewEscrowAction(id);
        if (canRelease) {
          console.log(`🔁 Completing escrow for #${id}`);
          const tx = await marketplace.completeEscrow(id);
          await tx.wait();
          console.log(`✅ Escrow completed for #${id}`);
        } else if (canRefund) {
          console.log(`🔁 Refunding escrow for #${id}`);
          const tx = await marketplace.claimEscrowRefund(id);
          await tx.wait();
          console.log(`💸 Escrow refunded for #${id}`);
        } else {
          console.log(`#${id} escrow pending; no action available yet.`);
        }
      } else if (state === 2) {
        console.log(`#${id} already completed`);
      } else if (state === 3) {
        console.log(`#${id} refunded`);
      } else if (state === 4) {
        console.log(`#${id} cancelled`);
      }
    } catch (err) {
      console.error(`⚠️  Listing #${id} sweep failed: ${err.shortMessage || err.message}`);
      // Fallback: try to finalize ended auction if getListing decoding failed
      try {
        const tx = await marketplace.finalizeAuction(id);
        await tx.wait();
        console.log(`✅ Fallback finalized auction #${id}`);
      } catch (_) {}
    }
  }
  console.log("Done sweep.");
  if (provider.destroy) {
    provider.destroy();
  } else if (provider._websocket && provider._websocket.terminate) {
    provider._websocket.terminate();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  if (provider.destroy) {
    provider.destroy();
  } else if (provider._websocket && provider._websocket.terminate) {
    provider._websocket.terminate();
  }
  process.exit(1);
});
