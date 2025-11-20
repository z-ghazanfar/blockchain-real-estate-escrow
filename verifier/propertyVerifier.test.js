import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAddressLine,
  lookupProperty,
  setHttpClient,
  resetHttpClient
} from "./core.js";

test("buildAddressLine composes full structured address", () => {
  assert.equal(
    buildAddressLine({
      street: "123 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "USA"
    }),
    "123 Main St, Austin, TX 78701, USA"
  );

  assert.equal(
    buildAddressLine({
      street: "99 Broadway",
      city: "New York",
      state: "NY"
    }),
    "99 Broadway, New York, NY"
  );

  assert.equal(
    buildAddressLine({
      postalCode: "10001",
      country: "USA"
    }),
    "10001, USA"
  );
});

test("lookupProperty resolves via Census data", async () => {
  setHttpClient(async (url) => {
    if (url.startsWith("https://geocoding.geo.census.gov")) {
      return {
        ok: true,
        async json() {
          return {
            result: {
              addressMatches: [
                { matchedAddress: "123 MAIN ST, AUSTIN, TX 78701" }
              ]
            }
          };
        }
      };
    }
    return { ok: false };
  });

  const result = await lookupProperty({
    propertyId: "123-TEST",
    street: "123 Main St",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "USA"
  });
  assert.equal(result.exists, true);
  assert.ok(result.evidenceURI.includes("geocoding.geo.census.gov"));

  resetHttpClient();
});

test("lookupProperty returns rejection when Census has no matches", async () => {
  setHttpClient(async (url) => {
    if (url.startsWith("https://geocoding.geo.census.gov")) {
      return {
        ok: true,
        async json() {
          return { result: { addressMatches: [] } };
        }
      };
    }
    return { ok: false };
  });

  const result = await lookupProperty({
    propertyId: "999-UNKNOWN",
    street: "999 Unknown St",
    city: "Nowhere",
    state: "CA",
    postalCode: "90000",
    country: "USA"
  });
  assert.equal(result.exists, false);
  assert.equal(result.evidenceURI.includes("not-found"), true);

  resetHttpClient();
});

test("lookupProperty throws when address data missing", async () => {
  await assert.rejects(
    lookupProperty({
      propertyId: "NOPE"
    }),
    /Address data missing/
  );
});
