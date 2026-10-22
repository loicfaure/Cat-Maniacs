import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "check-publication.mjs");
const directories: string[] = [];

function repository(authorName = "Cat Maniacs Maintainer") {
  const directory = mkdtempSync(join(tmpdir(), "cat-maniacs-publication-"));
  directories.push(directory);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: authorName,
    GIT_AUTHOR_EMAIL: "maintainer@example.test",
    GIT_COMMITTER_NAME: authorName,
    GIT_COMMITTER_EMAIL: "maintainer@example.test",
  };
  execFileSync("git", ["init", "--quiet"], { cwd: directory, env });
  execFileSync(
    "git",
    [
      "-c",
      `core.hooksPath=${join(directory, "disabled-hooks")}`,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "Initial commit",
    ],
    { cwd: directory, env },
  );
  return directory;
}

function check(directory: string, includeHistory = false) {
  return spawnSync(process.execPath, [script, ...(includeHistory ? ["--include-history"] : [])], {
    cwd: directory,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("publication privacy checks", () => {
  it("allows contributor identities in source builds while enforcing them in the history audit", () => {
    const directory = repository("Contributor");
    const source = check(directory);
    expect(source.error).toBeUndefined();
    expect(source.status).toBe(0);
    expect(source.stdout).toContain("Publication privacy check passed");

    const history = check(directory, true);
    expect(history.error).toBeUndefined();
    expect(history.status).toBe(1);
    expect(history.stderr).toContain("Git history: personal commit name");
  });

  it("accepts anonymous identities in the history audit", () => {
    const result = check(repository(), true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 commits");
  });

  it.each([false, true])("rejects sensitive files with includeHistory=%s", (includeHistory) => {
    const directory = repository();
    writeFileSync(join(directory, "secret.key"), "fixture");
    execFileSync("git", ["add", "--force", "secret.key"], { cwd: directory });
    const result = check(directory, includeHistory);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("secret.key: sensitive file type or name");
  });
});
