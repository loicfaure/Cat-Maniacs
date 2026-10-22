import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  commitMigration,
  recoverMigration,
  recoverStaleMigrationBeforeInspection,
  releaseStaleMigrationLock,
} from "./transaction";

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("migration filesystem transaction", () => {
  it("backs up and verifies originals before publishing the manifest last", async () => {
    const directory = await makeDataset();
    await writeFile(join(directory, "dataset.json"), '{"schemaVersion":7}\n');
    await writeFile(join(directory, "cats.csv"), "id,name\ncat-1,Mina\n");
    const receipt = await commitMigration({
      directory,
      sourceSchema: 7,
      files: [
        { name: "animals.csv", content: "id,speciesId\ncat-1,cat\n" },
        { name: "dataset.json", content: '{"modelVersion":1,"schemaVersion":8}\n', manifest: true },
      ],
      retiredFiles: ["cats.csv"],
      counts: { animals: 1 },
      validateStaged: async (stage) => {
        expect(await readFile(join(stage, "animals.csv"), "utf8")).toContain("cat-1,cat");
      },
    });
    expect(await readFile(join(directory, "dataset.json"), "utf8")).toContain('"schemaVersion":8');
    await expect(readFile(join(directory, "cats.csv"), "utf8")).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(directory, ".model-migration-receipt.json"), "utf8")),
    ).toMatchObject(receipt);
    expect(await readFile(join(receipt.backupPath, "cats.csv"), "utf8")).toContain("Mina");
    await expect(
      readFile(join(receipt.backupPath, ".model-migration.lock"), "utf8"),
    ).rejects.toThrow();
    const inventory = JSON.parse(
      await readFile(
        join(receipt.backupPath, `.model-migration-inventory-${receipt.migrationId}.json`),
        "utf8",
      ),
    ) as Array<{ path: string; sha256: string }>;
    expect(inventory.some((entry) => entry.path === "cats.csv" && entry.sha256.length === 64)).toBe(
      true,
    );
  });

  it("finishes an interrupted transaction and persists its receipt", async () => {
    const directory = await makeDataset();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const animalsTemp = `.animals.csv.${id}.migration-tmp`;
    const manifestTemp = `.dataset.json.${id}.migration-tmp`;
    await writeFile(join(directory, animalsTemp), "id,speciesId\ncat-1,cat\n");
    await writeFile(join(directory, manifestTemp), '{"modelVersion":1,"schemaVersion":8}\n');
    await writeFile(
      join(directory, ".model-migration.lock"),
      JSON.stringify({ pid: 2147483647, startedAt: "2020-01-01T00:00:00.000Z" }),
    );
    await writeFile(
      join(directory, ".model-migration-transaction.json"),
      JSON.stringify({
        id,
        files: [
          { temporary: animalsTemp, target: "animals.csv", manifest: false },
          { temporary: manifestTemp, target: "dataset.json", manifest: true },
        ],
        retiredFiles: [],
        receipt: {
          migrationId: id,
          sourceSchema: 3,
          targetSchema: 8,
          backupPath: "/backup",
          completedAt: "2026-10-22T00:00:00.000Z",
          counts: { animals: 0 },
        },
      }),
    );
    expect(await recoverMigration(directory)).toBe("recovered");
    expect(await readFile(join(directory, "animals.csv"), "utf8")).toBe(
      "id,speciesId\ncat-1,cat\n",
    );
    expect(JSON.parse(await readFile(join(directory, "dataset.json"), "utf8")).schemaVersion).toBe(
      8,
    );
    expect(
      JSON.parse(await readFile(join(directory, ".model-migration-receipt.json"), "utf8"))
        .migrationId,
    ).toBe(id);
  });

  it("refuses a recovery journal that names a file outside the dataset", async () => {
    const directory = await makeDataset();
    await writeFile(
      join(directory, ".model-migration-transaction.json"),
      JSON.stringify({
        id: "123e4567-e89b-42d3-a456-426614174000",
        files: [{ temporary: "../../outside", target: "animals.csv", manifest: false }],
        retiredFiles: [],
        receipt: {
          migrationId: "123e4567-e89b-42d3-a456-426614174000",
          sourceSchema: 3,
          targetSchema: 8,
          backupPath: "/backup",
          completedAt: "2026-10-22T00:00:00.000Z",
          counts: {},
        },
      }),
    );
    await expect(recoverMigration(directory)).rejects.toThrow(/hors du dossier/);
  });

  it("requires confirmation before clearing a stale lock", async () => {
    const directory = await makeDataset();
    await writeFile(
      join(directory, ".model-migration.lock"),
      JSON.stringify({ pid: 2147483647, startedAt: "2020-01-01T00:00:00.000Z" }),
    );
    const refused = await releaseStaleMigrationLock(directory, async () => false);
    expect(refused).toBe(false);
    const released = await releaseStaleMigrationLock(directory, async (owner) => {
      expect(owner.pid).toBe(2147483647);
      return true;
    });
    expect(released).toBe(true);
    await expect(readFile(join(directory, ".model-migration.lock"), "utf8")).rejects.toThrow();
  });

  it("recovers a dead owner's journal before dataset inspection", async () => {
    const directory = await makeDataset();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const animalsTemp = `.animals.csv.${id}.migration-tmp`;
    const manifestTemp = `.dataset.json.${id}.migration-tmp`;
    await writeFile(join(directory, animalsTemp), "complete");
    await writeFile(join(directory, manifestTemp), '{"schemaVersion":8}');
    await writeFile(
      join(directory, ".model-migration.lock"),
      JSON.stringify({ pid: 2147483647, startedAt: "2020-01-01T00:00:00.000Z" }),
    );
    await writeFile(
      join(directory, ".model-migration-transaction.json"),
      JSON.stringify({
        id,
        files: [
          { temporary: animalsTemp, target: "animals.csv", manifest: false },
          { temporary: manifestTemp, target: "dataset.json", manifest: true },
        ],
        retiredFiles: [],
        receipt: {
          migrationId: id,
          sourceSchema: 7,
          targetSchema: 8,
          backupPath: "/backup",
          completedAt: "2026-10-22T00:00:00.000Z",
          counts: { animals: 1 },
        },
      }),
    );
    await recoverStaleMigrationBeforeInspection(directory);
    expect(await readFile(join(directory, "animals.csv"), "utf8")).toBe("complete");
    expect(JSON.parse(await readFile(join(directory, "dataset.json"), "utf8")).schemaVersion).toBe(
      8,
    );
    await expect(readFile(join(directory, ".model-migration.lock"), "utf8")).rejects.toThrow();
  });

  it("leaves source bytes unchanged and reports the backup path when stage validation fails", async () => {
    const directory = await makeDataset();
    const manifest = '{"schemaVersion":7}\n';
    const cats = "id,name\ncat-1,Mina\n";
    await writeFile(join(directory, "dataset.json"), manifest);
    await writeFile(join(directory, "cats.csv"), cats);
    let failure = "";
    try {
      await commitMigration({
        directory,
        sourceSchema: 7,
        files: [
          { name: "animals.csv", content: "id,speciesId\ncat-1,cat\n" },
          { name: "dataset.json", content: '{"schemaVersion":8}', manifest: true },
        ],
        retiredFiles: ["cats.csv"],
        validateStaged: async () => {
          throw new Error("injected stage failure");
        },
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    expect(failure).toMatch(/Migration annulée\. Sauvegarde : .*legacy-backup/);
    expect(failure).toContain("injected stage failure");
    expect(await readFile(join(directory, "dataset.json"), "utf8")).toBe(manifest);
    expect(await readFile(join(directory, "cats.csv"), "utf8")).toBe(cats);
    await expect(readFile(join(directory, ".model-migration.lock"), "utf8")).rejects.toThrow();
  });

  it("fails backup verification on a symlink before changing source files and names the backup", async () => {
    const directory = await makeDataset();
    const manifest = '{"schemaVersion":7}\n';
    await writeFile(join(directory, "dataset.json"), manifest);
    await symlink(join(directory, "missing-target"), join(directory, "unexpected-link"));
    await expect(
      commitMigration({
        directory,
        sourceSchema: 7,
        files: [{ name: "dataset.json", content: '{"schemaVersion":8}', manifest: true }],
        retiredFiles: [],
        validateStaged: async () => {},
      }),
    ).rejects.toThrow(/Migration annulée\. Sauvegarde : .*legacy-backup/);
    expect(await readFile(join(directory, "dataset.json"), "utf8")).toBe(manifest);
    await expect(readFile(join(directory, ".model-migration.lock"), "utf8")).rejects.toThrow();
  });

  it("never recovers while a migration lock belongs to a live process", async () => {
    const directory = await makeDataset();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await writeFile(join(directory, ".model-migration.lock"), JSON.stringify({ pid: process.pid }));
    await writeFile(
      join(directory, ".model-migration-transaction.json"),
      JSON.stringify({ id, files: [], retiredFiles: [], receipt: {} }),
    );
    await expect(recoverMigration(directory)).rejects.toThrow(/utilise encore/);
  });

  it("rejects same-directory journal targets that are not migration tables", async () => {
    const directory = await makeDataset();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await writeFile(
      join(directory, ".model-migration-transaction.json"),
      JSON.stringify({
        id,
        files: [
          { temporary: `.README.md.${id}.migration-tmp`, target: "README.md", manifest: false },
        ],
        retiredFiles: [],
        receipt: {
          migrationId: id,
          sourceSchema: 7,
          targetSchema: 8,
          backupPath: "/backup",
          completedAt: "2026-10-22T00:00:00.000Z",
          counts: {},
        },
      }),
    );
    await expect(recoverMigration(directory)).rejects.toThrow(/cibles inattendues/);
  });
});

async function makeDataset(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cat-migration-transaction-"));
  scratch.push(directory);
  return directory;
}
