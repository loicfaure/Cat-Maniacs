import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_3_TABLES } from "../../legacy/migration/legacyFormat";
import { runMigrationCli } from "../../migrationCli";

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("migration CLI", () => {
  it("runs a read-only schema-3 dry run on a complete synthetic dataset", async () => {
    const directory = await emptySchema3Dataset();
    const before = await snapshot(directory);
    expect(await runMigrationCli(["--dataset", directory, "--dry-run"])).toBe(0);
    expect(await snapshot(directory)).toEqual(before);
  });

  it("returns a validation error for bad dry-run values without writing files", async () => {
    const directory = await emptySchema3Dataset();
    const headers = SCHEMA_3_TABLES.find((table) => table.key === "families")!.headers;
    const row = headers.map((header) =>
      header === "id" ? "family-1" : header === "maxCapacity" ? "NaN" : "",
    );
    await writeFile(join(directory, "families.csv"), `${headers.join(",")}\n${row.join(",")}\n`);
    const before = await snapshot(directory);
    expect(await runMigrationCli(["--dataset", directory, "--dry-run"])).toBe(3);
    expect(await snapshot(directory)).toEqual(before);
  });

  it("rejects missing and noninteractive confirmation requests without changing files", async () => {
    const directory = await emptySchema3Dataset();
    const before = await snapshot(directory);
    expect(await runMigrationCli([])).toBe(2);
    expect(await runMigrationCli(["--dataset", directory])).toBe(2);
    expect(await snapshot(directory)).toEqual(before);
  });
});

async function emptySchema3Dataset(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cat-migration-cli-"));
  scratch.push(directory);
  await writeFile(
    join(directory, "dataset.json"),
    JSON.stringify({
      schemaVersion: 3,
      datasetId: "synthetic-cli-dataset",
      name: "Synthetic CLI fixture",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T00:00:00.000Z",
    }),
  );
  for (const table of SCHEMA_3_TABLES) {
    await writeFile(join(directory, table.file), `${table.headers.join(",")}\n`);
  }
  return directory;
}

async function snapshot(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of await readdir(directory)) {
    files[file] = await readFile(join(directory, file), "utf8");
  }
  return files;
}
