import { access, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createEmptyDataset, CURRENT_SCHEMA_VERSION, validateDatasetReferences } from "../domain/dataset";
import type { CatProfile, Dataset } from "../shared/types";
import { csvToRecords, stringifyCsv } from "./csv";

type DatasetListKey = "cats" | "families" | "adopters" | "fosterFamilyHolidays" | "fosterPlacements" |
  "refugeZones" | "refugeStays" | "adoptions" | "adoptionDays" | "adoptionDayCats" | "healthAlerts" |
  "partnerPlaces" | "catEvents" | "tasks" | "followUps";
interface TableDefinition { key: DatasetListKey; file: string; headers: string[]; }

const TABLES: TableDefinition[] = [
  { key: "cats", file: "cats.csv", headers: ["id", "name", "identificationNumber", "birthDate", "sex", "profile", "sterilizationStatus", "adoptionEligibility", "adoptionBlockedReason", "healthStatus", "intakeDate", "notes", "createdAt", "updatedAt"] },
  { key: "families", file: "families.csv", headers: ["id", "label", "courtesyTitle", "firstName", "lastName", "email", "phone", "address", "maxCapacity", "acceptedProfiles", "notes", "createdAt", "updatedAt"] },
  { key: "adopters", file: "adopters.csv", headers: ["id", "label", "courtesyTitle", "firstName", "lastName", "email", "phone", "address", "notes", "createdAt", "updatedAt"] },
  { key: "fosterFamilyHolidays", file: "foster_family_holidays.csv", headers: ["id", "familyId", "startDate", "endDate", "notes", "createdAt"] },
  { key: "fosterPlacements", file: "foster_placements.csv", headers: ["id", "catId", "familyId", "startDate", "endDate", "outcome", "overrideReason", "notes", "createdAt", "updatedAt"] },
  { key: "refugeZones", file: "refuge_zones.csv", headers: ["id", "name", "description", "createdAt", "updatedAt"] },
  { key: "refugeStays", file: "refuge_stays.csv", headers: ["id", "catId", "zoneId", "startDate", "endDate", "reason", "notes", "createdAt", "updatedAt"] },
  { key: "adoptions", file: "adoptions.csv", headers: ["id", "groupId", "catId", "adopterId", "adoptionDate", "partner", "adoptionDayId", "status", "endedAt", "notes", "createdAt", "updatedAt"] },
  { key: "adoptionDays", file: "adoption_days.csv", headers: ["id", "name", "startDate", "endDate", "partner", "location", "status", "notes", "createdAt", "updatedAt"] },
  { key: "adoptionDayCats", file: "adoption_day_cats.csv", headers: ["id", "adoptionDayId", "catId", "status", "overrideReason", "notes", "adopterId", "bookedAt", "createdAt", "updatedAt"] },
  { key: "partnerPlaces", file: "partner_places.csv", headers: ["id", "name", "address", "notes", "createdAt", "updatedAt"] },
  { key: "healthAlerts", file: "health_alerts.csv", headers: ["id", "catId", "disease", "declaredAt", "lookbackDays", "status", "resolvedAt", "notes", "createdAt", "updatedAt"] },
  { key: "catEvents", file: "cat_events.csv", headers: ["id", "catId", "type", "date", "notes", "createdAt"] },
  { key: "tasks", file: "tasks.csv", headers: ["id", "catId", "type", "status", "dueDate", "completedAt", "notes", "createdAt", "updatedAt"] },
  { key: "followUps", file: "follow_ups.csv", headers: ["id", "catId", "adoptionId", "requestedAt", "response", "lastNewsAt", "createdAt", "updatedAt"] }
];

interface TransactionFile { temporary: string; target: string; }

export class DatasetRepository {
  private migrationPerformed = false;
  private constructor(public readonly directory: string) {}

  static async open(directory: string): Promise<{ repository: DatasetRepository; dataset: Dataset }> {
    const repository = new DatasetRepository(directory);
    await mkdir(directory, { recursive: true });
    await repository.recoverTransaction();
    if (!(await exists(join(directory, "dataset.json")))) {
      const dataset = createEmptyDataset(); await repository.save(dataset, false); return { repository, dataset };
    }
    const dataset = await repository.load();
    if (repository.migrationPerformed) await repository.save(dataset, true);
    return { repository, dataset };
  }

  async load(): Promise<Dataset> {
    const manifest = JSON.parse(await readFile(join(this.directory, "dataset.json"), "utf8")) as Pick<Dataset, "schemaVersion" | "datasetId" | "name" | "createdAt" | "updatedAt">;
    if (manifest.schemaVersion > CURRENT_SCHEMA_VERSION) throw new Error("Ce jeu de données a été créé par une version plus récente de l'application.");
    if (manifest.schemaVersion < 2) { this.migrationPerformed = true; return this.loadVersionOne(manifest); }
    if (manifest.schemaVersion < CURRENT_SCHEMA_VERSION) this.migrationPerformed = true;

    const dataset = emptyFromManifest(manifest);
    for (const table of TABLES) {
      const records = await this.readOptionalTable(table.file);
      if (table.key === "cats") dataset.cats = records.map(normalizeCat) as Dataset["cats"];
      else if (table.key === "families") dataset.families = records.map((record) => ({ ...record, maxCapacity: Number(record.maxCapacity || 1), acceptedProfiles: splitProfiles(record.acceptedProfiles) })) as Dataset["families"];
      else if (table.key === "healthAlerts") dataset.healthAlerts = records.map((record) => ({ ...record, lookbackDays: Number(record.lookbackDays || 0) })) as Dataset["healthAlerts"];
      else if (table.key === "adoptionDayCats") dataset.adoptionDayCats = records.map((record) => ({ ...record, adopterId: record.adopterId || "", bookedAt: record.bookedAt || "" })) as Dataset["adoptionDayCats"];
      else (dataset[table.key] as unknown[]) = records as unknown[];
    }
    this.assertReferences(dataset); return dataset;
  }

  private async loadVersionOne(manifest: Pick<Dataset, "schemaVersion" | "datasetId" | "name" | "createdAt" | "updatedAt">): Promise<Dataset> {
    const dataset = emptyFromManifest({ ...manifest, schemaVersion: CURRENT_SCHEMA_VERSION });
    const oldCats = await this.readOptionalTable("cats.csv");
    const oldFamilies = await this.readOptionalTable("families.csv");
    dataset.cats = oldCats.map(normalizeCat) as Dataset["cats"];
    const allProfiles: CatProfile[] = ["BOTTLE_KITTEN", "KITTEN", "ADULT", "SENIOR", "SPECIAL_NEEDS"];
    for (const record of oldFamilies) {
      const roles = (record.roles || "").split("|");
      const contact = { id: record.id, label: record.label, courtesyTitle: record.courtesyTitle, firstName: record.firstName, lastName: record.lastName, email: record.email, phone: record.phone, address: record.address, notes: record.notes, createdAt: record.createdAt, updatedAt: record.updatedAt };
      if (roles.includes("FOSTER")) dataset.families.push({ ...contact, maxCapacity: 5, acceptedProfiles: allProfiles });
      if (roles.includes("ADOPTER")) dataset.adopters.push(contact);
    }
    dataset.fosterPlacements = (await this.readOptionalTable("foster_placements.csv")).map((record) => ({ ...record, overrideReason: "" })) as Dataset["fosterPlacements"];
    dataset.adoptions = (await this.readOptionalTable("adoptions.csv")).map((record) => ({ ...record, adopterId: record.familyId, adoptionDayId: "" })) as Dataset["adoptions"];
    dataset.catEvents = await this.readOptionalTable("cat_events.csv") as unknown as Dataset["catEvents"];
    dataset.tasks = await this.readOptionalTable("tasks.csv") as unknown as Dataset["tasks"];
    dataset.followUps = await this.readOptionalTable("follow_ups.csv") as unknown as Dataset["followUps"];
    const missingAdopterIds = new Set(dataset.adoptions.map((adoption) => adoption.adopterId).filter((adopterId) => !dataset.adopters.some((adopter) => adopter.id === adopterId)));
    for (const adopterId of missingAdopterIds) {
      const old = oldFamilies.find((record) => record.id === adopterId);
      if (old) dataset.adopters.push({ id: old.id, label: old.label, courtesyTitle: old.courtesyTitle, firstName: old.firstName, lastName: old.lastName, email: old.email, phone: old.phone, address: old.address, notes: old.notes, createdAt: old.createdAt, updatedAt: old.updatedAt });
    }
    this.assertReferences(dataset); return dataset;
  }

  async save(dataset: Dataset, createBackup = true): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    if (createBackup) await this.backupCurrentFiles();
    const transactionId = crypto.randomUUID();
    const files: TransactionFile[] = [];
    for (const table of TABLES) {
      const target = join(this.directory, table.file); const temporary = `${target}.${transactionId}.tmp`;
      const records = (dataset[table.key] as unknown as Array<Record<string, unknown>>).map((record) =>
        table.key === "families" ? { ...record, acceptedProfiles: (record.acceptedProfiles as string[]).join("|") } : record
      );
      await writeFile(temporary, stringifyCsv(table.headers, records), "utf8"); files.push({ temporary, target });
    }
    const manifestTarget = join(this.directory, "dataset.json"); const manifestTemporary = `${manifestTarget}.${transactionId}.tmp`;
    const manifest = { schemaVersion: dataset.schemaVersion, datasetId: dataset.datasetId, name: dataset.name, createdAt: dataset.createdAt, updatedAt: dataset.updatedAt };
    await writeFile(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); files.push({ temporary: manifestTemporary, target: manifestTarget });
    const journalPath = join(this.directory, ".transaction.json");
    await writeFile(journalPath, JSON.stringify({ id: transactionId, files }), "utf8");
    for (const file of files) await rename(file.temporary, file.target);
    await rm(journalPath, { force: true });
  }

  private async readOptionalTable(file: string): Promise<Array<Record<string, string>>> {
    const path = join(this.directory, file); return await exists(path) ? csvToRecords(await readFile(path, "utf8")) : [];
  }
  private assertReferences(dataset: Dataset): void {
    const errors = validateDatasetReferences(dataset); if (errors.length) throw new Error(`Jeu de données incohérent : ${errors.join(" ")}`);
  }
  private async recoverTransaction(): Promise<void> {
    const journalPath = join(this.directory, ".transaction.json"); if (!(await exists(journalPath))) return;
    const transaction = JSON.parse(await readFile(journalPath, "utf8")) as { files: TransactionFile[] };
    for (const file of transaction.files) if (await exists(file.temporary)) await rename(file.temporary, file.target);
    await rm(journalPath, { force: true });
  }
  private async backupCurrentFiles(): Promise<void> {
    if (!(await exists(join(this.directory, "dataset.json")))) return;
    const backup = join(this.directory, "backups", new Date().toISOString().replace(/[:.]/g, "-")); await mkdir(backup, { recursive: true });
    for (const file of ["dataset.json", ...new Set([...TABLES.map((table) => table.file), "families.csv"])]) {
      const source = join(this.directory, file); if (await exists(source)) await copyFile(source, join(backup, file));
    }
    const root = join(this.directory, "backups");
    const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const old of directories.slice(0, -20)) await rm(join(root, old), { recursive: true });
  }
}

function emptyFromManifest(manifest: Pick<Dataset, "schemaVersion" | "datasetId" | "name" | "createdAt" | "updatedAt">): Dataset {
  const base = createEmptyDataset(manifest.name);
  return { ...base, ...manifest, schemaVersion: CURRENT_SCHEMA_VERSION, refugeZones: base.refugeZones };
}
function normalizeCat(record: Record<string, string>) {
  return { ...record, sex: record.sex || "UNKNOWN", profile: record.profile || "ADULT", sterilizationStatus: record.sterilizationStatus || "UNKNOWN", adoptionEligibility: record.adoptionEligibility || "ELIGIBLE", adoptionBlockedReason: record.adoptionBlockedReason || "", healthStatus: record.healthStatus || "HEALTHY" };
}
function splitProfiles(value: string): CatProfile[] { return (value || "ADULT").split("|").filter(Boolean) as CatProfile[]; }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
