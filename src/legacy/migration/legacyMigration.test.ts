import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TABLES } from "../../infrastructure/database/tables";
import { DatasetRepository } from "../../infrastructure/datasetRepository";
import { runLegacyMigration } from "../../infrastructure/migrations/engine";
import {
  inspectLegacyDataset,
  readLegacyTables,
} from "../../infrastructure/migrations/inspectLegacy";
import { SCHEMA_3_TABLES, SCHEMA_7_TABLES } from "./legacyFormat";
import { mapLegacyDataset } from "./mapLegacy";

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("frozen legacy migration adapters", () => {
  it.each([
    { schema: 3, specs: SCHEMA_3_TABLES },
    { schema: 7, specs: SCHEMA_7_TABLES },
  ])(
    "maps schema $schema records without changing IDs or relationships",
    async ({ schema, specs }) => {
      const directory = await fixture(schema, specs);
      const manifest = {
        schemaVersion: schema,
        datasetId: "dataset-1",
        name: "Synthetic",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2021-01-01T00:00:00.000Z",
      };
      await writeFile(join(directory, "dataset.json"), JSON.stringify(manifest));
      const source = await readLegacyTables(directory, schema as 3 | 7);
      const migrated = mapLegacyDataset(source, manifest, schema as 3 | 7);

      expect(migrated.manifest).toMatchObject({
        modelVersion: 1,
        schemaVersion: 8,
        datasetId: "dataset-1",
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        settings: { enabledSpecies: ["cat"] },
      });
      const animal = migrated.tables.get("animals")?.[0];
      expect(animal).toMatchObject({
        id: "cat-1",
        name: "Mina",
        speciesId: "cat",
        identificationNumber: "250261234567890",
        identificationScheme: "ICAD",
        createdAt: "2019-01-01T00:00:00.000Z",
      });
      expect(animal?.compatibilityBySpecies).toBe(
        JSON.stringify(schema === 7 ? { cat: false, dog: true } : { cat: null, dog: null }),
      );
      expect(animal?.speciesData).toBe(JSON.stringify({ breed: "" }));
      expect(migrated.tables.get("fosterPlacements")?.[0]).toMatchObject({
        animalId: "cat-1",
        familyId: "family-1",
      });
      expect(migrated.tables.get("families")?.[0]).toMatchObject({
        acceptanceRules: JSON.stringify({ cat: { profiles: ["KITTEN", "ADULT"] } }),
        maxCapacity: "2",
      });
      expect(migrated.tables.get("refugeZones")?.[0].allowedSpecies).toBe(JSON.stringify(["cat"]));
      if (schema === 7) {
        expect(migrated.tables.get("animals")?.[0].description).toBe("Schema 7 description");
        expect(migrated.tables.get("animals")?.[0].photo).toBe("data:image/png;base64,old-photo");
        expect(migrated.tables.get("animals")?.[0].medicationSchedule).toBe("soir");
        expect(migrated.tables.get("animals")?.[0].okWithChildren).toBe("false");
        expect(migrated.tables.get("animals")?.[0].vaccines).toBe("RCP");
        expect(migrated.tables.get("animalEvents")?.[0].label).toBe("Arrivée personnalisée");
        expect(migrated.tables.get("sponsorships")?.[0]).toMatchObject({
          animalId: "cat-1",
          monthlyAmount: "25",
          paymentNotes: "Virement mensuel",
        });
      }
      expect(migrated.tables.get("fosterFamilyHolidays")?.[0]).toMatchObject({
        id: "holiday-1",
        familyId: "family-1",
      });
      expect(migrated.tables.get("refugeStays")?.[0]).toMatchObject({
        id: "stay-1",
        animalId: "cat-1",
        zoneId: "zone-1",
      });
      expect(migrated.tables.get("adoptions")?.[0]).toMatchObject({
        id: "adoption-1",
        animalId: "cat-1",
        adopterId: "adopter-1",
        adoptionDayId: "day-1",
      });
      expect(migrated.tables.get("adoptionDayAnimals")?.[0]).toMatchObject({
        id: "registration-1",
        animalId: "cat-1",
        adoptionDayId: "day-1",
        adopterId: "adopter-1",
      });
      expect(migrated.tables.get("healthAlerts")?.[0]).toMatchObject({
        id: "alert-1",
        animalId: "cat-1",
      });
      expect(migrated.tables.get("animalEvents")?.[0]).toMatchObject({
        id: "event-1",
        animalId: "cat-1",
      });
      expect(migrated.tables.get("tasks")?.[0]).toMatchObject({ id: "task-1", animalId: "cat-1" });
      expect(migrated.tables.get("followUps")?.[0]).toMatchObject({
        id: "follow-up-1",
        animalId: "cat-1",
        adoptionId: "adoption-1",
      });
    },
  );

  it("reports current/future/malformed data without modifying it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-migration-inspect-"));
    scratch.push(directory);
    const current = {
      modelVersion: 1,
      schemaVersion: 8,
      datasetId: "d",
      name: "D",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2021-01-01T00:00:00.000Z",
      settings: { enabledSpecies: ["cat"] },
    };
    await writeFile(join(directory, "dataset.json"), JSON.stringify(current));
    expect((await inspectLegacyDataset(directory)).format).toBe("current");
    await writeFile(
      join(directory, "dataset.json"),
      JSON.stringify({ modelVersion: 9, schemaVersion: 9 }),
    );
    expect((await inspectLegacyDataset(directory)).format).toBe("unsupported");
    await writeFile(join(directory, "dataset.json"), "{");
    expect((await inspectLegacyDataset(directory)).format).toBe("malformed");
    expect(await readFile(join(directory, "dataset.json"), "utf8")).toBe("{");
  });

  it.each([
    ["families", "maxCapacity", "NaN"],
    ["healthAlerts", "lookbackDays", "many"],
    ["sponsorships", "monthlyAmount", "not-a-number"],
    ["cats", "intakeDate", "2020-02-31"],
    ["adoptions", "adoptionDate", ""],
  ])("rejects invalid legacy %s.%s values", async (table, field, value) => {
    const directory = await fixture(7, SCHEMA_7_TABLES);
    const manifest = {
      schemaVersion: 7,
      datasetId: "dataset-1",
      name: "Synthetic",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2021-01-01T00:00:00.000Z",
    };
    const source = await readLegacyTables(directory, 7);
    const row = source.get(table)?.[0];
    if (!row) {
      throw new Error(`Fixture table ${table} is missing`);
    }
    row[field] = value;
    expect(() => mapLegacyDataset(source, manifest, 7)).toThrow(/invalide|obligatoire/);
  });

  it("refuses unexpected historical columns rather than dropping data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-migration-columns-"));
    scratch.push(directory);
    await writeFile(
      join(directory, "cats.csv"),
      `${SCHEMA_3_TABLES[0].headers.join(",")},unexpected\n`,
    );
    await expect(readLegacyTables(directory, 3)).rejects.toThrow(/colonnes inattendues/);
  });

  it("runs schema 3 through staging validation and publishes a v1 dataset", async () => {
    const root = await mkdtemp(join(tmpdir(), "cat-migration-engine-"));
    scratch.push(root);
    const directory = await fixture(3, SCHEMA_3_TABLES, root);
    const manifest = {
      schemaVersion: 3,
      datasetId: "dataset-1",
      name: "Synthetic",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2021-01-01T00:00:00.000Z",
    };
    await writeFile(join(directory, "dataset.json"), JSON.stringify(manifest));
    const result = await runLegacyMigration({
      directory,
      tables: TABLES,
      confirm: async () => true,
      validateStaged: async (staged) => {
        await DatasetRepository.open(staged);
      },
    });
    expect(result.status).toBe("migrated");
    const opened = await DatasetRepository.open(directory);
    expect(opened.dataset.modelVersion).toBe(1);
    expect(opened.dataset.schemaVersion).toBe(8);
    expect(opened.dataset.animals.map(({ id }) => id)).toEqual(["cat-1"]);
    expect(opened.dataset.animals[0]?.compatibilityBySpecies).toEqual({ cat: null, dog: null });
  });

  it("dry-run maps and validates references without creating locks or backups", async () => {
    const root = await mkdtemp(join(tmpdir(), "cat-migration-dry-run-"));
    scratch.push(root);
    const directory = await fixture(3, SCHEMA_3_TABLES, root);
    await writeFile(
      join(directory, "dataset.json"),
      JSON.stringify({
        schemaVersion: 3,
        datasetId: "dataset-1",
        name: "Synthetic",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2021-01-01T00:00:00.000Z",
      }),
    );
    const result = await runLegacyMigration({
      directory,
      dryRun: true,
      tables: TABLES,
      validateStaged: async () => {},
    });
    expect(result.status).toBe("dry-run");
    expect(result.inspection.problems).toEqual([]);
    expect(await readdir(root)).toEqual([directory.split("/").at(-1)]);
    const placements = await readFile(join(directory, "foster_placements.csv"), "utf8");
    await writeFile(
      join(directory, "foster_placements.csv"),
      placements.replace("cat-1", "missing-cat"),
    );
    const invalid = await runLegacyMigration({
      directory,
      dryRun: true,
      tables: TABLES,
      validateStaged: async () => {},
    });
    expect(invalid.status).toBe("dry-run");
    expect(invalid.inspection.problems.join(" ")).toMatch(/pointe vers un enregistrement absent/);
    expect(await readdir(root)).toEqual([directory.split("/").at(-1)]);
  });
});

async function fixture(
  schema: number,
  specs: readonly { key: string; file: string; headers: readonly string[] }[],
  root = tmpdir(),
): Promise<string> {
  const directory = await mkdtemp(join(root, `cat-migration-v${schema}-`));
  scratch.push(directory);
  await mkdir(directory, { recursive: true });
  for (const spec of specs) {
    const header = spec.headers.join(",");
    let row = spec.headers.map(() => "");
    const set = (field: string, value: string) => {
      const index = spec.headers.indexOf(field);
      if (index >= 0) {
        row[index] = value;
      }
    };
    if (spec.key === "cats") {
      set("id", "cat-1");
      set("name", "Mina");
      set("identificationNumber", "250261234567890");
      set("intakeDate", "2019-01-01");
      set("okWithCats", "false");
      set("okWithDogs", "true");
      set("createdAt", "2019-01-01T00:00:00.000Z");
      if (schema === 7) {
        set("description", "Schema 7 description");
        set("photo", "data:image/png;base64,old-photo");
        set("medicationSchedule", "soir");
        set("okWithChildren", "false");
        set("vaccines", "RCP");
      }
    } else if (spec.key === "families") {
      set("id", "family-1");
      set("maxCapacity", "2");
      set("acceptedProfiles", "KITTEN|ADULT");
    } else if (spec.key === "adopters") {
      set("id", "adopter-1");
      set("firstName", "Zoé");
    } else if (spec.key === "fosterFamilyHolidays") {
      set("id", "holiday-1");
      set("familyId", "family-1");
      set("startDate", "2020-01-01");
      set("endDate", "2020-01-02");
    } else if (spec.key === "fosterPlacements") {
      set("id", "placement-1");
      set("catId", "cat-1");
      set("familyId", "family-1");
      set("startDate", "2020-01-01");
    } else if (spec.key === "refugeStays") {
      set("id", "stay-1");
      set("catId", "cat-1");
      set("zoneId", "zone-1");
      set("startDate", "2020-01-01");
    } else if (spec.key === "refugeZones") {
      set("id", "zone-1");
      set("name", "Infirmerie");
    } else if (spec.key === "adoptions") {
      set("id", "adoption-1");
      set("catId", "cat-1");
      set("adopterId", "adopter-1");
      set("adoptionDayId", "day-1");
      set("status", "ACTIVE");
      set("adoptionDate", "2020-01-02");
    } else if (spec.key === "adoptionDays") {
      set("id", "day-1");
      set("name", "Journée test");
      set("status", "PLANNED");
      set("startDate", "2020-01-01");
      set("endDate", "2020-01-02");
    } else if (spec.key === "adoptionDayCats") {
      set("id", "registration-1");
      set("catId", "cat-1");
      set("adoptionDayId", "day-1");
      set("adopterId", "adopter-1");
      set("status", "REGISTERED");
    } else if (spec.key === "partnerPlaces") {
      set("id", "partner-1");
      set("name", "Partenaire test");
    } else if (spec.key === "healthAlerts") {
      set("id", "alert-1");
      set("catId", "cat-1");
      set("status", "OPEN");
      set("lookbackDays", "30");
      set("declaredAt", "2020-01-01");
    } else if (spec.key === "catEvents") {
      set("id", "event-1");
      set("catId", "cat-1");
      set("type", "REGISTERED");
      set("date", "2020-01-02");
      if (schema === 7) {
        set("label", "Arrivée personnalisée");
      }
    } else if (spec.key === "tasks") {
      set("id", "task-1");
      set("catId", "cat-1");
      set("type", "Vaccin");
      set("status", "OPEN");
    } else if (spec.key === "followUps") {
      set("id", "follow-up-1");
      set("catId", "cat-1");
      set("adoptionId", "adoption-1");
      set("requestedAt", "2020-01-03");
    } else if (schema === 7 && spec.key === "sponsorships") {
      set("id", "sponsor-1");
      set("catId", "cat-1");
      set("monthlyAmount", "25");
      set("paymentNotes", "Virement mensuel");
      set("startDate", "2020-01-01");
    }
    await writeFile(join(directory, spec.file), `${header}\n${row.map(csvCell).join(",")}\n`);
  }
  return directory;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
