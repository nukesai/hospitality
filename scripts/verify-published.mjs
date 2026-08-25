#!/usr/bin/env node
/**
 * Verifies, against the registry, that a publish actually landed.
 *
 * WHY THIS EXISTS — observed on run 32808766986 (2026-08-25):
 *
 *     ✅ Published package @nukesai-pos/cli@0.0.0-canary-20260825042544-d128c8e
 *
 * pnpm printed that, exited 0, and the job went green. The registry returns
 * E404 for that exact version; the other three packages published fine. The
 * fixed group was split on npm and nothing noticed.
 *
 * `pnpm publish` reporting success is NOT proof of publication. The only proof
 * is asking the registry. This asks.
 *
 * It checks, for every package in the fixed group:
 *   1. the expected version exists
 *   2. the expected dist-tag resolves to exactly that version
 *   3. all four agree — a split group is a hard failure, because versioning is
 *      fixed and a consumer installing one tag must get a coherent set
 *
 * Usage:
 *   node scripts/verify-published.mjs --version <v> --tag <t> [--retries 10]
 *
 * Registry propagation is not instant, so a miss is retried with backoff before
 * it is called a failure. THE BUDGET IS DELIBERATELY GENEROUS. Measured from
 * npm's own `time` records, `@nukesai-pos/cli` lands about 63 SECONDS after the
 * first package in the same `pnpm publish -r` — twice, reproducibly:
 *
 *     common 1.0.0  06:45:32.986Z    common canary  06:53:13.869Z
 *     cli    1.0.0  06:46:35.866Z    cli    canary  06:54:16.361Z
 *
 * The original 5 attempts at 3/6/9/12s gave a 30-second window, so it reddened
 * two real, correct releases (runs 32818068451 and 32818579714) whose packages
 * were all present a minute later. A publish is rare and a false failure is
 * expensive to triage, so waiting minutes to be certain is the cheap side of
 * this trade.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLISHED = ["common", "backend", "frontend", "cli"];
const REGISTRY = "https://registry.npmjs.org";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};

export const packageNames = () =>
  PUBLISHED.map(
    (dir) => JSON.parse(readFileSync(path.join(ROOT, `packages/${dir}/package.json`), "utf8")).name,
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Registry metadata, cache-busted — npm's CDN can serve a stale document. */
export const fetchPackument = async (name) => {
  const response = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`${name}: registry returned ${String(response.status)}`);
  return response.json();
};

const checkOne = async (name, version, tag) => {
  const doc = await fetchPackument(name);
  const problems = [];
  if (doc.versions?.[version] === undefined) {
    problems.push(`version ${version} is NOT on the registry`);
  }
  const tagged = doc["dist-tags"]?.[tag];
  if (tagged !== version) {
    problems.push(
      `dist-tag "${tag}" points at ${String(tagged ?? "nothing")}, expected ${version}`,
    );
  }
  return problems;
};

const main = async () => {
  const version = arg("--version");
  const tag = arg("--tag");
  const retries = Number(arg("--retries", "10"));

  if (version === undefined || tag === undefined) {
    process.stderr.write("usage: verify-published.mjs --version <v> --tag <t> [--retries N]\n");
    process.exit(2);
  }

  const names = packageNames();
  let failures = [];

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    failures = [];
    for (const name of names) {
      try {
        const problems = await checkOne(name, version, tag);
        if (problems.length > 0) failures.push(`${name}: ${problems.join("; ")}`);
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length === 0) break;
    if (attempt < retries) {
      // Linear ramp capped at 30s: 5+10+15+20+25+30+30+30+30 = 195s of patience,
      // comfortably past the ~63s worst case measured above, without a long tail
      // of exponential doubling on a genuinely broken publish.
      const waitMs = Math.min(attempt * 5000, 30000);
      process.stderr.write(
        `  attempt ${String(attempt)}/${String(retries)}: ${String(failures.length)} package(s) not visible yet, retrying in ${String(waitMs / 1000)}s\n`,
      );
      await sleep(waitMs);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`\nPUBLISH VERIFICATION FAILED for ${version} @ "${tag}":\n`);
    for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
    process.stderr.write(
      "\nVersioning is FIXED across these packages, so a partial publish leaves consumers\n"
        + "unable to install a coherent set. `pnpm publish` reporting success is not proof —\n"
        + 'it printed "Published" for a package the registry 404s (run 32808766986).\n'
        + "Re-run the release; publishing an already-published version is a no-op.\n",
    );
    process.exit(1);
  }

  process.stderr.write(
    `  verified on the registry: ${names.length} packages at ${version} @ "${tag}"\n`,
  );
};

if (process.argv[1] === import.meta.filename) await main();
