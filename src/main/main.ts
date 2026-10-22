import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  type MessageBoxOptions,
} from "electron";
import { AnimalService } from "../application/animalService";
import { mutateDataset } from "../application/mutateDataset";
import type { DatasetRepositoryPort } from "../application/ports/datasetRepository";
import { createDemoDataset } from "../demo/demoDataset";
import { deriveAnimalView } from "../domain/dataset";
import { getSpeciesDefinition, isSpeciesId } from "../domain/species/registry";
import { TABLES } from "../infrastructure/database/tables";
import { DatasetRepository } from "../infrastructure/datasetRepository";
import { runLegacyMigration } from "../infrastructure/migrations/engine";
import { inspectLegacyDataset } from "../infrastructure/migrations/inspectLegacy";
import { recoverStaleMigrationBeforeInspection } from "../infrastructure/migrations/transaction";
import { commitLegacyPreview, previewLegacyCsv } from "../legacy/legacyImport";
import { IPC } from "../shared/ipc";
import type {
  AdopterInput,
  AdoptionDayInput,
  AdoptionInput,
  AdoptionWithNewFamilyInput,
  AnimalInput,
  AnimalUpdateInput,
  AppSnapshot,
  Dataset,
  EmailTemplates,
  FamilyInput,
  GeneratedEmail,
  LegacyImportPreview,
  PlacementInput,
  ReminderTemplateKey,
} from "../shared/types";
import { openModeDataset } from "./datasetMode";
import { type AppPreferences, loadAppPreferences, saveAppPreferences } from "./preferences";

const forcedDemoMode = process.env.CAT_DISPENSER_DEMO === "1";
let demoMode = false;
let showDemoWelcome = false;
let preferences: AppPreferences;
let preferencesPath = "";
let demoDatasetDirectory = "";
let repository: DatasetRepositoryPort;
let dataset: Dataset;
let datasetPath = "";
let mainWindow: BrowserWindow | undefined;

class MigrationCancelledError extends Error {}

function showMessageBox(options: MessageBoxOptions) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

function snapshot(): AppSnapshot {
  const generatedEmails = preferences.generatedEmailsByDataset[dataset.datasetId] ?? [];
  return {
    ...dataset,
    datasetPath,
    demoMode,
    showDemoWelcome,
    animalViews: dataset.animals.map((cat) => deriveAnimalView(dataset, cat)),
    emailTemplates: preferences.emailTemplates,
    generatedEmails,
    emailOutputDirectory: preferences.emailOutputDirectory,
  };
}

function renderReminderText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(animal|contact|date)\}/g, (_, key: string) => vars[key] ?? "");
}

async function generateDueEmails(): Promise<void> {
  const existing = preferences.generatedEmailsByDataset[dataset.datasetId] ?? [];
  const known = new Set(existing.map((email) => email.reminderKey));
  const today = new Date().toISOString().slice(0, 10);
  const latestDate = new Date(Date.now() + preferences.emailTemplates.leadDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const views = new Map(
    dataset.animals.map((animal) => [animal.id, deriveAnimalView(dataset, animal)]),
  );
  const created: GeneratedEmail[] = [];
  const add = (
    reminderKey: string,
    animalId: string,
    key: ReminderTemplateKey,
    recipient: { email: string; name: string },
    date: string,
  ) => {
    if (!recipient.email || known.has(reminderKey)) {
      return;
    }
    const animal = dataset.animals.find((candidate) => candidate.id === animalId);
    if (!animal) {
      return;
    }
    const template = preferences.emailTemplates[key];
    const vars = {
      animal: animal.name,
      contact: recipient.name,
      date: date ? new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR") : "",
    };
    const id = crypto.randomUUID();
    created.push({
      id,
      reminderKey,
      animalId,
      recipient: recipient.email,
      recipientName: recipient.name,
      subject: renderReminderText(template.subject, vars),
      body: renderReminderText(template.body, vars),
      createdAt: new Date().toISOString(),
      acknowledgedAt: "",
      filename: `${today}-${animal.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${key}-${id.slice(0, 8)}.eml`,
    });
    known.add(reminderKey);
  };
  for (const task of dataset.tasks) {
    if (task.status !== "OPEN" || task.dueDate < today || task.dueDate > latestDate) {
      continue;
    }
    const animal = dataset.animals.find((candidate) => candidate.id === task.animalId);
    const view = views.get(task.animalId);
    if (!animal || !view || animal.speciesId !== "cat") {
      continue;
    }
    const family =
      view.status === "FOSTERED"
        ? dataset.families.find((candidate) => candidate.id === view.currentFamilyId)
        : undefined;
    const adoption =
      view.status === "ADOPTED"
        ? dataset.adoptions.find(
            (candidate) => candidate.animalId === animal.id && candidate.status === "ACTIVE",
          )
        : undefined;
    const adopter = adoption
      ? dataset.adopters.find((candidate) => candidate.id === adoption.adopterId)
      : undefined;
    const recipient = family
      ? { email: family.email, name: family.label }
      : adopter
        ? { email: adopter.email, name: adopter.label }
        : undefined;
    const key: ReminderTemplateKey | undefined =
      task.type === "STERILISATION"
        ? "sterilisation"
        : family && task.type === "VACCIN"
          ? "vaccination"
          : family && task.type === "ANTI_PUCE"
            ? "antiFlea"
            : family && task.type === "VERMIFUGE"
              ? "deworming"
              : undefined;
    if (recipient && key) {
      add(`${key}:${task.id}`, animal.id, key, recipient, task.dueDate);
    }
  }
  for (const adoption of dataset.adoptions) {
    if (adoption.status !== "ACTIVE" || !adoption.adoptionDate) {
      continue;
    }
    const due = new Date(`${adoption.adoptionDate}T12:00:00`);
    due.setMonth(due.getMonth() + 6);
    if (due.toISOString().slice(0, 10) > today) {
      continue;
    }
    const animal = dataset.animals.find((candidate) => candidate.id === adoption.animalId);
    const adopter = dataset.adopters.find((candidate) => candidate.id === adoption.adopterId);
    if (
      !animal ||
      animal.speciesId !== "cat" ||
      animal.identificationScheme !== "ICAD" ||
      animal.sterilizationStatus !== "DONE" ||
      !adopter
    ) {
      continue;
    }
    add(
      `icad:${adoption.id}`,
      animal.id,
      "icad",
      { email: adopter.email, name: adopter.label },
      adoption.adoptionDate,
    );
  }
  if (created.length) {
    preferences.generatedEmailsByDataset[dataset.datasetId] = [...existing, ...created];
    await saveAppPreferences(preferencesPath, preferences);
  }
}

async function synchronizeAgeProfiles(): Promise<void> {
  const timestamp = new Date().toISOString();
  let changed = false;
  for (const cat of dataset.animals) {
    if (cat.profile === "SPECIAL_NEEDS") {
      continue;
    }
    const profile = getSpeciesDefinition(cat.speciesId).deriveProfile?.(cat.birthDate, new Date());
    if (profile && profile !== cat.profile) {
      cat.profile = profile;
      cat.updatedAt = timestamp;
      changed = true;
    }
  }
  if (changed) {
    dataset.updatedAt = timestamp;
    await repository.save(dataset);
  }
}

async function openDataset(directory: string, demo = false): Promise<AppSnapshot> {
  if (!demo) {
    await recoverStaleMigrationBeforeInspection(directory);
    const inspection = await inspectLegacyDataset(directory);
    if (inspection.format === "legacy") {
      const result = await runLegacyMigration({
        directory,
        tables: TABLES,
        validateStaged: async (stagedDirectory) => {
          await DatasetRepository.open(stagedDirectory);
        },
        confirm: async (report) => {
          const counts = Object.entries(report.counts)
            .map(([table, count]) => `${table}: ${count}`)
            .join("\n");
          const response = await showMessageBox({
            type: "warning",
            title: "Conversion du registre requise",
            message: "Ce registre local doit être converti vers le modèle animal v1.",
            detail: `Une sauvegarde complète sera créée à côté du registre. Le format converti ne pourra pas être ouvert avec la version précédente.\n\nDossier : ${report.directory}\nSchéma source : ${report.sourceSchema}\nSauvegarde : ${join(report.directory, "..", `${report.directory.split(/[\\/]/).filter(Boolean).at(-1)}.legacy-backup-<identifiant>`)}\n\n${counts}`,
            buttons: ["Sauvegarder et migrer", "Annuler"],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          });
          return response.response === 0;
        },
      });
      if (result.status === "cancelled") {
        throw new MigrationCancelledError("Conversion annulée.");
      }
      if (result.status === "migrated") {
        await showMessageBox({
          type: "info",
          title: "Conversion terminée",
          message: "Le registre a été converti vers le modèle animal v1.",
          detail: `Sauvegarde complète : ${result.receipt.backupPath}`,
          buttons: ["Continuer"],
        });
      }
    }
  }
  const opened = await openModeDataset(directory, demo, preferences.demoEnabledSpecies);
  repository = opened.repository;
  datasetPath = directory;
  dataset = opened.dataset;
  await synchronizeAgeProfiles();
  return snapshot();
}

async function activateMode(enabled: boolean): Promise<AppSnapshot> {
  const previousMode = demoMode;
  demoMode = enabled;
  try {
    const directory = enabled ? demoDatasetDirectory : preferences.realDatasetDirectory;
    await openDataset(directory, enabled);
    return snapshot();
  } catch (error) {
    demoMode = previousMode;
    throw error;
  }
}

async function mutate(
  action: (service: AnimalService, draft: Dataset) => void,
): Promise<AppSnapshot> {
  const previousSpecies = dataset.settings.enabledSpecies.join("|");
  const mutation = await mutateDataset(repository, dataset, action);
  dataset = mutation.dataset;
  await generateDueEmails();
  if (demoMode && dataset.settings.enabledSpecies.join("|") !== previousSpecies) {
    preferences.demoEnabledSpecies = [...dataset.settings.enabledSpecies];
    await saveAppPreferences(preferencesPath, preferences);
  }
  return snapshot();
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!url.startsWith("file://")) {
    throw new Error("Appel IPC refusé.");
  }
}

function handle(
  channel: string,
  callback: (event: IpcMainInvokeEvent, ...args: never[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedRenderer(event);
    return Reflect.apply(callback, undefined, [event, ...args]);
  });
}

function registerHandlers(): void {
  handle(IPC.bootstrap, async () => {
    await synchronizeAgeProfiles();
    await generateDueEmails();
    return snapshot();
  });
  handle(IPC.setDemoMode, async (_event, enabled: boolean) => {
    if (typeof enabled !== "boolean") {
      throw new Error("Mode de démonstration invalide.");
    }
    const nextSnapshot = await activateMode(enabled);
    preferences.demoMode = enabled;
    if (!enabled) {
      preferences.demoWelcomeSeen = true;
      showDemoWelcome = false;
    }
    await saveAppPreferences(preferencesPath, preferences);
    return { ...nextSnapshot, showDemoWelcome };
  });
  handle(IPC.dismissDemoWelcome, async () => {
    showDemoWelcome = false;
    preferences.demoWelcomeSeen = true;
    await saveAppPreferences(preferencesPath, preferences);
    return snapshot();
  });
  handle(IPC.createAnimal, async (_event, input: AnimalInput) =>
    mutate((service) => void service.createAnimal(input)),
  );
  handle(IPC.setEnabledSpecies, async (_event, species: import("../core/types").SpeciesId[]) => {
    if (!Array.isArray(species) || !species.length || !species.every(isSpeciesId)) {
      throw new Error("Choisissez au moins une espèce prise en charge.");
    }
    if (demoMode) {
      // Validate before replacing demo data, using the same species lock as a real register.
      new AnimalService(structuredClone(dataset)).setEnabledSpecies(species);
      const demoDataset = createDemoDataset([...new Set(species)]);
      const opened = await DatasetRepository.openDemo(datasetPath, demoDataset);
      dataset = opened.dataset;
      repository = opened.repository;
      preferences.demoEnabledSpecies = [...dataset.settings.enabledSpecies];
      await saveAppPreferences(preferencesPath, preferences);
      return snapshot();
    }
    return mutate((service) => void service.setEnabledSpecies(species));
  });
  handle(IPC.updateAnimal, async (_event, input: AnimalUpdateInput) =>
    mutate((service) => void service.updateAnimal(input)),
  );
  handle(IPC.createFamily, async (_event, input: FamilyInput) =>
    mutate((service) => void service.createFamily(input)),
  );
  handle(
    IPC.addFamilyHoliday,
    async (
      _event,
      input: { familyId: string; startDate: string; endDate: string; notes?: string },
    ) =>
      mutate(
        (service) =>
          void service.addFamilyHoliday(
            input.familyId,
            input.startDate,
            input.endDate,
            input.notes,
          ),
      ),
  );
  handle(IPC.createAdopter, async (_event, input: AdopterInput) =>
    mutate((service) => void service.createAdopter(input)),
  );
  handle(IPC.assessPlacement, async (_event, input: PlacementInput) =>
    new AnimalService(dataset).assessPlacement(input),
  );
  handle(IPC.startPlacement, async (_event, input: PlacementInput) =>
    mutate((service) => void service.startPlacement(input)),
  );
  handle(
    IPC.endPlacement,
    async (_event, input: { placementId: string; endDate: string; outcome?: string }) =>
      mutate(
        (service) => void service.endPlacement(input.placementId, input.endDate, input.outcome),
      ),
  );
  handle(
    IPC.sendToRefuge,
    async (
      _event,
      input: { animalId: string; zoneId: string; date: string; reason?: string; notes?: string },
    ) =>
      mutate(
        (service) =>
          void service.sendToRefuge(
            input.animalId,
            input.zoneId,
            input.date,
            input.reason,
            input.notes,
          ),
      ),
  );
  handle(
    IPC.createRefugeZone,
    async (
      _event,
      input: {
        name: string;
        description?: string;
        allowedSpecies?: import("../core/types").SpeciesId[] | null;
      },
    ) =>
      mutate(
        (service) =>
          void service.createRefugeZone(input.name, input.description, input.allowedSpecies),
      ),
  );
  handle(
    IPC.updateRefugeZone,
    async (
      _event,
      input: {
        id: string;
        name: string;
        description?: string;
        allowedSpecies?: import("../core/types").SpeciesId[] | null;
      },
    ) =>
      mutate(
        (service) =>
          void service.updateRefugeZone(
            input.id,
            input.name,
            input.description,
            input.allowedSpecies,
          ),
      ),
  );
  handle(IPC.deleteRefugeZone, async (_event, id: string) =>
    mutate((service) => void service.deleteRefugeZone(id)),
  );
  handle(IPC.createAdoption, async (_event, input: AdoptionInput) =>
    mutate((service) => void service.createAdoption(input)),
  );
  handle(IPC.createAdoptionWithNewFamily, async (_event, input: AdoptionWithNewFamilyInput) =>
    mutate((service) => void service.createAdoptionWithNewFamily(input)),
  );
  handle(
    IPC.returnAdoption,
    async (
      _event,
      input: { adoptionId: string; date: string; notes?: string; refugeZoneId?: string },
    ) =>
      mutate((service, draft) => {
        const adoption = draft.adoptions.find((candidate) => candidate.id === input.adoptionId);
        if (!adoption) {
          throw new Error("Adoption introuvable.");
        }
        service.returnAdoption(input.adoptionId, input.date, input.notes);
        if (input.refugeZoneId) {
          service.sendToRefuge(
            adoption.animalId,
            input.refugeZoneId,
            input.date,
            "Retour d'adoption",
            input.notes,
          );
        }
      }),
  );
  handle(IPC.createAdoptionDay, async (_event, input: AdoptionDayInput) =>
    mutate((service) => void service.createAdoptionDay(input)),
  );
  handle(IPC.getAdoptionDaySuggestions, async (_event, adoptionDayId: string) =>
    new AnimalService(dataset).getAdoptionDaySuggestions(adoptionDayId),
  );
  handle(
    IPC.addAnimalsToAdoptionDay,
    async (
      _event,
      input: {
        adoptionDayId: string;
        animalIds: string[];
        overrideWarnings?: boolean;
        overrideReason?: string;
      },
    ) =>
      mutate(
        (service) =>
          void service.addAnimalsToAdoptionDay(
            input.adoptionDayId,
            input.animalIds,
            input.overrideWarnings,
            input.overrideReason,
          ),
      ),
  );
  handle(IPC.withdrawAnimalFromAdoptionDay, async (_event, registrationId: string) =>
    mutate((service) => void service.withdrawAnimalFromAdoptionDay(registrationId)),
  );
  handle(
    IPC.bookAnimalForAdoption,
    async (_event, input: { registrationId: string; adopterId: string; bookedAt: string }) =>
      mutate(
        (service) =>
          void service.bookAnimalForAdoption(input.registrationId, input.adopterId, input.bookedAt),
      ),
  );
  handle(
    IPC.confirmAdoptionBooking,
    async (_event, input: { registrationId: string; adoptionDate: string }) =>
      mutate(
        (service) => void service.confirmAdoptionBooking(input.registrationId, input.adoptionDate),
      ),
  );
  handle(
    IPC.createPartnerPlace,
    async (_event, input: { name: string; address?: string; notes?: string }) =>
      mutate((service) => void service.createPartnerPlace(input.name, input.address, input.notes)),
  );
  handle(IPC.deletePartnerPlace, async (_event, id: string) =>
    mutate((service) => void service.deletePartnerPlace(id)),
  );
  handle(
    IPC.declareSickness,
    async (
      _event,
      input: {
        animalId: string;
        disease: string;
        declaredAt: string;
        lookbackDays: number;
        notes?: string;
      },
    ) => {
      const draft = structuredClone(dataset);
      const result = new AnimalService(draft).declareSickness(
        input.animalId,
        input.disease,
        input.declaredAt,
        input.lookbackDays,
        input.notes,
      );
      await repository.save(draft);
      dataset = draft;
      return { snapshot: snapshot(), exposures: result.exposures };
    },
  );
  handle(
    IPC.resolveHealthAlert,
    async (_event, input: { alertId: string; resolvedAt: string; notes?: string }) =>
      mutate(
        (service) => void service.resolveHealthAlert(input.alertId, input.resolvedAt, input.notes),
      ),
  );
  handle(IPC.getHealthExposures, async (_event, healthAlertId: string) =>
    new AnimalService(dataset).getHealthExposures(healthAlertId),
  );
  handle(IPC.createSponsorship, async (_event, input: import("../shared/types").SponsorshipInput) =>
    mutate((service) => void service.createSponsorship(input)),
  );
  handle(
    IPC.updateSponsorship,
    async (_event, input: import("../shared/types").SponsorshipInput & { id: string }) =>
      mutate((service) => void service.createSponsorship(input, input.id)),
  );
  handle(
    IPC.declareAnimalDeceased,
    async (_event, input: { animalId: string; date: string; notes?: string }) =>
      mutate(
        (service) => void service.declareAnimalDeceased(input.animalId, input.date, input.notes),
      ),
  );
  handle(IPC.createTask, async (_event, input: import("../shared/types").TaskInput) =>
    mutate((service) => void service.createTask(input)),
  );
  handle(IPC.recordCare, async (_event, input: import("../shared/types").CareRecordInput) =>
    mutate((service) => void service.recordCare(input)),
  );
  handle(
    IPC.recordAnimalHistory,
    async (_event, input: import("../shared/types").AnimalHistoryInput) =>
      mutate((service) => void service.recordAnimalHistory(input)),
  );
  handle(IPC.deleteAnimalEvent, async (_event, eventId: string) =>
    mutate((service) => void service.deleteAnimalEvent(eventId)),
  );
  handle(
    IPC.completeTask,
    async (_event, input: { id: string; completedAt: string; nextDueDate?: string }) =>
      mutate(
        (service) => void service.completeTask(input.id, input.completedAt, input.nextDueDate),
      ),
  );
  handle(IPC.chooseDataset, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    try {
      await openDataset(result.filePaths[0]);
    } catch (error) {
      if (error instanceof MigrationCancelledError) {
        return null;
      }
      throw error;
    }
    preferences.realDatasetDirectory = result.filePaths[0];
    await saveAppPreferences(preferencesPath, preferences);
    await generateDueEmails();
    return snapshot();
  });
  handle(IPC.updateEmailTemplates, async (_event, templates: EmailTemplates) => {
    if (
      !templates ||
      !Number.isInteger(templates.leadDays) ||
      templates.leadDays < 0 ||
      templates.leadDays > 90
    ) {
      throw new Error("Le délai de rappel doit être compris entre 0 et 90 jours.");
    }
    for (const key of ["sterilisation", "vaccination", "antiFlea", "deworming", "icad"] as const) {
      const template = templates[key];
      if (!template || typeof template.subject !== "string" || typeof template.body !== "string") {
        throw new Error("Modèle d’e-mail invalide.");
      }
    }
    preferences.emailTemplates = structuredClone(templates);
    await saveAppPreferences(preferencesPath, preferences);
    return snapshot();
  });
  handle(IPC.acknowledgeEmail, async (_event, id: string) => {
    const emails = preferences.generatedEmailsByDataset[dataset.datasetId] ?? [];
    const email = emails.find((candidate) => candidate.id === id);
    if (email && !email.acknowledgedAt) {
      email.acknowledgedAt = new Date().toISOString();
      await saveAppPreferences(preferencesPath, preferences);
    }
    return snapshot();
  });
  handle(IPC.chooseEmailOutputDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle(IPC.setEmailOutputDirectory, async (_event, path: string) => {
    if (typeof path !== "string") {
      throw new Error("Dossier d’export invalide.");
    }
    preferences.emailOutputDirectory = path;
    await saveAppPreferences(preferencesPath, preferences);
    return snapshot();
  });
  handle(IPC.exportReadyEmails, async () => {
    if (!preferences.emailOutputDirectory) {
      throw new Error("Choisissez d’abord un dossier de destination.");
    }
    const emails = (preferences.generatedEmailsByDataset[dataset.datasetId] ?? []).filter(
      (email) => !email.acknowledgedAt,
    );
    await mkdir(preferences.emailOutputDirectory, { recursive: true });
    for (const email of emails) {
      const safe = (value: string) => value.replace(/[\r\n]/g, " ");
      const encodedSubject = `=?UTF-8?B?${Buffer.from(safe(email.subject), "utf8").toString("base64")}?=`;
      const content = [
        `To: ${safe(email.recipient)}`,
        `Subject: ${encodedSubject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        email.body.replace(/\r?\n/g, "\r\n"),
        "",
      ].join("\r\n");
      await writeFile(join(preferences.emailOutputDirectory, email.filename), content, "utf8");
    }
    return {
      snapshot: snapshot(),
      exportedCount: emails.length,
      directory: preferences.emailOutputDirectory,
    };
  });
  handle(IPC.chooseLegacyCsv, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Fichiers CSV", extensions: ["csv"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const path = result.filePaths[0];
    return previewLegacyCsv(await readFile(path, "utf8"), path);
  });
  handle(IPC.commitLegacyImport, async (_event, preview: LegacyImportPreview) => {
    const draft = structuredClone(dataset);
    const result = commitLegacyPreview(draft, preview);
    await repository.save(draft);
    dataset = draft;
    return { snapshot: snapshot(), result };
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: "#f3efe8",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.removeMenu();
  mainWindow = window;
  window.loadFile(join(__dirname, "../dist/index.html"));
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  return window;
}

app.whenReady().then(async () => {
  const userDataDirectory = app.getPath("userData");
  preferencesPath = join(userDataDirectory, "app-preferences.json");
  demoDatasetDirectory = join(userDataDirectory, "demo-dataset");
  preferences = await loadAppPreferences(preferencesPath, join(userDataDirectory, "dataset"));
  showDemoWelcome = !preferences.demoWelcomeSeen;
  try {
    await activateMode(forcedDemoMode || preferences.demoMode);
  } catch (error) {
    if (!(error instanceof MigrationCancelledError)) {
      throw error;
    }
    const choice = await dialog.showMessageBox({
      type: "warning",
      title: "Ouverture du registre annulée",
      message: "Le registre n'a pas été modifié.",
      detail:
        "Vous pouvez essayer le mode démo, choisir un autre dossier ou quitter l'application.",
      buttons: ["Essayer la démo", "Choisir un autre dossier", "Quitter"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (choice.response === 0) {
      await activateMode(true);
      preferences.demoMode = true;
    } else if (choice.response === 1) {
      const selected = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!selected.canceled && selected.filePaths[0]) {
        await openDataset(selected.filePaths[0]);
        preferences.realDatasetDirectory = selected.filePaths[0];
        preferences.demoMode = false;
        await saveAppPreferences(preferencesPath, preferences);
      } else {
        app.quit();
        return;
      }
    } else {
      app.quit();
      return;
    }
  }
  await saveAppPreferences(preferencesPath, preferences);
  registerHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
