import { assertIsoDate, isValidIcad } from "../../domain/dataset";
import type { LegacySchema, LegacyTables } from "./legacyFormat";

export interface MigratedLegacyDataset {
  manifest: {
    modelVersion: 1;
    schemaVersion: 8;
    datasetId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    settings: { enabledSpecies: ["cat"] };
  };
  tables: Map<string, Array<Record<string, string>>>;
  counts: Record<string, number>;
}

/** Pure schema-3/schema-7 mapping. It deliberately does not repair statuses,
 * derive ages, or update the original timestamps. */
export function mapLegacyDataset(
  legacy: LegacyTables,
  manifest: Record<string, unknown>,
  schemaVersion: LegacySchema,
): MigratedLegacyDataset {
  if (
    typeof manifest.datasetId !== "string" ||
    typeof manifest.name !== "string" ||
    typeof manifest.createdAt !== "string" ||
    typeof manifest.updatedAt !== "string"
  ) {
    throw new Error("Le manifeste historique ne contient pas les métadonnées requises.");
  }
  const mapped = new Map<string, Array<Record<string, string>>>();
  validateLegacyValues(legacy);
  for (const [key, rows] of legacy) {
    const targetKey =
      key === "cats"
        ? "animals"
        : key === "catEvents"
          ? "animalEvents"
          : key === "adoptionDayCats"
            ? "adoptionDayAnimals"
            : key;
    mapped.set(
      targetKey,
      rows.map((row) => mapRow(key, row, schemaVersion)),
    );
  }
  const counts = Object.fromEntries([...mapped.entries()].map(([key, rows]) => [key, rows.length]));
  validateMappedLegacyDataset(mapped);
  return {
    manifest: {
      modelVersion: 1,
      schemaVersion: 8,
      datasetId: manifest.datasetId,
      name: manifest.name,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      settings: { enabledSpecies: ["cat"] },
    },
    tables: mapped,
    counts,
  };
}

/** Validates the mapped records without filesystem access. This is shared by
 * the read-only dry-run and the consented conversion before files are staged. */
export function validateMappedLegacyDataset(
  tables: Map<string, Array<Record<string, string>>>,
): void {
  const ids = new Map<string, Set<string>>();
  for (const [table, rows] of tables) {
    if (!rows.some((row) => "id" in row)) {
      continue;
    }
    const values = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (!row.id || values.has(row.id)) {
        throw new Error(
          `${table}.csv ligne ${index + 2} : identifiant vide ou dupliqué (${row.id ?? ""}).`,
        );
      }
      values.add(row.id);
    }
    ids.set(table, values);
  }
  const animals = ids.get("animals") ?? new Set<string>();
  const families = ids.get("families") ?? new Set<string>();
  const adopters = ids.get("adopters") ?? new Set<string>();
  const zones = ids.get("refugeZones") ?? new Set<string>();
  const adoptions = ids.get("adoptions") ?? new Set<string>();
  const adoptionDays = ids.get("adoptionDays") ?? new Set<string>();
  const refs: Array<{ table: string; field: string; targets: Set<string>; optional?: boolean }> = [
    { table: "fosterFamilyHolidays", field: "familyId", targets: families },
    { table: "fosterPlacements", field: "animalId", targets: animals },
    { table: "fosterPlacements", field: "familyId", targets: families },
    { table: "refugeStays", field: "animalId", targets: animals },
    { table: "refugeStays", field: "zoneId", targets: zones },
    { table: "adoptions", field: "animalId", targets: animals },
    { table: "adoptions", field: "adopterId", targets: adopters },
    { table: "adoptions", field: "adoptionDayId", targets: adoptionDays, optional: true },
    { table: "adoptionDayAnimals", field: "animalId", targets: animals },
    { table: "adoptionDayAnimals", field: "adoptionDayId", targets: adoptionDays },
    { table: "adoptionDayAnimals", field: "adopterId", targets: adopters, optional: true },
    { table: "healthAlerts", field: "animalId", targets: animals },
    { table: "animalEvents", field: "animalId", targets: animals },
    { table: "tasks", field: "animalId", targets: animals },
    { table: "followUps", field: "animalId", targets: animals },
    { table: "followUps", field: "adoptionId", targets: adoptions, optional: true },
    { table: "sponsorships", field: "animalId", targets: animals },
  ];
  for (const ref of refs) {
    for (const [index, row] of (tables.get(ref.table) ?? []).entries()) {
      const value = row[ref.field] ?? "";
      if (!value && ref.optional) {
        continue;
      }
      if (!value || !ref.targets.has(value)) {
        throw new Error(
          `${ref.table}.csv ligne ${index + 2} : ${ref.field} pointe vers un enregistrement absent (${value}).`,
        );
      }
    }
  }
}

function mapRow(
  key: string,
  source: Record<string, string>,
  schemaVersion: LegacySchema,
): Record<string, string> {
  const row = { ...source };
  if (key === "cats") {
    if (schemaVersion === 3) {
      Object.assign(row, {
        description: "",
        photo: "",
        okWithCats: "",
        okWithDogs: "",
        okWithChildren: "",
        medications: "",
        medicationSchedule: "",
        medicationEndDate: "",
        vaccines: "",
        deworming: "",
        antiFlea: "",
      });
    }
    const cat = triState(row.okWithCats);
    const dog = triState(row.okWithDogs);
    const id = row.identificationNumber.trim();
    Object.assign(row, {
      speciesId: "cat",
      speciesData: JSON.stringify({ breed: "" }),
      identificationScheme: !id ? "NONE" : isValidIcad(id) ? "ICAD" : "OTHER",
      compatibilityBySpecies: JSON.stringify({ cat, dog }),
    });
    delete row.okWithCats;
    delete row.okWithDogs;
    return row;
  }
  if (key === "families") {
    const profiles = row.acceptedProfiles === "" ? [] : row.acceptedProfiles.split("|");
    row.acceptanceRules = JSON.stringify({ cat: { profiles } });
    delete row.acceptedProfiles;
  }
  if (key === "refugeZones") {
    row.allowedSpecies = JSON.stringify(["cat"]);
  }
  if (key === "catEvents" && schemaVersion === 3) {
    row.label = "";
  }
  for (const field of ["catId", "catIds"]) {
    if (field in row) {
      const value = row[field];
      delete row[field];
      row[field === "catId" ? "animalId" : "animalIds"] =
        field === "catId" ? value : value.split("|").join("|");
    }
  }
  return row;
}

function triState(value: string | undefined): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === undefined || value === "") {
    return null;
  }
  throw new Error(`Valeur historique de compatibilité inconnue : ${value}.`);
}

function validateLegacyValues(tables: LegacyTables): void {
  const requiredDates: Record<string, readonly string[]> = {
    cats: ["intakeDate"],
    fosterFamilyHolidays: ["startDate", "endDate"],
    fosterPlacements: ["startDate"],
    refugeStays: ["startDate"],
    adoptions: ["adoptionDate"],
    adoptionDays: ["startDate", "endDate"],
    healthAlerts: ["declaredAt"],
    catEvents: ["date"],
    followUps: ["requestedAt"],
    sponsorships: ["startDate"],
  };
  const numericFields: Record<string, Record<string, { min: number; max?: number }>> = {
    families: { maxCapacity: { min: 1 } },
    healthAlerts: { lookbackDays: { min: 0, max: 365 } },
    sponsorships: { monthlyAmount: { min: Number.MIN_VALUE } },
  };
  for (const [table, rows] of tables) {
    for (const [index, row] of rows.entries()) {
      for (const field of requiredDates[table] ?? []) {
        if (!row[field]) {
          throw new Error(`${table}.csv ligne ${index + 2} : ${field} obligatoire absent.`);
        }
      }
      for (const field of Object.keys(row)) {
        if (
          !row[field] ||
          !/(?:Date|At)$/.test(field) ||
          ["createdAt", "updatedAt"].includes(field)
        ) {
          continue;
        }
        try {
          assertIsoDate(row[field]!, `${table}.csv ligne ${index + 2} : ${field}`);
        } catch {
          throw new Error(
            `${table}.csv ligne ${index + 2} : date ${field} invalide (${row[field]}).`,
          );
        }
      }
      for (const [field, range] of Object.entries(numericFields[table] ?? {})) {
        const value = row[field];
        if (!value) {
          continue;
        }
        const number = Number(value);
        if (
          !Number.isFinite(number) ||
          (table !== "sponsorships" && !Number.isInteger(number)) ||
          number < range.min ||
          (range.max !== undefined && number > range.max)
        ) {
          throw new Error(
            `${table}.csv ligne ${index + 2} : valeur numérique ${field} invalide (${value}).`,
          );
        }
      }
    }
  }
  const enums: Record<string, Record<string, readonly string[]>> = {
    cats: {
      sex: ["F", "M", "UNKNOWN"],
      profile: ["BOTTLE_KITTEN", "KITTEN", "ADULT", "SENIOR", "SPECIAL_NEEDS"],
      sterilizationStatus: ["DONE", "TODO", "UNKNOWN"],
      adoptionEligibility: ["ELIGIBLE", "ON_HOLD", "INELIGIBLE"],
      healthStatus: ["HEALTHY", "SICK", "RECOVERED"],
    },
    adoptions: { status: ["ACTIVE", "RETURNED"] },
    adoptionDays: { status: ["PLANNED", "ACTIVE", "CLOSED"] },
    adoptionDayCats: { status: ["REGISTERED", "ATTENDED", "ADOPTED", "WITHDRAWN"] },
    healthAlerts: { status: ["OPEN", "RESOLVED"] },
    catEvents: {
      type: [
        "REGISTERED",
        "PLACED_IN_FOSTER",
        "FOSTER_ENDED",
        "SENT_TO_REFUGE",
        "REFUGE_ZONE_CHANGED",
        "LEFT_REFUGE",
        "ADOPTED",
        "RETURNED",
        "LOST",
        "DECEASED",
        "TRANSFERRED",
        "DECLARED_SICK",
        "RECOVERED",
        "NOTE_ADDED",
      ],
    },
    tasks: { status: ["OPEN", "DONE", "CANCELLED"] },
  };
  for (const [table, fields] of Object.entries(enums)) {
    for (const [index, row] of (tables.get(table) ?? []).entries()) {
      for (const [field, accepted] of Object.entries(fields)) {
        const value = row[field];
        if (value && !accepted.includes(value)) {
          throw new Error(`${table}.csv ligne ${index + 2} : valeur ${field} inconnue (${value}).`);
        }
      }
    }
  }
  for (const [index, row] of (tables.get("cats") ?? []).entries()) {
    for (const field of ["okWithCats", "okWithDogs", "okWithChildren"]) {
      const value = row[field];
      if (value && value !== "true" && value !== "false") {
        throw new Error(`cats.csv ligne ${index + 2} : valeur ${field} inconnue (${value}).`);
      }
    }
  }
  for (const [index, row] of (tables.get("families") ?? []).entries()) {
    const profiles = row.acceptedProfiles === "" ? [] : row.acceptedProfiles.split("|");
    const accepted = ["BOTTLE_KITTEN", "KITTEN", "ADULT", "SENIOR", "SPECIAL_NEEDS"];
    if (profiles.some((profile) => !accepted.includes(profile))) {
      throw new Error(`families.csv ligne ${index + 2} : profil accepté inconnu.`);
    }
  }
}
