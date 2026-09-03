import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type { CatAppApi } from "../shared/types";

const api: CatAppApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  setDemoMode: (enabled) => ipcRenderer.invoke(IPC.setDemoMode, enabled),
  dismissDemoWelcome: () => ipcRenderer.invoke(IPC.dismissDemoWelcome),
  createCat: (input) => ipcRenderer.invoke(IPC.createCat, input),
  updateCat: (input) => ipcRenderer.invoke(IPC.updateCat, input),
  createFamily: (input) => ipcRenderer.invoke(IPC.createFamily, input),
  addFamilyHoliday: (input) => ipcRenderer.invoke(IPC.addFamilyHoliday, input),
  createAdopter: (input) => ipcRenderer.invoke(IPC.createAdopter, input),
  assessPlacement: (input) => ipcRenderer.invoke(IPC.assessPlacement, input),
  startPlacement: (input) => ipcRenderer.invoke(IPC.startPlacement, input),
  endPlacement: (input) => ipcRenderer.invoke(IPC.endPlacement, input),
  sendToRefuge: (input) => ipcRenderer.invoke(IPC.sendToRefuge, input),
  createRefugeZone: (input) => ipcRenderer.invoke(IPC.createRefugeZone, input),
  updateRefugeZone: (input) => ipcRenderer.invoke(IPC.updateRefugeZone, input),
  deleteRefugeZone: (id) => ipcRenderer.invoke(IPC.deleteRefugeZone, id),
  createAdoption: (input) => ipcRenderer.invoke(IPC.createAdoption, input),
  createAdoptionWithNewFamily: (input) => ipcRenderer.invoke(IPC.createAdoptionWithNewFamily, input),
  returnAdoption: (input) => ipcRenderer.invoke(IPC.returnAdoption, input),
  createAdoptionDay: (input) => ipcRenderer.invoke(IPC.createAdoptionDay, input),
  getAdoptionDaySuggestions: (adoptionDayId) => ipcRenderer.invoke(IPC.getAdoptionDaySuggestions, adoptionDayId),
  addCatsToAdoptionDay: (input) => ipcRenderer.invoke(IPC.addCatsToAdoptionDay, input),
  withdrawCatFromAdoptionDay: (registrationId) => ipcRenderer.invoke(IPC.withdrawCatFromAdoptionDay, registrationId),
  bookCatForAdoption: (input) => ipcRenderer.invoke(IPC.bookCatForAdoption, input),
  confirmAdoptionBooking: (input) => ipcRenderer.invoke(IPC.confirmAdoptionBooking, input),
  createPartnerPlace: (input) => ipcRenderer.invoke(IPC.createPartnerPlace, input),
  deletePartnerPlace: (id) => ipcRenderer.invoke(IPC.deletePartnerPlace, id),
  declareSickness: (input) => ipcRenderer.invoke(IPC.declareSickness, input),
  resolveHealthAlert: (input) => ipcRenderer.invoke(IPC.resolveHealthAlert, input),
  getHealthExposures: (healthAlertId) => ipcRenderer.invoke(IPC.getHealthExposures, healthAlertId),
  chooseAndPreviewLegacyCsv: () => ipcRenderer.invoke(IPC.chooseLegacyCsv),
  commitLegacyImport: (preview) => ipcRenderer.invoke(IPC.commitLegacyImport, preview),
  chooseDatasetDirectory: () => ipcRenderer.invoke(IPC.chooseDataset)
};

contextBridge.exposeInMainWorld("catApp", api);
