import type { CsvRecord } from "../../core/csv";
import type {
  Adopter,
  Adoption,
  AdoptionDay,
  AdoptionDayAnimal,
  Animal,
  AnimalEvent,
  AnimalEventType,
  Dataset,
  Family,
  FollowUp,
  FosterFamilyHoliday,
  FosterPlacement,
  HealthAlert,
  PartnerPlace,
  RefugeStay,
  RefugeZone,
  Sponsorship,
  Task,
} from "../../core/types";
import {
  getSpeciesDefinition,
  isSpeciesId,
  registeredSpecies,
  validateSpeciesData,
} from "../../domain/species/registry";

export type StoredListKey = Exclude<
  keyof Dataset,
  "modelVersion" | "schemaVersion" | "datasetId" | "name" | "createdAt" | "updatedAt" | "settings"
>;
export type CsvTableRecord = Record<string, string>;
export type CsvRow = CsvRecord;

function assertNever(value: never): never {
  throw new Error(`Unsupported dataset table: ${value}`);
}

const EVENT_TYPES: readonly AnimalEventType[] = [
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
];

function value(record: CsvTableRecord, key: string): string {
  return record[key] ?? "";
}
function enumValue<T extends string>(raw: string, options: readonly T[], fallback: T): T {
  const match = options.find((option) => option === raw);
  if (!match && raw) {
    throw new Error(`Valeur non prise en charge : ${raw}.`);
  }
  return match ?? fallback;
}
function optionalBoolean(raw: string): boolean | null {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return null;
}
function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} contient un JSON invalide.`);
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseCompatibility(raw: string): Animal["compatibilityBySpecies"] {
  const parsed = parseJson(raw, "compatibilityBySpecies");
  if (!isRecord(parsed)) {
    throw new Error("La compatibilité par espèce est invalide.");
  }
  const result: Animal["compatibilityBySpecies"] = {};
  for (const [species, value] of Object.entries(parsed)) {
    if (!isSpeciesId(species) || (value !== true && value !== false && value !== null)) {
      throw new Error("La compatibilité par espèce contient une valeur invalide.");
    }
    result[species] = value;
  }
  return result;
}
export function parseProfiles(raw: string): Animal["profile"][] {
  const registeredProfileIds = registeredSpecies.flatMap((species) =>
    species.profiles.map((profile) => profile.id),
  );
  return (raw || "ADULT")
    .split("|")
    .filter((profile): profile is Animal["profile"] =>
      registeredProfileIds.some((candidate) => candidate === profile),
    );
}

export function parseAnimal(record: CsvTableRecord): Animal {
  const rawSpeciesId = value(record, "speciesId");
  if (!isSpeciesId(rawSpeciesId)) {
    throw new Error(
      `Espèce inconnue pour l'animal ${value(record, "id")}: ${rawSpeciesId || "vide"}.`,
    );
  }
  const speciesData = validateSpeciesData(
    rawSpeciesId,
    parseJson(value(record, "speciesData"), `speciesData de ${value(record, "id")}`),
  );
  const scheme = value(record, "identificationScheme");
  if (scheme !== "ICAD" && scheme !== "OTHER" && scheme !== "NONE") {
    throw new Error(`Schéma d'identification invalide pour ${value(record, "id")}.`);
  }
  const speciesDefinition = getSpeciesDefinition(rawSpeciesId);
  const rawProfile = value(record, "profile") || speciesDefinition.defaultProfile;
  const profile = speciesDefinition.profiles.find((candidate) => candidate.id === rawProfile);
  if (!profile) {
    throw new Error(`Profil ${rawProfile} incompatible avec l'espèce ${rawSpeciesId}.`);
  }
  return {
    id: value(record, "id"),
    speciesId: rawSpeciesId,
    speciesData,
    identificationScheme: scheme,
    name: value(record, "name"),
    identificationNumber: value(record, "identificationNumber"),
    birthDate: value(record, "birthDate"),
    sex: enumValue(value(record, "sex"), ["F", "M", "UNKNOWN"], "UNKNOWN"),
    profile: profile.id,
    sterilizationStatus: enumValue(
      value(record, "sterilizationStatus"),
      ["DONE", "TODO", "UNKNOWN"],
      "UNKNOWN",
    ),
    adoptionEligibility: enumValue(
      value(record, "adoptionEligibility"),
      ["ELIGIBLE", "ON_HOLD", "INELIGIBLE", "UNKNOWN"],
      "ELIGIBLE",
    ),
    adoptionBlockedReason: value(record, "adoptionBlockedReason"),
    healthStatus: enumValue(
      value(record, "healthStatus"),
      ["HEALTHY", "SICK", "RECOVERED"],
      "HEALTHY",
    ),
    intakeDate: value(record, "intakeDate"),
    notes: value(record, "notes"),
    description: value(record, "description"),
    photo: value(record, "photo"),
    compatibilityBySpecies: parseCompatibility(value(record, "compatibilityBySpecies")),
    okWithChildren: optionalBoolean(value(record, "okWithChildren")),
    medications: value(record, "medications"),
    medicationSchedule: value(record, "medicationSchedule"),
    medicationEndDate: value(record, "medicationEndDate"),
    vaccines: value(record, "vaccines"),
    deworming: value(record, "deworming"),
    antiFlea: value(record, "antiFlea"),
    createdAt: value(record, "createdAt"),
    updatedAt: value(record, "updatedAt"),
  };
}
export function parseFamily(record: CsvTableRecord): Family {
  const acceptanceRules = parseJson(
    value(record, "acceptanceRules"),
    `acceptanceRules de ${value(record, "id")}`,
  );
  if (
    !isRecord(acceptanceRules) ||
    Object.keys(acceptanceRules).some((species) => !isSpeciesId(species))
  ) {
    throw new Error("Règles d'accueil de famille invalides.");
  }
  for (const [species, rawRule] of Object.entries(acceptanceRules)) {
    if (!isSpeciesId(species) || !isRecord(rawRule) || !Array.isArray(rawRule.profiles)) {
      throw new Error("Règles d'accueil de famille invalides.");
    }
    const supportedProfiles = getSpeciesDefinition(species).profiles.map(
      (candidate) => candidate.id,
    );
    if (
      !rawRule.profiles.every(
        (profile) => typeof profile === "string" && supportedProfiles.some((id) => id === profile),
      )
    ) {
      throw new Error(`Profil d'accueil invalide pour ${species}.`);
    }
    if (
      rawRule.sizes !== undefined &&
      (!Array.isArray(rawRule.sizes) ||
        species !== "dog" ||
        !rawRule.sizes.every((size) => ["SMALL", "MEDIUM", "LARGE"].includes(String(size))))
    ) {
      throw new Error(`Taille d'accueil invalide pour ${species}.`);
    }
    if (
      rawRule.maxCapacity !== undefined &&
      (!Number.isInteger(rawRule.maxCapacity) || (rawRule.maxCapacity as number) < 1)
    ) {
      throw new Error(`Capacité invalide pour ${species}.`);
    }
  }
  return {
    id: value(record, "id"),
    label: value(record, "label"),
    courtesyTitle: value(record, "courtesyTitle"),
    firstName: value(record, "firstName"),
    lastName: value(record, "lastName"),
    email: value(record, "email"),
    phone: value(record, "phone"),
    address: value(record, "address"),
    maxCapacity: Number(value(record, "maxCapacity") || 1),
    acceptanceRules: acceptanceRules as Family["acceptanceRules"],
    notes: value(record, "notes"),
    createdAt: value(record, "createdAt"),
    updatedAt: value(record, "updatedAt"),
  };
}
export function parseAdopter(record: CsvTableRecord): Adopter {
  return {
    id: value(record, "id"),
    label: value(record, "label"),
    courtesyTitle: value(record, "courtesyTitle"),
    firstName: value(record, "firstName"),
    lastName: value(record, "lastName"),
    email: value(record, "email"),
    phone: value(record, "phone"),
    address: value(record, "address"),
    notes: value(record, "notes"),
    createdAt: value(record, "createdAt"),
    updatedAt: value(record, "updatedAt"),
  };
}
export function parseFosterFamilyHoliday(r: CsvTableRecord): FosterFamilyHoliday {
  return {
    id: value(r, "id"),
    familyId: value(r, "familyId"),
    startDate: value(r, "startDate"),
    endDate: value(r, "endDate"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
  };
}
export function parseFosterPlacement(r: CsvTableRecord): FosterPlacement {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    familyId: value(r, "familyId"),
    startDate: value(r, "startDate"),
    endDate: value(r, "endDate"),
    outcome: value(r, "outcome"),
    overrideReason: value(r, "overrideReason"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseRefugeZone(r: CsvTableRecord): RefugeZone {
  const allowedSpecies = parseJson(
    value(r, "allowedSpecies"),
    `allowedSpecies de ${value(r, "id")}`,
  );
  if (
    allowedSpecies !== null &&
    (!Array.isArray(allowedSpecies) || !allowedSpecies.every(isSpeciesId))
  ) {
    throw new Error("Espèces autorisées dans la zone invalides.");
  }
  return {
    id: value(r, "id"),
    name: value(r, "name"),
    description: value(r, "description"),
    allowedSpecies: allowedSpecies as RefugeZone["allowedSpecies"],
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseRefugeStay(r: CsvTableRecord): RefugeStay {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    zoneId: value(r, "zoneId"),
    startDate: value(r, "startDate"),
    endDate: value(r, "endDate"),
    reason: value(r, "reason"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseAdoption(r: CsvTableRecord): Adoption {
  return {
    id: value(r, "id"),
    groupId: value(r, "groupId"),
    animalId: value(r, "animalId"),
    adopterId: value(r, "adopterId"),
    adoptionDate: value(r, "adoptionDate"),
    partner: value(r, "partner"),
    adoptionDayId: value(r, "adoptionDayId"),
    status: enumValue(value(r, "status"), ["ACTIVE", "RETURNED"], "ACTIVE"),
    endedAt: value(r, "endedAt"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseAdoptionDay(r: CsvTableRecord): AdoptionDay {
  return {
    id: value(r, "id"),
    name: value(r, "name"),
    startDate: value(r, "startDate"),
    endDate: value(r, "endDate"),
    partner: value(r, "partner"),
    location: value(r, "location"),
    status: enumValue(value(r, "status"), ["PLANNED", "ACTIVE", "CLOSED"], "PLANNED"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseAdoptionDayAnimal(r: CsvTableRecord): AdoptionDayAnimal {
  return {
    id: value(r, "id"),
    adoptionDayId: value(r, "adoptionDayId"),
    animalId: value(r, "animalId"),
    status: enumValue(
      value(r, "status"),
      ["REGISTERED", "ATTENDED", "ADOPTED", "WITHDRAWN"],
      "REGISTERED",
    ),
    overrideReason: value(r, "overrideReason"),
    notes: value(r, "notes"),
    adopterId: value(r, "adopterId"),
    bookedAt: value(r, "bookedAt"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parsePartnerPlace(r: CsvTableRecord): PartnerPlace {
  return {
    id: value(r, "id"),
    name: value(r, "name"),
    address: value(r, "address"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseHealthAlert(r: CsvTableRecord): HealthAlert {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    disease: value(r, "disease"),
    declaredAt: value(r, "declaredAt"),
    lookbackDays: Number(value(r, "lookbackDays") || 0),
    status: enumValue(value(r, "status"), ["OPEN", "RESOLVED"], "OPEN"),
    resolvedAt: value(r, "resolvedAt"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseAnimalEvent(r: CsvTableRecord): AnimalEvent {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    type: enumValue(value(r, "type"), EVENT_TYPES, "REGISTERED"),
    date: value(r, "date"),
    label: value(r, "label"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
  };
}
export function parseTask(r: CsvTableRecord): Task {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    type: value(r, "type"),
    status: enumValue(value(r, "status"), ["OPEN", "DONE", "CANCELLED"], "OPEN"),
    dueDate: value(r, "dueDate"),
    completedAt: value(r, "completedAt"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseFollowUp(r: CsvTableRecord): FollowUp {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    adoptionId: value(r, "adoptionId"),
    requestedAt: value(r, "requestedAt"),
    response: value(r, "response"),
    lastNewsAt: value(r, "lastNewsAt"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}
export function parseSponsorship(r: CsvTableRecord): Sponsorship {
  return {
    id: value(r, "id"),
    animalId: value(r, "animalId"),
    firstName: value(r, "firstName"),
    lastName: value(r, "lastName"),
    email: value(r, "email"),
    monthlyAmount: Number(value(r, "monthlyAmount") || 0),
    startDate: value(r, "startDate"),
    endDate: value(r, "endDate"),
    paymentNotes: value(r, "paymentNotes"),
    notes: value(r, "notes"),
    createdAt: value(r, "createdAt"),
    updatedAt: value(r, "updatedAt"),
  };
}

export function loadDatasetTable(
  key: StoredListKey,
  dataset: Dataset,
  rows: CsvTableRecord[],
): void {
  switch (key) {
    case "animals":
      dataset.animals = rows.map(parseAnimal);
      break;
    case "families":
      dataset.families = rows.map(parseFamily);
      break;
    case "adopters":
      dataset.adopters = rows.map(parseAdopter);
      break;
    case "fosterFamilyHolidays":
      dataset.fosterFamilyHolidays = rows.map(parseFosterFamilyHoliday);
      break;
    case "fosterPlacements":
      dataset.fosterPlacements = rows.map(parseFosterPlacement);
      break;
    case "refugeZones":
      dataset.refugeZones = rows.map(parseRefugeZone);
      break;
    case "refugeStays":
      dataset.refugeStays = rows.map(parseRefugeStay);
      break;
    case "adoptions":
      dataset.adoptions = rows.map(parseAdoption);
      break;
    case "adoptionDays":
      dataset.adoptionDays = rows.map(parseAdoptionDay);
      break;
    case "adoptionDayAnimals":
      dataset.adoptionDayAnimals = rows.map(parseAdoptionDayAnimal);
      break;
    case "partnerPlaces":
      dataset.partnerPlaces = rows.map(parsePartnerPlace);
      break;
    case "healthAlerts":
      dataset.healthAlerts = rows.map(parseHealthAlert);
      break;
    case "animalEvents":
      dataset.animalEvents = rows.map(parseAnimalEvent);
      break;
    case "tasks":
      dataset.tasks = rows.map(parseTask);
      break;
    case "followUps":
      dataset.followUps = rows.map(parseFollowUp);
      break;
    case "sponsorships":
      dataset.sponsorships = rows.map(parseSponsorship);
      break;
    default:
      assertNever(key);
  }
}

export function serializeDatasetTable(key: StoredListKey, dataset: Dataset): CsvRow[] {
  switch (key) {
    case "animals":
      return dataset.animals.map((row) => ({
        ...row,
        speciesData: JSON.stringify(row.speciesData),
        compatibilityBySpecies: JSON.stringify(row.compatibilityBySpecies),
      }));
    case "families":
      return dataset.families.map((row) => ({
        ...row,
        acceptanceRules: JSON.stringify(row.acceptanceRules ?? {}),
      }));
    case "adopters":
      return dataset.adopters.map((row) => ({ ...row }));
    case "fosterFamilyHolidays":
      return dataset.fosterFamilyHolidays.map((row) => ({ ...row }));
    case "fosterPlacements":
      return dataset.fosterPlacements.map((row) => ({ ...row }));
    case "refugeZones":
      return dataset.refugeZones.map((row) => ({
        ...row,
        allowedSpecies: JSON.stringify(row.allowedSpecies),
      }));
    case "refugeStays":
      return dataset.refugeStays.map((row) => ({ ...row }));
    case "adoptions":
      return dataset.adoptions.map((row) => ({ ...row }));
    case "adoptionDays":
      return dataset.adoptionDays.map((row) => ({ ...row }));
    case "adoptionDayAnimals":
      return dataset.adoptionDayAnimals.map((row) => ({ ...row }));
    case "partnerPlaces":
      return dataset.partnerPlaces.map((row) => ({ ...row }));
    case "healthAlerts":
      return dataset.healthAlerts.map((row) => ({ ...row }));
    case "animalEvents":
      return dataset.animalEvents.map((row) => ({ ...row }));
    case "tasks":
      return dataset.tasks.map((row) => ({ ...row }));
    case "followUps":
      return dataset.followUps.map((row) => ({ ...row }));
    case "sponsorships":
      return dataset.sponsorships.map((row) => ({ ...row }));
  }
  return assertNever(key);
}
