import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { lookupProperty } from "./core.js";

dotenv.config();

const REQUIRED_ENV = [
  "RPC_URL",
  "TITLE_REGISTRY_ADDRESS",
  "VERIFIER_PRIVATE_KEY"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const TITLE_REGISTRY_ABI = [
  "event VerificationRequested(string indexed propertyId, address indexed requester, string metadataURI)",
  "function recordVerificationResult(string propertyId, bool propertyExists, string evidenceURI) external"
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);
const registry = new ethers.Contract(
  process.env.TITLE_REGISTRY_ADDRESS,
  TITLE_REGISTRY_ABI,
  wallet
);

async function handleVerification(propertyId, requester, metadataURI) {
  console.log(`\n🔍 Verification requested for ${propertyId} by ${requester}`);
  const result = await lookupProperty(propertyId, metadataURI);
  console.log(
    `Resolved property ${propertyId} => exists=${result.exists}, evidence=${result.evidenceURI}`
  );
  const tx = await registry.recordVerificationResult(
    propertyId,
    result.exists,
    result.evidenceURI
  );
  console.log(`Submitted recordVerificationResult tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ Verification stored on-chain for ${propertyId}`);
}

export function startVerifier() {
  console.log("Starting Transactify verifier...");
  console.log(`Listening to TitleRegistry @ ${registry.target}`);
  registry.on(
    "VerificationRequested",
    async (propertyId, requester, metadataURI) => {
      try {
        await handleVerification(propertyId, requester, metadataURI);
      } catch (err) {
        console.error(
          `❌ Failed to process ${propertyId}: ${err.shortMessage || err.message}`
        );
      }
    }
  );
}

const entryFile = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (entryFile && import.meta.url === entryFile) {
  startVerifier();
}
