import type {
  Adopter,
  Adoption,
  Animal,
  AnimalEvent,
  AnimalStatus,
  AnimalView,
  Dataset,
  Family,
  FosterPlacement,
  RefugeStay,
} from "../core/types";

export const CURRENT_SCHEMA_VERSION = 8;
export const CURRENT_MODEL_VERSION = 1 as const;

export function createEmptyDataset(name = "Gestion des animaux"): Dataset {
  const now = new Date().toISOString();
  return {
    modelVersion: CURRENT_MODEL_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    datasetId: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { enabledSpecies: ["cat"] },
    animals: [],
    families: [],
    adopters: [],
    fosterFamilyHolidays: [],
    fosterPlacements: [],
    refugeZones: [
      {
        id: crypto.randomUUID(),
        name: "Zone principale",
        description: "Zone d'accueil par défaut du refuge",
        allowedSpecies: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    refugeStays: [],
    adoptions: [],
    adoptionDays: [],
    adoptionDayAnimals: [],
    partnerPlaces: [],
    healthAlerts: [],
    animalEvents: [],
    tasks: [],
    followUps: [],
    sponsorships: [],
  };
}

export function deriveAnimalView(dataset: Dataset, cat: Animal): AnimalView {
  const base = { ...cat, currentFamilyId: "", currentRefugeZoneId: "", currentLocationLabel: "" };
  const latestTerminal = latestEvent(
    dataset.animalEvents.filter(
      (event) => event.animalId === cat.id && ["LOST", "DECEASED"].includes(event.type),
    ),
  );
  if (latestTerminal?.type === "DECEASED") {
    return { ...base, status: "DECEASED" };
  }
  if (latestTerminal?.type === "LOST") {
    return { ...base, status: "LOST" };
  }

  const adoption = activeAdoption(dataset, cat.id);
  if (adoption) {
    const adopter = dataset.adopters.find((candidate) => candidate.id === adoption.adopterId);
    return { ...base, status: "ADOPTED", currentLocationLabel: adopter?.label ?? "Adoptant" };
  }
  const placement = activePlacement(dataset, cat.id);
  if (placement) {
    const family = dataset.families.find((candidate) => candidate.id === placement.familyId);
    return {
      ...base,
      status: "FOSTERED",
      currentFamilyId: placement.familyId,
      currentLocationLabel: family?.label ?? "Famille d'accueil",
    };
  }
  const refugeStay = activeRefugeStay(dataset, cat.id);
  if (refugeStay) {
    const zone = dataset.refugeZones.find((candidate) => candidate.id === refugeStay.zoneId);
    return {
      ...base,
      status: "AT_REFUGE",
      currentRefugeZoneId: refugeStay.zoneId,
      currentLocationLabel: `Le refuge · ${zone?.name ?? "Zone inconnue"}`,
    };
  }
  const defaultZone = dataset.refugeZones.find(
    (zone) => zone.allowedSpecies === null || zone.allowedSpecies.includes(cat.speciesId),
  );
  return {
    ...base,
    status: "AT_REFUGE",
    currentRefugeZoneId: defaultZone?.id ?? "",
    currentLocationLabel: defaultZone
      ? `Le refuge · ${defaultZone.name}`
      : "Le refuge · Zone compatible à choisir",
  };
}

function latestEvent(events: AnimalEvent[]): AnimalEvent | undefined {
  return [...events].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt),
  )[0];
}

export function getAnimalStatus(dataset: Dataset, animalId: string): AnimalStatus {
  return deriveAnimalView(dataset, requireAnimal(dataset, animalId)).status;
}

export function requireAnimal(dataset: Dataset, animalId: string): Animal {
  const cat = dataset.animals.find((candidate) => candidate.id === animalId);
  if (!cat) {
    throw new Error("Animal introuvable.");
  }
  return cat;
}

export function requireFamily(dataset: Dataset, familyId: string): Family {
  const family = dataset.families.find((candidate) => candidate.id === familyId);
  if (!family) {
    throw new Error("Famille d'accueil introuvable.");
  }
  return family;
}

export function requireAdopter(dataset: Dataset, adopterId: string): Adopter {
  const adopter = dataset.adopters.find((candidate) => candidate.id === adopterId);
  if (!adopter) {
    throw new Error("Adoptant introuvable.");
  }
  return adopter;
}

export function activePlacement(dataset: Dataset, animalId: string): FosterPlacement | undefined {
  return dataset.fosterPlacements.find(
    (placement) => placement.animalId === animalId && !placement.endDate,
  );
}

export function activeRefugeStay(dataset: Dataset, animalId: string): RefugeStay | undefined {
  return dataset.refugeStays.find((stay) => stay.animalId === animalId && !stay.endDate);
}

export function activeAdoption(dataset: Dataset, animalId: string): Adoption | undefined {
  return dataset.adoptions.find(
    (adoption) => adoption.animalId === animalId && adoption.status === "ACTIVE",
  );
}

export function assertIsoDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} doit être une date valide.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} doit être une date valide.`);
  }
}

export function normalizeIdentification(value: string): string {
  return value.replace(/\s+/g, "").trim();
}
export function isValidIcad(value: string): boolean {
  return /^25026\d{10}$/.test(normalizeIdentification(value));
}

export function validateDatasetReferences(dataset: Dataset): string[] {
  const errors: string[] = [];
  const animalIds = new Set(dataset.animals.map((cat) => cat.id));
  const familyIds = new Set(dataset.families.map((family) => family.id));
  const adopterIds = new Set(dataset.adopters.map((adopter) => adopter.id));
  const zoneIds = new Set(dataset.refugeZones.map((zone) => zone.id));
  const adoptionIds = new Set(dataset.adoptions.map((adoption) => adoption.id));
  const adoptionDayIds = new Set(dataset.adoptionDays.map((day) => day.id));
  for (const holiday of dataset.fosterFamilyHolidays) {
    if (!familyIds.has(holiday.familyId)) {
      errors.push(`Indisponibilité ${holiday.id}: famille absente.`);
    }
  }
  for (const placement of dataset.fosterPlacements) {
    if (!animalIds.has(placement.animalId)) {
      errors.push(`Placement ${placement.id}: animal absent.`);
    }
    if (!familyIds.has(placement.familyId)) {
      errors.push(`Placement ${placement.id}: famille absente.`);
    }
  }
  for (const stay of dataset.refugeStays) {
    if (!animalIds.has(stay.animalId)) {
      errors.push(`Séjour refuge ${stay.id}: animal absent.`);
    }
    if (!zoneIds.has(stay.zoneId)) {
      errors.push(`Séjour refuge ${stay.id}: zone absente.`);
    }
  }
  for (const adoption of dataset.adoptions) {
    if (!animalIds.has(adoption.animalId)) {
      errors.push(`Adoption ${adoption.id}: animal absent.`);
    }
    if (!adopterIds.has(adoption.adopterId)) {
      errors.push(`Adoption ${adoption.id}: adoptant absent.`);
    }
    if (adoption.adoptionDayId && !adoptionDayIds.has(adoption.adoptionDayId)) {
      errors.push(`Adoption ${adoption.id}: journée absente.`);
    }
  }
  for (const registration of dataset.adoptionDayAnimals) {
    if (!animalIds.has(registration.animalId)) {
      errors.push(`Inscription ${registration.id}: animal absent.`);
    }
    if (!adoptionDayIds.has(registration.adoptionDayId)) {
      errors.push(`Inscription ${registration.id}: journée absente.`);
    }
    if (registration.adopterId && !adopterIds.has(registration.adopterId)) {
      errors.push(`Inscription ${registration.id}: adoptant absent.`);
    }
  }
  for (const alert of dataset.healthAlerts) {
    if (!animalIds.has(alert.animalId)) {
      errors.push(`Alerte ${alert.id}: animal absent.`);
    }
  }
  for (const event of dataset.animalEvents) {
    if (!animalIds.has(event.animalId)) {
      errors.push(`Événement ${event.id}: animal absent.`);
    }
  }
  for (const task of dataset.tasks) {
    if (!animalIds.has(task.animalId)) {
      errors.push(`Tâche ${task.id}: animal absent.`);
    }
  }
  for (const sponsorship of dataset.sponsorships) {
    if (!animalIds.has(sponsorship.animalId)) {
      errors.push(`Parrainage ${sponsorship.id}: animal absent.`);
    }
  }
  for (const followUp of dataset.followUps) {
    if (!animalIds.has(followUp.animalId)) {
      errors.push(`Relance ${followUp.id}: animal absent.`);
    }
    if (followUp.adoptionId && !adoptionIds.has(followUp.adoptionId)) {
      errors.push(`Relance ${followUp.id}: adoption absente.`);
    }
  }
  for (const record of dataset.settings.activityRecords ?? []) {
    if (record.animalId && !animalIds.has(record.animalId)) {
      errors.push(`Événement ${record.id}: animal absent.`);
    }
    if (record.familyId && !familyIds.has(record.familyId)) {
      errors.push(`Événement ${record.id}: famille absente.`);
    }
  }
  return errors;
}
