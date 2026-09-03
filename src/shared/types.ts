export type Sex = "F" | "M" | "UNKNOWN";
export type SterilizationStatus = "DONE" | "TODO" | "UNKNOWN";
export type CatProfile = "BOTTLE_KITTEN" | "KITTEN" | "ADULT" | "SENIOR" | "SPECIAL_NEEDS";
export type AdoptionEligibility = "ELIGIBLE" | "ON_HOLD" | "INELIGIBLE";
export type HealthStatus = "HEALTHY" | "SICK" | "RECOVERED";
export type CatStatus = "FOSTERED" | "AT_REFUGE" | "ADOPTED" | "LOST" | "DECEASED";

export interface Cat {
  id: string;
  name: string;
  identificationNumber: string;
  birthDate: string;
  sex: Sex;
  profile: CatProfile;
  sterilizationStatus: SterilizationStatus;
  adoptionEligibility: AdoptionEligibility;
  adoptionBlockedReason: string;
  healthStatus: HealthStatus;
  intakeDate: string;
  notes: string;
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
  acceptedProfiles: CatProfile[];
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
  catId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface RefugeStay {
  id: string;
  catId: string;
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
  catId: string;
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

export interface AdoptionDayCat {
  id: string;
  adoptionDayId: string;
  catId: string;
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

export type CatEventType =
  | "REGISTERED" | "PLACED_IN_FOSTER" | "FOSTER_ENDED" | "SENT_TO_REFUGE"
  | "REFUGE_ZONE_CHANGED" | "LEFT_REFUGE" | "ADOPTED" | "RETURNED"
  | "LOST" | "DECEASED" | "TRANSFERRED" | "DECLARED_SICK" | "RECOVERED";

export interface CatEvent {
  id: string;
  catId: string;
  type: CatEventType;
  date: string;
  notes: string;
  createdAt: string;
}

export interface HealthAlert {
  id: string;
  catId: string;
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
  catId: string;
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
  catId: string;
  adoptionId: string;
  requestedAt: string;
  response: string;
  lastNewsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  schemaVersion: number;
  datasetId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  cats: Cat[];
  families: Family[];
  adopters: Adopter[];
  fosterFamilyHolidays: FosterFamilyHoliday[];
  fosterPlacements: FosterPlacement[];
  refugeZones: RefugeZone[];
  refugeStays: RefugeStay[];
  adoptions: Adoption[];
  adoptionDays: AdoptionDay[];
  adoptionDayCats: AdoptionDayCat[];
  partnerPlaces: PartnerPlace[];
  healthAlerts: HealthAlert[];
  catEvents: CatEvent[];
  tasks: Task[];
  followUps: FollowUp[];
}

export interface CatView extends Cat {
  status: CatStatus;
  currentFamilyId: string;
  currentRefugeZoneId: string;
  currentLocationLabel: string;
}

export interface AppSnapshot extends Dataset {
  datasetPath: string;
  demoMode: boolean;
  catViews: CatView[];
}

export interface CatInput {
  name: string;
  identificationNumber?: string;
  birthDate?: string;
  sex?: Sex;
  profile?: CatProfile;
  sterilizationStatus?: SterilizationStatus;
  adoptionEligibility?: AdoptionEligibility;
  adoptionBlockedReason?: string;
  healthStatus?: HealthStatus;
  intakeDate?: string;
  notes?: string;
}

export interface CatUpdateInput extends Partial<CatInput> { id: string; }

export interface FamilyInput {
  label?: string;
  courtesyTitle?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  maxCapacity: number;
  acceptedProfiles: CatProfile[];
  notes?: string;
}

export type AdopterInput = Omit<FamilyInput, "maxCapacity" | "acceptedProfiles">;

export interface PlacementInput {
  catId: string;
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
  catIds: string[];
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
  cats: Array<{ catId: string; warnings: string[] }>;
}

export interface HealthExposure {
  catId: string;
  locationType: "FAMILY" | "REFUGE_ZONE";
  locationId: string;
  locationLabel: string;
  overlapStart: string;
  overlapEnd: string;
}

export type ImportSeverity = "error" | "warning";
export interface ImportIssue { rowNumber: number; field: string; severity: ImportSeverity; message: string; }
export interface LegacyImportRow { sourceRowNumber: number; values: Record<string, string>; issues: ImportIssue[]; importable: boolean; }
export interface LegacyImportPreview { sourcePath: string; headers: string[]; rows: LegacyImportRow[]; issueCount: number; errorCount: number; warningCount: number; }
export interface ImportCommitResult { importedCats: number; importedFamilies: number; importedAdoptions: number; skippedRows: number; }

export interface CatAppApi {
  bootstrap(): Promise<AppSnapshot>;
  createCat(input: CatInput): Promise<AppSnapshot>;
  updateCat(input: CatUpdateInput): Promise<AppSnapshot>;
  createFamily(input: FamilyInput): Promise<AppSnapshot>;
  addFamilyHoliday(input: { familyId: string; startDate: string; endDate: string; notes?: string }): Promise<AppSnapshot>;
  createAdopter(input: AdopterInput): Promise<AppSnapshot>;
  assessPlacement(input: PlacementInput): Promise<PlacementAssessment>;
  startPlacement(input: PlacementInput): Promise<AppSnapshot>;
  endPlacement(input: { placementId: string; endDate: string; outcome?: string }): Promise<AppSnapshot>;
  sendToRefuge(input: { catId: string; zoneId: string; date: string; reason?: string; notes?: string }): Promise<AppSnapshot>;
  createRefugeZone(input: { name: string; description?: string }): Promise<AppSnapshot>;
  updateRefugeZone(input: { id: string; name: string; description?: string }): Promise<AppSnapshot>;
  deleteRefugeZone(id: string): Promise<AppSnapshot>;
  createAdoption(input: AdoptionInput): Promise<AppSnapshot>;
  createAdoptionWithNewFamily(input: AdoptionWithNewFamilyInput): Promise<AppSnapshot>;
  returnAdoption(input: { adoptionId: string; date: string; notes?: string; refugeZoneId?: string }): Promise<AppSnapshot>;
  createAdoptionDay(input: AdoptionDayInput): Promise<AppSnapshot>;
  getAdoptionDaySuggestions(adoptionDayId: string): Promise<AdoptionDaySuggestionGroup[]>;
  addCatsToAdoptionDay(input: { adoptionDayId: string; catIds: string[]; overrideWarnings?: boolean; overrideReason?: string }): Promise<AppSnapshot>;
  withdrawCatFromAdoptionDay(registrationId: string): Promise<AppSnapshot>;
  bookCatForAdoption(input: { registrationId: string; adopterId: string; bookedAt: string }): Promise<AppSnapshot>;
  confirmAdoptionBooking(input: { registrationId: string; adoptionDate: string }): Promise<AppSnapshot>;
  createPartnerPlace(input: { name: string; address?: string; notes?: string }): Promise<AppSnapshot>;
  deletePartnerPlace(id: string): Promise<AppSnapshot>;
  declareSickness(input: { catId: string; disease: string; declaredAt: string; lookbackDays: number; notes?: string }): Promise<{ snapshot: AppSnapshot; exposures: HealthExposure[] }>;
  resolveHealthAlert(input: { alertId: string; resolvedAt: string; notes?: string }): Promise<AppSnapshot>;
  getHealthExposures(healthAlertId: string): Promise<HealthExposure[]>;
  chooseAndPreviewLegacyCsv(): Promise<LegacyImportPreview | null>;
  commitLegacyImport(preview: LegacyImportPreview): Promise<{ snapshot: AppSnapshot; result: ImportCommitResult }>;
  chooseDatasetDirectory(): Promise<AppSnapshot | null>;
}
