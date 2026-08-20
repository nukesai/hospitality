import { afterEach, describe, expect, it, vi } from "vitest";

import type { NukesPos } from "./create-pos.js";
import type { CreateNukesPosOptions } from "./create-pos.js";

const bootCalls: CreateNukesPosOptions[] = [];
const shutdown = vi.fn(async () => Promise.resolve());
const bootState = { fail: false };

vi.mock("./create-pos.js", () => ({
  createNukesPos: async (options: CreateNukesPosOptions): Promise<NukesPos> => {
    bootCalls.push(options);
    if (bootState.fail) throw new Error("boot exploded");
    return Promise.resolve({ shutdown } as unknown as NukesPos);
  },
}));

import { disposePos, getPos } from "./singleton.js";

const ENV = { NODE_ENV: "test" } as const;

afterEach(async () => {
  bootState.fail = false;
  await disposePos();
  bootCalls.length = 0;
  shutdown.mockClear();
});

describe("getPos", () => {
  it("boots once and returns the same promise identity to every caller", async () => {
    const first = getPos({ env: ENV });
    const second = getPos({ env: ENV });
    expect(first).toBe(second);
    await first;
    expect(bootCalls).toHaveLength(1);
  });

  it("defaults env to process.env (the sanctioned ambient edge)", async () => {
    vi.stubEnv("BACKEND_RUNTIME", "server");
    try {
      await getPos();
      expect(bootCalls[0]?.env).toBe(process.env);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("wires the @vercel/functions hooks only on Vercel", async () => {
    await getPos({ env: { ...ENV, VERCEL: "1" } });
    expect(bootCalls[0]?.onPoolCreated).toBeTypeOf("function");
    expect(bootCalls[0]?.waitUntil).toBeTypeOf("function");

    await disposePos();
    await getPos({ env: ENV });
    expect(bootCalls[1]?.onPoolCreated).toBeUndefined();
    expect(bootCalls[1]?.waitUntil).toBeUndefined();
  });

  it("lets explicit hook overrides win over the Vercel wiring", async () => {
    const onPoolCreated = vi.fn();
    await getPos({ env: { ...ENV, VERCEL: "1" }, onPoolCreated });
    expect(bootCalls[0]?.onPoolCreated).toBe(onPoolCreated);
  });
});

describe("disposePos", () => {
  it("shuts the instance down and lets the next getPos boot fresh", async () => {
    await getPos({ env: ENV });
    await disposePos();
    expect(shutdown).toHaveBeenCalledTimes(1);
    await getPos({ env: ENV });
    expect(bootCalls).toHaveLength(2);
  });

  it("is safe when nothing was booted and when boot failed", async () => {
    await expect(disposePos()).resolves.toBeUndefined();
    bootState.fail = true;
    await expect(getPos({ env: ENV })).rejects.toThrow("boot exploded");
    await expect(disposePos()).resolves.toBeUndefined();
    expect(shutdown).not.toHaveBeenCalled();
  });
});
