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
  "event VerificationRequested(string propertyId,string street,string city,string state,string postalCode,string country,address indexed requester)",
  "function recordVerificationResult(string propertyId, bool propertyExists, string evidenceURI) external"
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY, provider);
const registry = new ethers.Contract(
  process.env.TITLE_REGISTRY_ADDRESS,
  TITLE_REGISTRY_ABI,
  wallet
);

function toPlainString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    try {
      return ethers.toUtf8String(value);
    } catch (err) {
      return "";
    }
  }
  if (value && typeof value === "object") {
    if (ethers.Result && ethers.Result.isResult?.(value)) {
      return toPlainString(value[0]);
    }
    if (value.propertyId) {
      return toPlainString(value.propertyId);
    }
    if (value.value) {
      return toPlainString(value.value);
    }
    const keys = Object.keys(value);
    if (keys.length > 0) {
      return toPlainString(value[keys[0]]);
    }
    if (typeof value.toString === "function") {
      const str = value.toString();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
  }
  return "";
}

function normalizeAddress(payload) {
  return {
    propertyId: toPlainString(payload.propertyId),
    street: toPlainString(payload.street),
    city: toPlainString(payload.city),
    state: toPlainString(payload.state),
    postalCode: toPlainString(payload.postalCode),
    country: toPlainString(payload.country),
    requester: payload.requester
  };
}

async function handleVerification(payload) {
  const {
    propertyId,
    street,
    city,
    state,
    postalCode,
    country,
    requester
  } = normalizeAddress(payload);
  if (!propertyId) {
    throw new Error("Invalid property id");
  }
  console.log(
    `\n🔍 Verification requested for ${propertyId} by ${requester}\n  ↳ ${street}, ${city}, ${state} ${postalCode}, ${country}`
  );
  const result = await lookupProperty({
    propertyId,
    street,
    city,
    state,
    postalCode,
    country
  });
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
    async (propertyId, street, city, state, postalCode, country, requester) => {
      try {
        await handleVerification({
          propertyId,
          street,
          city,
          state,
          postalCode,
          country,
          requester
        });
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
