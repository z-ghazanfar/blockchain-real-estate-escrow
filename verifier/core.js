import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetPath = path.join(__dirname, "mock-properties.json");
const localDataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));

const CENSUS_ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

let httpClient = globalThis.fetch;
const defaultHttpClient = globalThis.fetch;

export function setHttpClient(clientFn) {
  httpClient = clientFn;
}

export function resetHttpClient() {
  httpClient = defaultHttpClient;
}

export function formatAddressFromId(propertyId) {
  const segments = propertyId
    .split("-")
    .map((seg) => seg.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  const state = segments.at(-1);
  const looksLikeState = /^[A-Z]{2}$/.test(state);
  if (!looksLikeState) {
    return segments.join(" ");
  }
  if (segments.length >= 3) {
    const city = segments.at(-2);
    if (city && city.length > 2) {
      const street = segments.slice(0, -2).join(" ");
      return `${street} ${city}, ${state}`.replace(/\s+/g, " ").trim();
    }
  }
  const streetOnly = segments.slice(0, -1).join(" ");
  return `${streetOnly}, ${state}`.replace(/\s+/g, " ").trim();
}

export async function verifyWithCensus(addressLine) {
  if (!httpClient) {
    throw new Error("HTTP client not configured");
  }
  const url = `${CENSUS_ENDPOINT}?address=${encodeURIComponent(
    addressLine
  )}&benchmark=2020&format=json`;
  const response = await httpClient(url);
  if (!response.ok) {
    throw new Error(`Census API error: ${response.status}`);
  }
  const data = await response.json();
  const matches = data?.result?.addressMatches ?? [];
  if (matches.length === 0) {
    return { exists: false };
  }
  const best = matches[0];
  const evidence = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(
    best.matchedAddress
  )}&benchmark=2020&format=json`;
  return {
    exists: true,
    evidenceURI: evidence
  };
}

export async function lookupProperty(propertyId, metadataURI, dataset = localDataset) {
  const normalized = propertyId.trim().toUpperCase();
  const record = dataset.find(
    (row) => row.propertyId.toUpperCase() === normalized
  );
  if (record) {
    return {
      exists: true,
      evidenceURI: record.sourceDocuments[0] ?? metadataURI
    };
  }

  const inferredAddress = formatAddressFromId(propertyId);
  try {
    const censusResult = await verifyWithCensus(inferredAddress);
    if (censusResult.exists) {
      return censusResult;
    }
  } catch (err) {
    console.warn(`Census lookup failed for ${propertyId}: ${err.message}`);
  }

  if (metadataURI && metadataURI.startsWith("http")) {
    try {
      const resp = await httpClient(metadataURI, { method: "HEAD" });
      if (resp.ok) {
        return {
          exists: true,
          evidenceURI: metadataURI
        };
      }
    } catch (err) {
      console.warn(`Metadata URI fetch failed: ${err.message}`);
    }
  }

  return {
    exists: false,
    evidenceURI: "ipfs://transactify/rejections/not-found"
  };
}
