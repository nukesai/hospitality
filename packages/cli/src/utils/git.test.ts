import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { assertCleanWorktree, worktreeStatus } from "./git.js";

const git = (cwd: string, ...args: string[]): void => {
  execFileSync("git", args, { cwd, stdio: "ignore" });
};

const makeRepo = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-git-"));
  git(cwd, "init", "-q");
  git(
    cwd,
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init",
  );
  return cwd;
};

describe("worktreeStatus", () => {
  it("reports a non-repo directory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-norepo-"));
    expect(worktreeStatus(cwd)).toEqual({ isRepo: false, isDirty: false });
  });

  it("reports clean and dirty states", async () => {
    const cwd = await makeRepo();
    expect(worktreeStatus(cwd)).toEqual({ isRepo: true, isDirty: false });
    await writeFile(path.join(cwd, "file.txt"), "hello");
    expect(worktreeStatus(cwd)).toEqual({ isRepo: true, isDirty: true });
  });
});

describe("assertCleanWorktree", () => {
  it("passes on a clean repo", async () => {
    const cwd = await makeRepo();
    expect(() => {
      assertCleanWorktree(cwd, false);
    }).not.toThrow();
  });

  it("throws outside a git repository", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-norepo-"));
    expect(() => {
      assertCleanWorktree(cwd, false);
    }).toThrow(/Not a git repository/);
  });

  it("throws on a dirty worktree", async () => {
    const cwd = await makeRepo();
    await writeFile(path.join(cwd, "file.txt"), "hello");
    expect(() => {
      assertCleanWorktree(cwd, false);
    }).toThrow(/worktree is dirty/);
  });

  it("--force bypasses every check", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-norepo-"));
    expect(() => {
      assertCleanWorktree(cwd, true);
    }).not.toThrow();
  });
});
