import type {
  Adopter, Adoption, Cat, CatEvent, CatStatus, CatView, Dataset, Family,
  FosterPlacement, RefugeStay
} from "../shared/types";

export const CURRENT_SCHEMA_VERSION = 3;

export function createEmptyDataset(name = "Gestion des chats"): Dataset {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    datasetId: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    cats: [],
    families: [],
    adopters: [],
    fosterFamilyHolidays: [],
    fosterPlacements: [],
    refugeZones: [{ id: crypto.randomUUID(), name: "Zone principale", description: "Zone d'accueil par défaut du refuge", createdAt: now, updatedAt: now }],
    refugeStays: [],
    adoptions: [],
    adoptionDays: [],
    adoptionDayCats: [],
    partnerPlaces: [],
    healthAlerts: [],
    catEvents: [],
    tasks: [],
    followUps: []
  };
}

export function deriveCatView(dataset: Dataset, cat: Cat): CatView {
  const base = { ...cat, currentFamilyId: "", currentRefugeZoneId: "", currentLocationLabel: "" };
  const latestTerminal = latestEvent(dataset.catEvents.filter(
    (event) => event.catId === cat.id && ["LOST", "DECEASED"].includes(event.type)
  ));
  if (latestTerminal?.type === "DECEASED") return { ...base, status: "DECEASED" };
  if (latestTerminal?.type === "LOST") return { ...base, status: "LOST" };

  const adoption = activeAdoption(dataset, cat.id);
  if (adoption) {
    const adopter = dataset.adopters.find((candidate) => candidate.id === adoption.adopterId);
    return { ...base, status: "ADOPTED", currentLocationLabel: adopter?.label ?? "Adoptant" };
  }
  const placement = activePlacement(dataset, cat.id);
  if (placement) {
    const family = dataset.families.find((candidate) => candidate.id === placement.familyId);
    return { ...base, status: "FOSTERED", currentFamilyId: placement.familyId, currentLocationLabel: family?.label ?? "Famille d'accueil" };
  }
  const refugeStay = activeRefugeStay(dataset, cat.id);
  if (refugeStay) {
    const zone = dataset.refugeZones.find((candidate) => candidate.id === refugeStay.zoneId);
    return { ...base, status: "AT_REFUGE", currentRefugeZoneId: refugeStay.zoneId, currentLocationLabel: `Le refuge · ${zone?.name ?? "Zone inconnue"}` };
  }
  const defaultZone = dataset.refugeZones[0];
  return { ...base, status: "AT_REFUGE", currentRefugeZoneId: defaultZone?.id ?? "", currentLocationLabel: `Le refuge · ${defaultZone?.name ?? "Zone principale"}` };
}

function latestEvent(events: CatEvent[]): CatEvent | undefined {
  return [...events].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt))[0];
}

export function getCatStatus(dataset: Dataset, catId: string): CatStatus {
  return deriveCatView(dataset, requireCat(dataset, catId)).status;
}

export function requireCat(dataset: Dataset, catId: string): Cat {
  const cat = dataset.cats.find((candidate) => candidate.id === catId);
  if (!cat) throw new Error("Chat introuvable.");
  return cat;
}

export function requireFamily(dataset: Dataset, familyId: string): Family {
  const family = dataset.families.find((candidate) => candidate.id === familyId);
  if (!family) throw new Error("Famille d'accueil introuvable.");
  return family;
}

export function requireAdopter(dataset: Dataset, adopterId: string): Adopter {
  const adopter = dataset.adopters.find((candidate) => candidate.id === adopterId);
  if (!adopter) throw new Error("Adoptant introuvable.");
  return adopter;
}

export function activePlacement(dataset: Dataset, catId: string): FosterPlacement | undefined {
  return dataset.fosterPlacements.find((placement) => placement.catId === catId && !placement.endDate);
}

export function activeRefugeStay(dataset: Dataset, catId: string): RefugeStay | undefined {
  return dataset.refugeStays.find((stay) => stay.catId === catId && !stay.endDate);
}

export function activeAdoption(dataset: Dataset, catId: string): Adoption | undefined {
  return dataset.adoptions.find((adoption) => adoption.catId === catId && adoption.status === "ACTIVE");
}

export function assertIsoDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} doit être une date valide.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} doit être une date valide.`);
  }
}

export function normalizeIdentification(value: string): string { return value.replace(/\s+/g, "").trim(); }
export function isValidIcad(value: string): boolean { return /^25026\d{10}$/.test(normalizeIdentification(value)); }

export function validateDatasetReferences(dataset: Dataset): string[] {
  const errors: string[] = [];
  const catIds = new Set(dataset.cats.map((cat) => cat.id));
  const familyIds = new Set(dataset.families.map((family) => family.id));
  const adopterIds = new Set(dataset.adopters.map((adopter) => adopter.id));
  const zoneIds = new Set(dataset.refugeZones.map((zone) => zone.id));
  const adoptionIds = new Set(dataset.adoptions.map((adoption) => adoption.id));
  const adoptionDayIds = new Set(dataset.adoptionDays.map((day) => day.id));
  for (const holiday of dataset.fosterFamilyHolidays) if (!familyIds.has(holiday.familyId)) errors.push(`Indisponibilité ${holiday.id}: famille absente.`);
  for (const placement of dataset.fosterPlacements) {
    if (!catIds.has(placement.catId)) errors.push(`Placement ${placement.id}: chat absent.`);
    if (!familyIds.has(placement.familyId)) errors.push(`Placement ${placement.id}: famille absente.`);
  }
  for (const stay of dataset.refugeStays) {
    if (!catIds.has(stay.catId)) errors.push(`Séjour refuge ${stay.id}: chat absent.`);
    if (!zoneIds.has(stay.zoneId)) errors.push(`Séjour refuge ${stay.id}: zone absente.`);
  }
  for (const adoption of dataset.adoptions) {
    if (!catIds.has(adoption.catId)) errors.push(`Adoption ${adoption.id}: chat absent.`);
    if (!adopterIds.has(adoption.adopterId)) errors.push(`Adoption ${adoption.id}: adoptant absent.`);
    if (adoption.adoptionDayId && !adoptionDayIds.has(adoption.adoptionDayId)) errors.push(`Adoption ${adoption.id}: journée absente.`);
  }
  for (const registration of dataset.adoptionDayCats) {
    if (!catIds.has(registration.catId)) errors.push(`Inscription ${registration.id}: chat absent.`);
    if (!adoptionDayIds.has(registration.adoptionDayId)) errors.push(`Inscription ${registration.id}: journée absente.`);
    if (registration.adopterId && !adopterIds.has(registration.adopterId)) errors.push(`Inscription ${registration.id}: adoptant absent.`);
  }
  for (const alert of dataset.healthAlerts) if (!catIds.has(alert.catId)) errors.push(`Alerte ${alert.id}: chat absent.`);
  for (const event of dataset.catEvents) if (!catIds.has(event.catId)) errors.push(`Événement ${event.id}: chat absent.`);
  for (const task of dataset.tasks) if (!catIds.has(task.catId)) errors.push(`Tâche ${task.id}: chat absent.`);
  for (const followUp of dataset.followUps) {
    if (!catIds.has(followUp.catId)) errors.push(`Relance ${followUp.id}: chat absent.`);
    if (followUp.adoptionId && !adoptionIds.has(followUp.adoptionId)) errors.push(`Relance ${followUp.id}: adoption absente.`);
  }
  return errors;
}
