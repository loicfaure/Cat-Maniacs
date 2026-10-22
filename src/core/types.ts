export type Sex = "F" | "M" | "UNKNOWN";
export type SterilizationStatus = "DONE" | "TODO" | "UNKNOWN";
export type SpeciesId = "cat" | "dog" | "rabbit" | "snake";
export type AnimalProfile =
  | "BOTTLE_KITTEN"
  | "KITTEN"
  | "PUPPY"
  | "YOUNG"
  | "JUVENILE"
  | "ADULT"
  | "SENIOR"
  | "SPECIAL_NEEDS"
  | "UNKNOWN";
export type IdentificationScheme = "ICAD" | "OTHER" | "NONE";
export interface AnimalCharacteristics {
  specialNeeds?: string;
  weightKg?: number;
  mixedBreed?: boolean;
  secondaryBreed?: string;
  coatColor?: string;
  secondaryCoatColor?: string;
  mixedCoatColor?: boolean;
}
export interface AppearanceCatalog {
  breeds: string[];
  colors: string[];
}
export interface SpeciesDataById {
  cat: AnimalCharacteristics & { breed?: string };
  dog: AnimalCharacteristics & { breed?: string; size?: "SMALL" | "MEDIUM" | "LARGE" };
  rabbit: AnimalCharacteristics & { breed?: string };
  snake: AnimalCharacteristics & { taxon?: string; lengthCm?: number };
}
export type SpeciesData = SpeciesDataById[SpeciesId];
export type Compatibility = boolean | null;
export type AdoptionEligibility = "ELIGIBLE" | "ON_HOLD" | "INELIGIBLE" | "UNKNOWN";
export type HealthStatus = "HEALTHY" | "SICK" | "RECOVERED";
export type AnimalStatus = "FOSTERED" | "AT_REFUGE" | "ADOPTED" | "LOST" | "DECEASED";

export interface Animal {
  id: string;
  speciesId: SpeciesId;
  speciesData: SpeciesData;
  identificationScheme: IdentificationScheme;
  name: string;
  identificationNumber: string;
  birthDate: string;
  sex: Sex;
  profile: AnimalProfile;
  sterilizationStatus: SterilizationStatus;
  adoptionEligibility: AdoptionEligibility;
  adoptionBlockedReason: string;
  healthStatus: HealthStatus;
  intakeDate: string;
  notes: string;
  description?: string;
  photo?: string;
  compatibilityBySpecies: Partial<Record<SpeciesId, Compatibility>>;
  okWithChildren?: boolean | null;
  medications?: string;
  medicationSchedule?: string;
  medicationEndDate?: string;
  vaccines?: string;
  deworming?: string;
  antiFlea?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  label: string;
  courtesyTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  maxCapacity: number;
  acceptanceRules?: Partial<Record<SpeciesId, { profiles: AnimalProfile[]; maxCapacity?: number }>>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Adopter {
  id: string;
  label: string;
  courtesyTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FosterFamilyHoliday {
  id: string;
  familyId: string;
  startDate: string;
  endDate: string;
  notes: string;
  createdAt: string;
}

export interface FosterPlacement {
  id: string;
  animalId: string;
  familyId: string;
  startDate: string;
  endDate: string;
  outcome: string;
  overrideReason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefugeZone {
  id: string;
  name: string;
  description: string;
  allowedSpecies: SpeciesId[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefugeStay {
  id: string;
  animalId: string;
  zoneId: string;
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Adoption {
  id: string;
  groupId: string;
  animalId: string;
  adopterId: string;
  adoptionDate: string;
  partner: string;
  adoptionDayId: string;
  status: "ACTIVE" | "RETURNED";
  endedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdoptionDay {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  partner: string;
  location: string;
  status: "PLANNED" | "ACTIVE" | "CLOSED";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdoptionDayAnimal {
  id: string;
  adoptionDayId: string;
  animalId: string;
  status: "REGISTERED" | "ATTENDED" | "ADOPTED" | "WITHDRAWN";
  overrideReason: string;
  notes: string;
  adopterId: string;
  bookedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerPlace {
  id: string;
  name: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AnimalEventType =
  | "REGISTERED"
  | "PLACED_IN_FOSTER"
  | "FOSTER_ENDED"
  | "SENT_TO_REFUGE"
  | "REFUGE_ZONE_CHANGED"
  | "LEFT_REFUGE"
  | "ADOPTED"
  | "RETURNED"
  | "LOST"
  | "DECEASED"
  | "TRANSFERRED"
  | "DECLARED_SICK"
  | "RECOVERED"
  | "NOTE_ADDED";

export interface AnimalEvent {
  id: string;
  animalId: string;
  type: AnimalEventType;
  date: string;
  notes: string;
  label?: string;
  createdAt: string;
}

export interface HealthAlert {
  id: string;
  animalId: string;
  disease: string;
  declaredAt: string;
  lookbackDays: number;
  status: "OPEN" | "RESOLVED";
  resolvedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  animalId: string;
  type: string;
  status: "OPEN" | "DONE" | "CANCELLED";
  dueDate: string;
  completedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  animalId: string;
  adoptionId: string;
  requestedAt: string;
  response: string;
  lastNewsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sponsorship {
  id: string;
  animalId: string;
  firstName: string;
  lastName: string;
  email: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string;
  paymentNotes: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  modelVersion: 1;
  schemaVersion: number;
  datasetId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: {
    enabledSpecies: SpeciesId[];
    appearanceCatalog?: Partial<Record<SpeciesId, AppearanceCatalog>>;
  };
  animals: Animal[];
  families: Family[];
  adopters: Adopter[];
  fosterFamilyHolidays: FosterFamilyHoliday[];
  fosterPlacements: FosterPlacement[];
  refugeZones: RefugeZone[];
  refugeStays: RefugeStay[];
  adoptions: Adoption[];
  adoptionDays: AdoptionDay[];
  adoptionDayAnimals: AdoptionDayAnimal[];
  partnerPlaces: PartnerPlace[];
  healthAlerts: HealthAlert[];
  animalEvents: AnimalEvent[];
  tasks: Task[];
  followUps: FollowUp[];
  sponsorships: Sponsorship[];
}

export interface AnimalView extends Animal {
  status: AnimalStatus;
  currentFamilyId: string;
  currentRefugeZoneId: string;
  currentLocationLabel: string;
}

export interface AnimalInput {
  name: string;
  speciesId?: SpeciesId;
  speciesData?: SpeciesData;
  identificationScheme?: IdentificationScheme;
  identificationNumber?: string;
  birthDate?: string;
  sex?: Sex;
  profile?: AnimalProfile;
  sterilizationStatus?: SterilizationStatus;
  adoptionEligibility?: AdoptionEligibility;
  adoptionBlockedReason?: string;
  healthStatus?: HealthStatus;
  intakeDate?: string;
  notes?: string;
  description?: string;
  photo?: string;
  compatibilityBySpecies?: Partial<Record<SpeciesId, Compatibility>>;
  okWithChildren?: boolean | null;
  medications?: string;
  medicationSchedule?: string;
  medicationEndDate?: string;
  vaccines?: string;
  deworming?: string;
  antiFlea?: string;
}

export interface AnimalUpdateInput extends Partial<AnimalInput> {
  id: string;
}
export interface SponsorshipInput {
  animalId: string;
  firstName: string;
  lastName: string;
  email?: string;
  monthlyAmount: number;
  startDate: string;
  endDate?: string;
  paymentNotes?: string;
  notes?: string;
}
export type CareTaskType = "VERMIFUGE" | "ANTI_PUCE" | "VACCIN" | "STERILISATION";
export interface TaskInput {
  animalId: string;
  type: CareTaskType;
  dueDate: string;
  notes?: string;
}
export interface CareRecordInput {
  animalId: string;
  type: CareTaskType;
  completedAt: string;
  nextDueDate?: string;
  notes?: string;
}
export interface AnimalHistoryInput {
  animalId: string;
  date: string;
  title: string;
  notes?: string;
  nextDate?: string;
}

export interface FamilyInput {
  label?: string;
  courtesyTitle?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  maxCapacity: number;
  acceptanceRules?: Partial<Record<SpeciesId, { profiles: AnimalProfile[]; maxCapacity?: number }>>;
  notes?: string;
}

export type AdopterInput = Omit<FamilyInput, "maxCapacity" | "acceptanceRules">;

export interface PlacementInput {
  animalId: string;
  familyId: string;
  startDate: string;
  notes?: string;
  overrideWarnings?: boolean;
  overrideReason?: string;
}

export interface PlacementAssessment {
  allowed: boolean;
  warnings: string[];
  currentOccupancy: number;
  maxCapacity: number;
}

export interface AdoptionInput {
  animalIds: string[];
  adopterId: string;
  adoptionDate: string;
  partner?: string;
  adoptionDayId?: string;
  notes?: string;
  overrideWarnings?: boolean;
}

export interface AdoptionWithNewFamilyInput {
  adoption: Omit<AdoptionInput, "adopterId">;
  family: AdopterInput;
}

export interface AdoptionDayInput {
  name: string;
  startDate: string;
  endDate: string;
  partner?: string;
  location?: string;
  notes?: string;
}

export interface AdoptionDaySuggestionGroup {
  locationType: "FAMILY" | "REFUGE" | "OTHER";
  locationId: string;
  locationLabel: string;
  animals: Array<{ animalId: string; warnings: string[] }>;
}

export interface HealthExposure {
  animalId: string;
  locationType: "FAMILY" | "REFUGE_ZONE";
  locationId: string;
  locationLabel: string;
  overlapStart: string;
  overlapEnd: string;
}

export type ImportSeverity = "error" | "warning";
export interface ImportIssue {
  rowNumber: number;
  field: string;
  severity: ImportSeverity;
  message: string;
}
export interface LegacyImportRow {
  sourceRowNumber: number;
  values: Record<string, string>;
  issues: ImportIssue[];
  importable: boolean;
}
export interface LegacyImportPreview {
  sourcePath: string;
  headers: string[];
  rows: LegacyImportRow[];
  issueCount: number;
  errorCount: number;
  warningCount: number;
}
export interface ImportCommitResult {
  importedAnimals: number;
  importedFamilies: number;
  importedAdoptions: number;
  skippedRows: number;
}
