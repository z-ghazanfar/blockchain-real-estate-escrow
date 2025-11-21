import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { lookupProperty } from "./core.js";

dotenv.config();

const REQUIRED_ENV = ["RPC_URL", "TITLE_REGISTRY_ADDRESS", "VERIFIER_PRIVATE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const STATE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), ".lastBlock.json");

function readLastBlock(defaultValue) {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const data = JSON.parse(raw);
    if (typeof data.lastBlock === "number") return data.lastBlock;
  } catch (_) {}
  return defaultValue;
}

function writeLastBlock(lastBlock) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ lastBlock }), "utf8");
  } catch (err) {
    console.error("Failed to persist last block", err.message);
  }
}

async function main() {
  const url = process.env.RPC_URL;
  const provider = url.startsWith("ws")
    ? new ethers.WebSocketProvider(url)
    : new ethers.JsonRpcProvider(url, undefined, {
        polling: true,
        pollingInterval: Number(process.env.VERIFIER_POLL_INTERVAL_MS || "60000")
      });
  try {
    const wallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);
    const registry = new ethers.Contract(
      process.env.TITLE_REGISTRY_ADDRESS,
      [
        "event VerificationRequested(string propertyId,string street,string city,string state,string postalCode,string country,address indexed requester)",
        "function recordVerificationResult(string propertyId, bool propertyExists, string evidenceURI) external"
      ],
      wallet
    );
    const verificationEventSig =
      "event VerificationRequested(string propertyId,string street,string city,string state,string postalCode,string country,address indexed requester)";
    const iface = new ethers.Interface([verificationEventSig]);

    const latest = await provider.getBlockNumber();
    const defaultStart =
      process.env.VERIFIER_START_BLOCK !== undefined
        ? Number(process.env.VERIFIER_START_BLOCK)
        : Math.max(0, latest - 2000);
    let fromBlock = readLastBlock(defaultStart) + 1;
    const toBlock = latest;
    if (toBlock < fromBlock) {
      console.log("No new blocks to process.");
      writeLastBlock(toBlock);
      return;
    }
    console.log(
      `Scanning VerificationRequested logs from block ${fromBlock} to ${toBlock}...`
    );
    const logs = await provider.getLogs({
      address: registry.target,
      topics: [iface.encodeFilterTopics("VerificationRequested", [])],
      fromBlock,
      toBlock
    });
    if (!logs.length) {
      console.log("No verification requests found in range.");
      writeLastBlock(toBlock);
      return;
    }

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        const [
          propertyId,
          street,
          city,
          state,
          postalCode,
          country,
          requester
        ] = parsed.args;
        console.log(
          `Processing ${propertyId} from block ${log.blockNumber} requested by ${requester}`
        );
        const result = await lookupProperty({
          propertyId,
          street,
          city,
          state,
          postalCode,
          country
        });
        const tx = await registry.recordVerificationResult(
          propertyId,
          result.exists,
          result.evidenceURI
        );
        console.log(`  ↳ Submitted tx ${tx.hash}`);
        await tx.wait();
        console.log(`  ✅ Stored result for ${propertyId}`);
      } catch (err) {
        console.error(
          `  ❌ Failed to process log @${log.blockNumber}: ${err.shortMessage || err.message}`
        );
      }
    }
    writeLastBlock(toBlock);
    console.log("Done.");
  } finally {
    if (provider?.destroy) provider.destroy();
    else if (provider?._websocket?.terminate) provider._websocket.terminate();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
