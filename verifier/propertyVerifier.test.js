import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAddressFromId,
  lookupProperty,
  setHttpClient,
  resetHttpClient
} from "./core.js";

test("formatAddressFromId converts slug into human-readable address", () => {
  assert.equal(formatAddressFromId("123-MAIN-ST-NY"), "123 MAIN ST, NY");
  assert.equal(formatAddressFromId("987-LAKESHORE-DR-IL"), "987 LAKESHORE DR, IL");
  assert.equal(
    formatAddressFromId("200-OCEAN-BLVD-MIAMI-FL"),
    "200 OCEAN BLVD MIAMI, FL"
  );
});

test("lookupProperty returns dataset overrides when available", async () => {
  const result = await lookupProperty("123-MAIN-ST-NY");
  assert.equal(result.exists, true);
  assert.ok(result.evidenceURI.includes("data.cityofnewyork.us"));
});

test("lookupProperty uses Census fallback when dataset misses", async () => {
  setHttpClient(async (url, options = {}) => {
    if (url.startsWith("https://geocoding.geo.census.gov")) {
      return {
        ok: true,
        async json() {
          return {
            result: {
              addressMatches: [
                {
                  matchedAddress: "111 FAKE ST SOMEWHERE, CA"
                }
              ]
            }
          };
        }
      };
    }
    return { ok: false };
  });

  const result = await lookupProperty("111-FAKE-ST-CA", undefined, []);
  assert.equal(result.exists, true);
  assert.ok(result.evidenceURI.includes("geocoding.geo.census.gov"));

  resetHttpClient();
});

test("lookupProperty falls back to metadata URI when Census misses", async () => {
  setHttpClient(async (url, options = {}) => {
    if (url.startsWith("https://geocoding.geo.census.gov")) {
      return {
        ok: true,
        async json() {
          return { result: { addressMatches: [] } };
        }
      };
    }
    if (url === "https://example.com/package.pdf" && options.method === "HEAD") {
      return { ok: true };
    }
    return { ok: false };
  });

  const result = await lookupProperty(
    "445-UNKNOWN-AVE-TX",
    "https://example.com/package.pdf",
    []
  );
  assert.equal(result.exists, true);
  assert.equal(result.evidenceURI, "https://example.com/package.pdf");

  resetHttpClient();
});
