import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CatService } from "../application/catService";
import { createDemoDataset } from "../demo/demoDataset";
import { deriveCatView } from "../domain/dataset";
import { DatasetRepository } from "../infrastructure/datasetRepository";
import { commitLegacyPreview, previewLegacyCsv } from "../legacy/legacyImport";
import { IPC } from "../shared/ipc";
import type {
  AdoptionInput,
  AdoptionDayInput,
  AdoptionWithNewFamilyInput,
  AdopterInput,
  AppSnapshot,
  CatInput,
  CatUpdateInput,
  Dataset,
  FamilyInput,
  LegacyImportPreview,
  PlacementInput
} from "../shared/types";

const demoMode = process.env.CAT_DISPENSER_DEMO === "1";
let repository: DatasetRepository;
let dataset: Dataset;

function snapshot(): AppSnapshot {
  return {
    ...dataset,
    datasetPath: repository.directory,
    demoMode,
    catViews: dataset.cats.map((cat) => deriveCatView(dataset, cat))
  };
}

async function openDataset(directory: string): Promise<AppSnapshot> {
  const opened = await DatasetRepository.open(directory);
  repository = opened.repository;
  dataset = opened.dataset;
  return snapshot();
}

async function mutate(action: (service: CatService, draft: Dataset) => void): Promise<AppSnapshot> {
  const draft = structuredClone(dataset);
  action(new CatService(draft), draft);
  await repository.save(draft);
  dataset = draft;
  return snapshot();
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!url.startsWith("file://")) throw new Error("Appel IPC refusé.");
}

function handle(channel: string, callback: (event: IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedRenderer(event);
    return callback(event, ...(args as never[]));
  });
}

function registerHandlers(): void {
  handle(IPC.bootstrap, async () => snapshot());
  handle(IPC.createCat, async (_event, input: CatInput) => mutate((service) => void service.createCat(input)));
  handle(IPC.updateCat, async (_event, input: CatUpdateInput) => mutate((service) => void service.updateCat(input)));
  handle(IPC.createFamily, async (_event, input: FamilyInput) => mutate((service) => void service.createFamily(input)));
  handle(IPC.addFamilyHoliday, async (_event, input: { familyId: string; startDate: string; endDate: string; notes?: string }) =>
    mutate((service) => void service.addFamilyHoliday(input.familyId, input.startDate, input.endDate, input.notes)));
  handle(IPC.createAdopter, async (_event, input: AdopterInput) => mutate((service) => void service.createAdopter(input)));
  handle(IPC.assessPlacement, async (_event, input: PlacementInput) => new CatService(dataset).assessPlacement(input));
  handle(IPC.startPlacement, async (_event, input: PlacementInput) => mutate((service) => void service.startPlacement(input)));
  handle(IPC.endPlacement, async (_event, input: { placementId: string; endDate: string; outcome?: string }) =>
    mutate((service) => void service.endPlacement(input.placementId, input.endDate, input.outcome)));
  handle(IPC.sendToRefuge, async (_event, input: { catId: string; zoneId: string; date: string; reason?: string; notes?: string }) =>
    mutate((service) => void service.sendToRefuge(input.catId, input.zoneId, input.date, input.reason, input.notes)));
  handle(IPC.createRefugeZone, async (_event, input: { name: string; description?: string }) =>
    mutate((service) => void service.createRefugeZone(input.name, input.description)));
  handle(IPC.updateRefugeZone, async (_event, input: { id: string; name: string; description?: string }) =>
    mutate((service) => void service.updateRefugeZone(input.id, input.name, input.description)));
  handle(IPC.deleteRefugeZone, async (_event, id: string) => mutate((service) => void service.deleteRefugeZone(id)));
  handle(IPC.createAdoption, async (_event, input: AdoptionInput) => mutate((service) => void service.createAdoption(input)));
  handle(IPC.createAdoptionWithNewFamily, async (_event, input: AdoptionWithNewFamilyInput) =>
    mutate((service) => void service.createAdoptionWithNewFamily(input)));
  handle(IPC.returnAdoption, async (_event, input: { adoptionId: string; date: string; notes?: string; refugeZoneId?: string }) =>
    mutate((service, draft) => {
      const adoption = draft.adoptions.find((candidate) => candidate.id === input.adoptionId);
      if (!adoption) throw new Error("Adoption introuvable.");
      service.returnAdoption(input.adoptionId, input.date, input.notes);
      if (input.refugeZoneId) service.sendToRefuge(adoption.catId, input.refugeZoneId, input.date, "Retour d'adoption", input.notes);
    }));
  handle(IPC.createAdoptionDay, async (_event, input: AdoptionDayInput) => mutate((service) => void service.createAdoptionDay(input)));
  handle(IPC.getAdoptionDaySuggestions, async (_event, adoptionDayId: string) => new CatService(dataset).getAdoptionDaySuggestions(adoptionDayId));
  handle(IPC.addCatsToAdoptionDay, async (_event, input: { adoptionDayId: string; catIds: string[]; overrideWarnings?: boolean; overrideReason?: string }) =>
    mutate((service) => void service.addCatsToAdoptionDay(input.adoptionDayId, input.catIds, input.overrideWarnings, input.overrideReason)));
  handle(IPC.withdrawCatFromAdoptionDay, async (_event, registrationId: string) =>
    mutate((service) => void service.withdrawCatFromAdoptionDay(registrationId)));
  handle(IPC.bookCatForAdoption, async (_event, input: { registrationId: string; adopterId: string; bookedAt: string }) =>
    mutate((service) => void service.bookCatForAdoption(input.registrationId, input.adopterId, input.bookedAt)));
  handle(IPC.confirmAdoptionBooking, async (_event, input: { registrationId: string; adoptionDate: string }) =>
    mutate((service) => void service.confirmAdoptionBooking(input.registrationId, input.adoptionDate)));
  handle(IPC.createPartnerPlace, async (_event, input: { name: string; address?: string; notes?: string }) =>
    mutate((service) => void service.createPartnerPlace(input.name, input.address, input.notes)));
  handle(IPC.deletePartnerPlace, async (_event, id: string) => mutate((service) => void service.deletePartnerPlace(id)));
  handle(IPC.declareSickness, async (_event, input: { catId: string; disease: string; declaredAt: string; lookbackDays: number; notes?: string }) => {
    const draft = structuredClone(dataset);
    const result = new CatService(draft).declareSickness(input.catId, input.disease, input.declaredAt, input.lookbackDays, input.notes);
    await repository.save(draft);
    dataset = draft;
    return { snapshot: snapshot(), exposures: result.exposures };
  });
  handle(IPC.resolveHealthAlert, async (_event, input: { alertId: string; resolvedAt: string; notes?: string }) =>
    mutate((service) => void service.resolveHealthAlert(input.alertId, input.resolvedAt, input.notes)));
  handle(IPC.getHealthExposures, async (_event, healthAlertId: string) => new CatService(dataset).getHealthExposures(healthAlertId));
  handle(IPC.chooseDataset, async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return result.canceled || !result.filePaths[0] ? null : openDataset(result.filePaths[0]);
  });
  handle(IPC.chooseLegacyCsv, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Fichiers CSV", extensions: ["csv"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
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
      sandbox: true
    }
  });
  window.removeMenu();
  window.loadFile(join(__dirname, "../dist/index.html"));
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  return window;
}

app.whenReady().then(async () => {
  const datasetDirectory = demoMode
    ? join(app.getPath("temp"), "cat-dispenser-demo-dataset")
    : join(app.getPath("userData"), "dataset");
  if (demoMode && process.env.CAT_DISPENSER_DEMO_RESET === "1") {
    await rm(datasetDirectory, { recursive: true, force: true });
  }
  await openDataset(datasetDirectory);
  if (demoMode && dataset.cats.length === 0) {
    dataset = createDemoDataset();
    await repository.save(dataset, false);
  }
  registerHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
