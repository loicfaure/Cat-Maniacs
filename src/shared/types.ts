import type {
  AdopterInput,
  AdoptionDayInput,
  AdoptionDaySuggestionGroup,
  AdoptionInput,
  AdoptionWithNewFamilyInput,
  AnimalHistoryInput,
  AnimalInput,
  AnimalUpdateInput,
  AnimalView,
  CareRecordInput,
  Dataset,
  FamilyInput,
  HealthExposure,
  ImportCommitResult,
  LegacyImportPreview,
  PlacementAssessment,
  PlacementInput,
  SponsorshipInput,
  TaskInput,
} from "../core/types";

export type * from "../core/types";

export interface AppSnapshot extends Dataset {
  datasetPath: string;
  demoMode: boolean;
  showDemoWelcome: boolean;
  animalViews: AnimalView[];
  emailTemplates: EmailTemplates;
  generatedEmails: GeneratedEmail[];
  emailOutputDirectory: string;
}

export type ReminderTemplateKey =
  | "sterilisation"
  | "vaccination"
  | "antiFlea"
  | "deworming"
  | "icad";
export interface EmailTemplate {
  subject: string;
  body: string;
}
export type EmailTemplates = Record<ReminderTemplateKey, EmailTemplate> & { leadDays: number };
export interface GeneratedEmail {
  id: string;
  reminderKey: string;
  animalId: string;
  recipient: string;
  recipientName: string;
  subject: string;
  body: string;
  createdAt: string;
  acknowledgedAt: string;
  filename: string;
}

export interface AnimalAppApi {
  bootstrap(): Promise<AppSnapshot>;
  setEnabledSpecies(species: import("../core/types").SpeciesId[]): Promise<AppSnapshot>;
  setDemoMode(enabled: boolean): Promise<AppSnapshot>;
  dismissDemoWelcome(): Promise<AppSnapshot>;
  createAnimal(input: AnimalInput): Promise<AppSnapshot>;
  updateAnimal(input: AnimalUpdateInput): Promise<AppSnapshot>;
  createFamily(input: FamilyInput): Promise<AppSnapshot>;
  addFamilyHoliday(input: {
    familyId: string;
    startDate: string;
    endDate: string;
    notes?: string;
  }): Promise<AppSnapshot>;
  createAdopter(input: AdopterInput): Promise<AppSnapshot>;
  assessPlacement(input: PlacementInput): Promise<PlacementAssessment>;
  startPlacement(input: PlacementInput): Promise<AppSnapshot>;
  endPlacement(input: {
    placementId: string;
    endDate: string;
    outcome?: string;
  }): Promise<AppSnapshot>;
  sendToRefuge(input: {
    animalId: string;
    zoneId: string;
    date: string;
    reason?: string;
    notes?: string;
  }): Promise<AppSnapshot>;
  createRefugeZone(input: {
    name: string;
    description?: string;
    allowedSpecies?: import("../core/types").SpeciesId[] | null;
  }): Promise<AppSnapshot>;
  updateRefugeZone(input: {
    id: string;
    name: string;
    description?: string;
    allowedSpecies?: import("../core/types").SpeciesId[] | null;
  }): Promise<AppSnapshot>;
  deleteRefugeZone(id: string): Promise<AppSnapshot>;
  createAdoption(input: AdoptionInput): Promise<AppSnapshot>;
  createAdoptionWithNewFamily(input: AdoptionWithNewFamilyInput): Promise<AppSnapshot>;
  returnAdoption(input: {
    adoptionId: string;
    date: string;
    notes?: string;
    refugeZoneId?: string;
  }): Promise<AppSnapshot>;
  createAdoptionDay(input: AdoptionDayInput): Promise<AppSnapshot>;
  getAdoptionDaySuggestions(adoptionDayId: string): Promise<AdoptionDaySuggestionGroup[]>;
  addAnimalsToAdoptionDay(input: {
    adoptionDayId: string;
    animalIds: string[];
    overrideWarnings?: boolean;
    overrideReason?: string;
  }): Promise<AppSnapshot>;
  withdrawAnimalFromAdoptionDay(registrationId: string): Promise<AppSnapshot>;
  bookAnimalForAdoption(input: {
    registrationId: string;
    adopterId: string;
    bookedAt: string;
  }): Promise<AppSnapshot>;
  confirmAdoptionBooking(input: {
    registrationId: string;
    adoptionDate: string;
  }): Promise<AppSnapshot>;
  createPartnerPlace(input: {
    name: string;
    address?: string;
    notes?: string;
  }): Promise<AppSnapshot>;
  deletePartnerPlace(id: string): Promise<AppSnapshot>;
  declareSickness(input: {
    animalId: string;
    disease: string;
    declaredAt: string;
    lookbackDays: number;
    notes?: string;
  }): Promise<{ snapshot: AppSnapshot; exposures: HealthExposure[] }>;
  resolveHealthAlert(input: {
    alertId: string;
    resolvedAt: string;
    notes?: string;
  }): Promise<AppSnapshot>;
  getHealthExposures(healthAlertId: string): Promise<HealthExposure[]>;
  createSponsorship(input: SponsorshipInput): Promise<AppSnapshot>;
  updateSponsorship(input: SponsorshipInput & { id: string }): Promise<AppSnapshot>;
  declareAnimalDeceased(input: {
    animalId: string;
    date: string;
    notes?: string;
  }): Promise<AppSnapshot>;
  createTask(input: TaskInput): Promise<AppSnapshot>;
  recordCare(input: CareRecordInput): Promise<AppSnapshot>;
  recordAnimalHistory(input: AnimalHistoryInput): Promise<AppSnapshot>;
  deleteAnimalEvent(eventId: string): Promise<AppSnapshot>;
  completeTask(input: {
    id: string;
    completedAt: string;
    nextDueDate?: string;
  }): Promise<AppSnapshot>;
  chooseAndPreviewLegacyCsv(): Promise<LegacyImportPreview | null>;
  commitLegacyImport(
    preview: LegacyImportPreview,
  ): Promise<{ snapshot: AppSnapshot; result: ImportCommitResult }>;
  chooseDatasetDirectory(): Promise<AppSnapshot | null>;
  updateEmailTemplates(templates: EmailTemplates): Promise<AppSnapshot>;
  acknowledgeEmail(id: string): Promise<AppSnapshot>;
  chooseEmailOutputDirectory(): Promise<string | null>;
  setEmailOutputDirectory(path: string): Promise<AppSnapshot>;
  exportReadyEmails(): Promise<{ snapshot: AppSnapshot; exportedCount: number; directory: string }>;
}
