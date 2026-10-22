import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type { AnimalAppApi } from "../shared/types";

const api: AnimalAppApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  setEnabledSpecies: (species) => ipcRenderer.invoke(IPC.setEnabledSpecies, species),
  setDemoMode: (enabled) => ipcRenderer.invoke(IPC.setDemoMode, enabled),
  dismissDemoWelcome: () => ipcRenderer.invoke(IPC.dismissDemoWelcome),
  createAnimal: (input) => ipcRenderer.invoke(IPC.createAnimal, input),
  updateAnimal: (input) => ipcRenderer.invoke(IPC.updateAnimal, input),
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
  createAdoptionWithNewFamily: (input) =>
    ipcRenderer.invoke(IPC.createAdoptionWithNewFamily, input),
  returnAdoption: (input) => ipcRenderer.invoke(IPC.returnAdoption, input),
  createAdoptionDay: (input) => ipcRenderer.invoke(IPC.createAdoptionDay, input),
  getAdoptionDaySuggestions: (adoptionDayId) =>
    ipcRenderer.invoke(IPC.getAdoptionDaySuggestions, adoptionDayId),
  addAnimalsToAdoptionDay: (input) => ipcRenderer.invoke(IPC.addAnimalsToAdoptionDay, input),
  withdrawAnimalFromAdoptionDay: (registrationId) =>
    ipcRenderer.invoke(IPC.withdrawAnimalFromAdoptionDay, registrationId),
  bookAnimalForAdoption: (input) => ipcRenderer.invoke(IPC.bookAnimalForAdoption, input),
  confirmAdoptionBooking: (input) => ipcRenderer.invoke(IPC.confirmAdoptionBooking, input),
  createPartnerPlace: (input) => ipcRenderer.invoke(IPC.createPartnerPlace, input),
  deletePartnerPlace: (id) => ipcRenderer.invoke(IPC.deletePartnerPlace, id),
  declareSickness: (input) => ipcRenderer.invoke(IPC.declareSickness, input),
  resolveHealthAlert: (input) => ipcRenderer.invoke(IPC.resolveHealthAlert, input),
  getHealthExposures: (healthAlertId) => ipcRenderer.invoke(IPC.getHealthExposures, healthAlertId),
  createSponsorship: (input) => ipcRenderer.invoke(IPC.createSponsorship, input),
  updateSponsorship: (input) => ipcRenderer.invoke(IPC.updateSponsorship, input),
  declareAnimalDeceased: (input) => ipcRenderer.invoke(IPC.declareAnimalDeceased, input),
  createTask: (input) => ipcRenderer.invoke(IPC.createTask, input),
  recordCare: (input) => ipcRenderer.invoke(IPC.recordCare, input),
  recordAnimalHistory: (input) => ipcRenderer.invoke(IPC.recordAnimalHistory, input),
  deleteAnimalEvent: (eventId) => ipcRenderer.invoke(IPC.deleteAnimalEvent, eventId),
  completeTask: (input) => ipcRenderer.invoke(IPC.completeTask, input),
  chooseAndPreviewLegacyCsv: () => ipcRenderer.invoke(IPC.chooseLegacyCsv),
  commitLegacyImport: (preview) => ipcRenderer.invoke(IPC.commitLegacyImport, preview),
  chooseDatasetDirectory: () => ipcRenderer.invoke(IPC.chooseDataset),
  updateEmailTemplates: (templates) => ipcRenderer.invoke(IPC.updateEmailTemplates, templates),
  acknowledgeEmail: (id) => ipcRenderer.invoke(IPC.acknowledgeEmail, id),
  chooseEmailOutputDirectory: () => ipcRenderer.invoke(IPC.chooseEmailOutputDirectory),
  setEmailOutputDirectory: (path) => ipcRenderer.invoke(IPC.setEmailOutputDirectory, path),
  exportReadyEmails: () => ipcRenderer.invoke(IPC.exportReadyEmails),
};

contextBridge.exposeInMainWorld("catApp", api);
