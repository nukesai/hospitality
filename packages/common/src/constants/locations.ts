import type { LocationId } from "../types/index.js";

/** Cast helper: the single sanctioned way to brand a raw string as a LocationId. */
export const toLocationId = (raw: string): LocationId => {
  if (raw.length === 0) {
    throw new Error("LocationId must be a non-empty string.");
  }
  return raw as LocationId;
};

/** Demo location used by the example app and the demo adapter. */
export const DEMO_LOCATION_ID: LocationId = toLocationId("demo-main");
