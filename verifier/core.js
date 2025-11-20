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

function clean(value) {
  if (!value) return "";
  return value.toString().trim();
}

export function buildAddressLine({
  street,
  city,
  state,
  postalCode,
  country
} = {}) {
  const streetLine = clean(street);
  const cityVal = clean(city);
  const stateVal = clean(state);
  const postalVal = clean(postalCode);
  const countryVal = clean(country);

  const segments = [];
  if (streetLine) {
    segments.push(streetLine);
  }
  let locality = [cityVal, stateVal].filter(Boolean).join(", ");
  if (locality) {
    if (postalVal) {
      locality = `${locality} ${postalVal}`.trim();
    }
    segments.push(locality);
  } else if (postalVal) {
    segments.push(postalVal);
  }
  if (countryVal) {
    segments.push(countryVal);
  }

  return segments
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
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

export async function lookupProperty({
  propertyId,
  street,
  city,
  state,
  postalCode,
  country
}) {
  const addressLine = buildAddressLine({
    street,
    city,
    state,
    postalCode,
    country
  });
  if (!addressLine) {
    throw new Error(`Address data missing for ${propertyId}`);
  }
  try {
    const censusResult = await verifyWithCensus(addressLine);
    if (censusResult.exists) {
      return censusResult;
    }
  } catch (err) {
    console.warn(`Census lookup failed for ${propertyId}: ${err.message}`);
  }

  return {
    exists: false,
    evidenceURI: "ipfs://transactify/rejections/not-found"
  };
}
