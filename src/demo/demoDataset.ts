import { CatService } from "../application/catService";
import { createEmptyDataset } from "../domain/dataset";
import type { CatProfile, Dataset, SterilizationStatus } from "../shared/types";

const CAT_NAMES = [
  "Amande", "Biscotte", "Cannelle", "Django", "Étoile", "Ficelle", "Gaston", "Havana",
  "Iris", "Jasper", "Kiwi", "Luna", "Milo", "Nala", "Olive", "Pistache",
  "Quartz", "Réglisse", "Simba", "Tigrou", "Ulysse", "Vanille", "Willow", "Yuzu",
  "Zéphyr", "Alba", "Bounty", "Clochette", "Domino", "Eska", "Flocon", "Griotte",
  "Happy", "Inaya", "Jazz", "Kumo", "Litchi", "Moka", "Nébula", "Oreo",
  "Pixel", "Romy", "Sushi", "Tao", "Uma", "Violette", "Watson", "Yoko",
  "Ziggy", "Arlo", "Bulle", "Cosmo", "Dune", "Elvis", "Félix", "Gaïa",
  "Hermès", "Isis", "Juno", "Kali", "Lotus", "Mousse", "Nova", "Onyx"
];

const FOSTERS = [
  ["Maison des cinq chats", "Léa", "Durand", 7],
  ["Les moustaches de Marc", "Marc", "Bernard", 4],
  ["Biberons d'Inès", "Inès", "Robert", 5],
  ["Chez Hugo", "Hugo", "Petit", 3],
  ["La retraite de Nora", "Nora", "Moreau", 4],
  ["Famille Simon", "Luc", "Simon", 6],
  ["Les félins de Chloé", "Chloé", "Laurent", 4],
  ["Chez Noé", "Noé", "Michel", 5]
] as const;

const ADOPTERS = [
  ["Eva", "Leroy"], ["Paul", "Roux"], ["Maya", "David"], ["Liam", "Bertrand"],
  ["Alice", "Martin"], ["Louis", "Garcia"], ["Sarah", "Fontaine"], ["Tom", "Bonnet"],
  ["Zoé", "François"], ["Nathan", "Mercier"], ["Emma", "Robin"], ["Arthur", "Gauthier"]
] as const;

const PROFILES: CatProfile[] = ["KITTEN", "ADULT", "ADULT", "SENIOR", "SPECIAL_NEEDS", "BOTTLE_KITTEN"];
const ALL_PROFILES: CatProfile[] = ["BOTTLE_KITTEN", "KITTEN", "ADULT", "SENIOR", "SPECIAL_NEEDS"];

export function createDemoDataset(): Dataset {
  const dataset = createEmptyDataset("Démonstration Cha'Mania");
  const service = new CatService(dataset);

  CAT_NAMES.forEach((name, index) => {
    const month = String((index % 12) + 1).padStart(2, "0");
    const day = String((index % 24) + 1).padStart(2, "0");
    const sterilizationStatus: SterilizationStatus = index % 3 === 0 ? "DONE" : index % 3 === 1 ? "TODO" : "UNKNOWN";
    const adoptionEligibility = index === 18 || index === 19 ? "INELIGIBLE" : index === 6 ? "ON_HOLD" : "ELIGIBLE";
    service.createCat({
      name,
      identificationNumber: index % 7 === 0 ? "" : `25026${String(1000000000 + index).padStart(10, "0")}`,
      birthDate: `${2021 + (index % 5)}-${month}-${day}`,
      intakeDate: `2025-${month}-${day}`,
      sex: index % 2 === 0 ? "F" : "M",
      profile: PROFILES[index % PROFILES.length],
      sterilizationStatus,
      adoptionEligibility,
      adoptionBlockedReason: index === 18 ? "Traitement longue durée" : index === 19 ? "Chat trop craintif" : index === 6 ? "Bilan vétérinaire en attente" : "",
      notes: index % 8 === 0 ? "Chat sociable, habitué à la vie en appartement." : ""
    });
  });

  FOSTERS.forEach(([label, firstName, lastName, maxCapacity], index) => {
    const acceptedProfiles = index === 2 ? ["BOTTLE_KITTEN", "KITTEN"] as CatProfile[]
      : index === 4 ? ["SENIOR", "SPECIAL_NEEDS"] as CatProfile[] : ALL_PROFILES;
    service.createFamily({
      label, firstName, lastName, maxCapacity, acceptedProfiles,
      email: `${firstName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}.${lastName.toLowerCase()}@example.test`,
      phone: `00 00 00 00 ${String(index).padStart(2, "0")}`,
      address: `Adresse fictive ${index + 1}`
    });
  });

  ADOPTERS.forEach(([firstName, lastName], index) => service.createAdopter({
    firstName, lastName,
    email: `${firstName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}.${lastName.toLowerCase()}@example.test`,
    phone: `00 00 00 00 ${String(index + 20).padStart(2, "0")}`,
    address: `Adresse fictive ${index + 20}`
  }));

  // A five-cat household makes the bulk “tout le cheptel” workflow immediately visible.
  for (let index = 0; index < 5; index += 1) service.startPlacement({
    catId: dataset.cats[index].id, familyId: dataset.families[0].id,
    startDate: `2026-01-${String(index + 2).padStart(2, "0")}`, notes: "Placement de démonstration"
  });
  for (let index = 5; index < 9; index += 1) service.startPlacement({
    catId: dataset.cats[index].id, familyId: dataset.families[1].id,
    startDate: `2026-01-${String(index + 2).padStart(2, "0")}`, notes: "Placement de démonstration"
  });
  for (let index = 9; index < 13; index += 1) service.startPlacement({
    catId: dataset.cats[index].id, familyId: dataset.families[5].id,
    startDate: `2026-01-${String(index + 2).padStart(2, "0")}`, notes: "Placement de démonstration"
  });

  service.addFamilyHoliday(dataset.families[1].id, "2026-09-10", "2026-09-24", "Vacances annuelles");
  service.addFamilyHoliday(dataset.families[3].id, "2026-10-01", "2026-10-08", "Indisponible");

  const quarantine = service.createRefugeZone("Quarantaine", "Entrées récentes et surveillance").refugeZones.at(-1)!;
  const nursery = service.createRefugeZone("Nurserie", "Chatons séparés des adultes").refugeZones.at(-1)!;
  for (let index = 13; index < 18; index += 1) service.sendToRefuge(
    dataset.cats[index].id, index < 16 ? quarantine.id : nursery.id, `2026-02-${String(index).padStart(2, "0")}`, "Accueil au refuge"
  );

  for (let index = 20; index < 36; index += 1) service.createAdoption({
    catIds: [dataset.cats[index].id], adopterId: dataset.adopters[index % dataset.adopters.length].id,
    adoptionDate: `2026-04-${String((index % 20) + 1).padStart(2, "0")}`,
    partner: index % 2 === 0 ? "Partenaire Démo A" : "Partenaire Démo B"
  });
  for (let index = 20; index < 23; index += 1) {
    const adoption = dataset.adoptions.find((candidate) => candidate.catId === dataset.cats[index].id)!;
    service.returnAdoption(adoption.id, `2026-05-${String(index - 10).padStart(2, "0")}`, "L'adoption n'a pas convenu");
    service.sendToRefuge(dataset.cats[index].id, dataset.refugeZones[0].id, `2026-05-${String(index - 10).padStart(2, "0")}`, "Retour d'adoption");
  }

  const adoptionDay = service.createAdoptionDay({
    name: "Partenaire Démo A · 05/09/2026–06/09/2026", startDate: "2026-09-05", endDate: "2026-09-06",
    partner: "Partenaire Démo A", location: "Galerie principale", notes: "Événement de démonstration sur deux jours"
  }).adoptionDays.at(-1)!;
  service.addCatsToAdoptionDay(adoptionDay.id, [dataset.cats[0].id, dataset.cats[2].id]);
  service.createAdoptionDay({ name: "Association · 17/10/2026–18/10/2026", startDate: "2026-10-17", endDate: "2026-10-18", location: "Le refuge" });
  service.createPartnerPlace("Partenaire Démo A", "Adresse fictive A");
  service.createPartnerPlace("Partenaire Démo B", "Adresse fictive B");

  // The alert demonstrates co-location tracing inside one foster family.
  service.declareSickness(dataset.cats[4].id, "Coryza suspecté", "2026-08-28", 21, "Surveillance des contacts");

  const timestamp = new Date().toISOString();
  dataset.catEvents.push(
    { id: crypto.randomUUID(), catId: dataset.cats[36].id, type: "LOST", date: "2026-07-10", notes: "Avis de recherche de démonstration", createdAt: timestamp },
    { id: crypto.randomUUID(), catId: dataset.cats[37].id, type: "DECEASED", date: "2026-07-12", notes: "Donnée de démonstration", createdAt: timestamp }
  );

  dataset.cats.filter((cat) => cat.sterilizationStatus === "TODO").slice(0, 12).forEach((cat, index) => dataset.tasks.push({
    id: crypto.randomUUID(), catId: cat.id, type: "Stérilisation", status: "OPEN",
    dueDate: `2026-09-${String((index % 20) + 1).padStart(2, "0")}`, completedAt: "",
    notes: "Tâche de démonstration", createdAt: timestamp, updatedAt: timestamp
  }));

  dataset.adoptions.filter((adoption) => adoption.status === "ACTIVE").slice(0, 8).forEach((adoption, index) => dataset.followUps.push({
    id: crypto.randomUUID(), catId: adoption.catId, adoptionId: adoption.id,
    requestedAt: `2026-08-${String(index + 1).padStart(2, "0")}`, response: index % 2 ? "Photos reçues" : "",
    lastNewsAt: index % 2 ? `2026-08-${String(index + 2).padStart(2, "0")}` : "",
    createdAt: timestamp, updatedAt: timestamp
  }));

  dataset.updatedAt = timestamp;
  return dataset;
}
