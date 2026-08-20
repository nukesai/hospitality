import { describe, expect, it } from "vitest";

import { hashBody, inspect, stamp } from "./stamp.js";

const BODY = "export const a = 1;\n";

describe("stamp", () => {
  it("prepends a stamp whose hash matches the body", () => {
    const stamped = stamp(BODY);
    expect(stamped).toContain("// @nukesai-pos/cli generated — do not edit. hash: ");
    expect(stamped.endsWith(BODY)).toBe(true);
    expect(inspect(stamped)).toEqual({ kind: "pristine" });
  });

  it("normalizes CRLF before hashing so checkouts on Windows stay pristine", () => {
    expect(hashBody("a\r\nb\n")).toBe(hashBody("a\nb\n"));
  });

  it("reports absent for files without a stamp", () => {
    expect(inspect(BODY)).toEqual({ kind: "absent" });
  });

  it("reports modified with the current body when the user edited the file", () => {
    const edited = stamp(BODY).replace("a = 1", "a = 2");
    expect(inspect(edited)).toEqual({ kind: "modified", body: "export const a = 2;\n" });
  });
});
