import { AnimalService } from "../application/animalService";
import type { AnimalProfile, Dataset, SpeciesId, SterilizationStatus } from "../core/types";
import { createEmptyDataset, getAnimalStatus } from "../domain/dataset";
import { createSpeciesDemoData, getSpeciesDefinition } from "../domain/species/registry";

const CAT_NAMES = [
  "Amande",
  "Biscotte",
  "Cannelle",
  "Django",
  "Étoile",
  "Ficelle",
  "Gaston",
  "Havana",
  "Iris",
  "Jasper",
  "Kiwi",
  "Luna",
  "Milo",
  "Nala",
  "Olive",
  "Pistache",
  "Quartz",
  "Réglisse",
  "Simba",
  "Tigrou",
  "Ulysse",
  "Vanille",
  "Willow",
  "Yuzu",
  "Zéphyr",
  "Alba",
  "Bounty",
  "Clochette",
  "Domino",
  "Eska",
  "Flocon",
  "Griotte",
  "Happy",
  "Inaya",
  "Jazz",
  "Kumo",
  "Litchi",
  "Moka",
  "Nébula",
  "Oreo",
  "Pixel",
  "Romy",
  "Sushi",
  "Tao",
  "Uma",
  "Violette",
  "Watson",
  "Yoko",
  "Ziggy",
  "Arlo",
  "Bulle",
  "Cosmo",
  "Dune",
  "Elvis",
  "Félix",
  "Gaïa",
  "Hermès",
  "Isis",
  "Juno",
  "Kali",
  "Lotus",
  "Mousse",
  "Nova",
  "Onyx",
];

const FOSTERS: ReadonlyArray<readonly [string, string, string, number]> = [
  ["Maison des cinq chats", "Léa", "Durand", 7],
  ["Les moustaches de Marc", "Marc", "Bernard", 4],
  ["Biberons d'Inès", "Inès", "Robert", 5],
  ["Chez Hugo", "Hugo", "Petit", 3],
  ["La retraite de Nora", "Nora", "Moreau", 4],
  ["Famille Simon", "Luc", "Simon", 6],
  ["Les félins de Chloé", "Chloé", "Laurent", 4],
  ["Chez Noé", "Noé", "Michel", 5],
];

const ADOPTERS: ReadonlyArray<readonly [string, string]> = [
  ["Eva", "Leroy"],
  ["Paul", "Roux"],
  ["Maya", "David"],
  ["Liam", "Bertrand"],
  ["Alice", "Martin"],
  ["Louis", "Garcia"],
  ["Sarah", "Fontaine"],
  ["Tom", "Bonnet"],
  ["Zoé", "François"],
  ["Nathan", "Mercier"],
  ["Emma", "Robin"],
  ["Arthur", "Gauthier"],
];

const PROFILES: AnimalProfile[] = [
  "KITTEN",
  "ADULT",
  "ADULT",
  "SENIOR",
  "SPECIAL_NEEDS",
  "BOTTLE_KITTEN",
];
const ALL_PROFILES: AnimalProfile[] = [
  "BOTTLE_KITTEN",
  "KITTEN",
  "ADULT",
  "SENIOR",
  "SPECIAL_NEEDS",
];

export function createDemoDataset(enabledSpecies: SpeciesId[] = ["cat"]): Dataset {
  const now = new Date();
  // Shift calendar dates in UTC after capturing the user's local day, including across DST.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dateAfterDays = (days: number) =>
    new Date(today + days * 86_400_000).toISOString().slice(0, 10);
  const displayDate = (days: number) => dateAfterDays(days).split("-").reverse().join("/");
  const currentMonth = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const dataset = createEmptyDataset("Démonstration Cha'Mania");
  dataset.settings.enabledSpecies = [...enabledSpecies];
  dataset.refugeZones[0]!.allowedSpecies = [...enabledSpecies];
  const service = new AnimalService(dataset);

  CAT_NAMES.forEach((name, index) => {
    const speciesId = enabledSpecies[index % enabledSpecies.length] ?? "cat";
    const definition = getSpeciesDefinition(speciesId);
    const intendedProfile: AnimalProfile =
      speciesId === "cat"
        ? PROFILES[index % PROFILES.length]
        : definition.profiles[index % definition.profiles.length]!.id;
    // Adopted animals are old enough to leave the nursery, including those later returned.
    const profile =
      speciesId === "cat" && index >= 20 && index < 36 && intendedProfile === "BOTTLE_KITTEN"
        ? "KITTEN"
        : intendedProfile;
    const ageInDays: Record<AnimalProfile, number> = {
      BOTTLE_KITTEN: 24 + (index % 14),
      KITTEN: 90 + (index % 60),
      ADULT: 730 + index * 11,
      SENIOR: 4400 + index * 17,
      SPECIAL_NEEDS: 1460 + index * 7,
      PUPPY: 200 + index * 5,
      YOUNG: 160 + index * 3,
      JUVENILE: 270 + index * 2,
      UNKNOWN: 365 + index,
    };
    const speciesDemo = createSpeciesDemoData(speciesId, now, index, profile);
    const birthDate =
      speciesId === "cat" ? dateAfterDays(-ageInDays[profile]) : speciesDemo.birthDate;
    const ageDays = Math.floor((today - Date.parse(`${birthDate}T00:00:00Z`)) / 86_400_000);
    const intakeDaysAgo = Math.min(ageDays - 7, 120 + index);
    const sterilizationStatus: SterilizationStatus =
      speciesId === "snake"
        ? "UNKNOWN"
        : index % 3 === 0
          ? "DONE"
          : index % 3 === 1
            ? "TODO"
            : "UNKNOWN";
    const adoptionEligibility =
      index === 18 || index === 19 ? "INELIGIBLE" : index === 6 ? "ON_HOLD" : "ELIGIBLE";
    service.createAnimal({
      speciesId,
      speciesData: speciesDemo.speciesData,
      name,
      identificationNumber:
        index % 7 === 0 ? "" : `25026${String(1000000000 + index).padStart(10, "0")}`,
      birthDate,
      intakeDate: dateAfterDays(-intakeDaysAgo),
      sex: index % 2 === 0 ? "F" : "M",
      profile,
      sterilizationStatus,
      adoptionEligibility,
      adoptionBlockedReason:
        index === 18
          ? "Traitement longue durée"
          : index === 19
            ? "Animal trop craintif"
            : index === 6
              ? "Bilan vétérinaire en attente"
              : "",
      notes: index % 8 === 0 ? "Animal sociable, habitué à la vie de famille." : "",
      description:
        index < 8
          ? [
              "Très joueuse, apprécie les temps calmes au soleil.",
              "Curieux et gourmand, il vient facilement au contact.",
              "Douce, un peu réservée au début, puis très proche de sa famille.",
              "Animal calme qui apprécie les endroits tranquilles.",
            ][index % 4]
          : "Animal suivi par l'association, en attente de sa famille.",
      photo: index < 4 ? `https://placehold.co/600x400/png?text=${encodeURIComponent(name)}` : "",
      compatibilityBySpecies: {
        cat: index % 5 === 0 ? false : index % 5 === 1 ? null : true,
        dog: index % 4 === 0 ? false : index % 4 === 1 ? null : true,
      },
      okWithChildren: index % 6 === 0 ? false : index % 6 === 1 ? null : true,
      medications:
        index === 4
          ? "Antibiotique · 1 comprimé"
          : index === 18
            ? "Traitement à préciser avec le vétérinaire"
            : "",
      medicationSchedule: index === 4 ? "08:00 et 20:00" : index === 18 ? "Chaque jour" : "",
      medicationEndDate: index === 4 ? dateAfterDays(3) : "",
      vaccines: index % 3 === 0 ? `Rappel prévu le ${displayDate(6)}` : "Primo-vaccination à jour",
      deworming:
        index % 4 === 0 ? "À renouveler prochainement" : `Dernière prise le ${displayDate(-7)}`,
      antiFlea:
        index % 5 === 0
          ? `Prochaine application le ${displayDate(14)}`
          : `Dernière application le ${displayDate(-7)}`,
    });
  });

  FOSTERS.forEach(([label, firstName, lastName, maxCapacity], index) => {
    const acceptedProfiles: AnimalProfile[] =
      index === 2
        ? ["BOTTLE_KITTEN", "KITTEN"]
        : index === 4
          ? ["SENIOR", "SPECIAL_NEEDS"]
          : ALL_PROFILES;
    const acceptanceRules = Object.fromEntries(
      enabledSpecies.map((speciesId) => {
        const profiles = getSpeciesDefinition(speciesId).profiles.map((profile) => profile.id);
        return [speciesId, { profiles: speciesId === "cat" ? acceptedProfiles : profiles }];
      }),
    );
    service.createFamily({
      label,
      firstName,
      lastName,
      maxCapacity,
      acceptanceRules,
      email: `${firstName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()}.${lastName.toLowerCase()}@example.test`,
      phone: `00 00 00 00 ${String(index).padStart(2, "0")}`,
      address: `Adresse fictive ${index + 1}`,
    });
  });

  ADOPTERS.forEach(([firstName, lastName], index) =>
    service.createAdopter({
      firstName,
      lastName,
      email: `${firstName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()}.${lastName.toLowerCase()}@example.test`,
      phone: `00 00 00 00 ${String(index + 20).padStart(2, "0")}`,
      address: `Adresse fictive ${index + 20}`,
    }),
  );

  const sponsors: ReadonlyArray<readonly [string, string, number, number]> = [
    ["Camille", "Petit", 20, 0],
    ["Julien", "Marchand", 15, 1],
    ["Nadia", "Leroux", 30, 2],
    ["Thomas", "Garnier", 10, 3],
    ["Sophie", "Blanc", 25, 4],
    ["Émilie", "Roux", 15, 5],
  ];
  sponsors.forEach(([firstName, lastName, monthlyAmount, catIndex], index) =>
    service.createSponsorship({
      animalId: dataset.animals[catIndex].id,
      firstName,
      lastName,
      email: `${firstName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()}.${lastName.toLowerCase()}@example.test`,
      monthlyAmount,
      startDate: dataset.animals[catIndex].intakeDate,
      paymentNotes:
        index % 2 === 0 ? `Virement reçu · ${currentMonth}` : `À vérifier pour ${currentMonth}`,
      notes: index === 2 ? "Souhaite recevoir des nouvelles avec photos" : "Parrainage mensuel",
    }),
  );

  // A five-cat household makes the bulk “tout le cheptel” workflow immediately visible.
  for (let index = 0; index < 5; index += 1) {
    service.startPlacement({
      animalId: dataset.animals[index].id,
      familyId: dataset.families[0].id,
      startDate: dateAfterDays(-14 + (index % 4)),
      notes: "Placement de démonstration",
    });
  }
  for (let index = 5; index < 9; index += 1) {
    service.startPlacement({
      animalId: dataset.animals[index].id,
      familyId: dataset.families[1].id,
      startDate: dateAfterDays(-14 + (index % 4)),
      notes: "Placement de démonstration",
    });
  }
  for (let index = 9; index < 13; index += 1) {
    service.startPlacement({
      animalId: dataset.animals[index].id,
      familyId: dataset.families[5].id,
      startDate: dateAfterDays(-14 + (index % 4)),
      notes: "Placement de démonstration",
    });
  }

  service.addFamilyHoliday(
    dataset.families[1].id,
    dateAfterDays(7),
    dateAfterDays(21),
    "Vacances annuelles",
  );
  service.addFamilyHoliday(
    dataset.families[3].id,
    dateAfterDays(-2),
    dateAfterDays(5),
    "Indisponible",
  );

  const quarantine = service
    .createRefugeZone("Quarantaine", "Entrées récentes et surveillance")
    .refugeZones.at(-1)!;
  const nursery = service
    .createRefugeZone("Nurserie", "Chatons séparés des adultes")
    .refugeZones.at(-1)!;
  for (let index = 13; index < 18; index += 1) {
    service.sendToRefuge(
      dataset.animals[index].id,
      index < 17 ? quarantine.id : nursery.id,
      dateAfterDays(-10 + (index % 4)),
      "Accueil au refuge",
    );
  }

  for (let index = 20; index < 36; index += 1) {
    service.createAdoption({
      animalIds: [dataset.animals[index].id],
      adopterId: dataset.adopters[index % dataset.adopters.length].id,
      adoptionDate: dateAfterDays(-7 + (index % 4)),
      partner: index % 2 === 0 ? "Partenaire Démo A" : "Partenaire Démo B",
    });
  }
  for (let index = 20; index < 23; index += 1) {
    const adoption = dataset.adoptions.find(
      (candidate) => candidate.animalId === dataset.animals[index].id,
    )!;
    service.returnAdoption(
      adoption.id,
      dateAfterDays(-2 + (index - 20)),
      "L'adoption n'a pas convenu",
    );
    service.sendToRefuge(
      dataset.animals[index].id,
      dataset.refugeZones[0].id,
      dateAfterDays(-2 + (index - 20)),
      "Retour d'adoption",
    );
  }

  const adoptionDay = service
    .createAdoptionDay({
      name: `Partenaire Démo A · ${displayDate(7)}–${displayDate(8)}`,
      startDate: dateAfterDays(7),
      endDate: dateAfterDays(8),
      partner: "Partenaire Démo A",
      location: "Galerie principale",
      notes: "Événement de démonstration sur deux jours",
    })
    .adoptionDays.at(-1)!;
  service.addAnimalsToAdoptionDay(adoptionDay.id, [dataset.animals[0].id, dataset.animals[2].id]);
  service.createAdoptionDay({
    name: `Association · ${displayDate(-7)}–${displayDate(-6)}`,
    startDate: dateAfterDays(-7),
    endDate: dateAfterDays(-6),
    location: "Le refuge",
  });
  dataset.adoptionDays.at(-1)!.status = "CLOSED";
  service.createPartnerPlace("Partenaire Démo A", "Adresse fictive A");
  service.createPartnerPlace("Partenaire Démo B", "Adresse fictive B");

  // The alert demonstrates co-location tracing inside one foster family.
  service.declareSickness(
    dataset.animals[4].id,
    "Coryza suspecté",
    dateAfterDays(-2),
    21,
    "Surveillance des contacts",
  );

  const timestamp = now.toISOString();
  dataset.animalEvents.push(
    {
      id: crypto.randomUUID(),
      animalId: dataset.animals[36].id,
      type: "LOST",
      date: dateAfterDays(-3),
      notes: "Avis de recherche de démonstration",
      createdAt: timestamp,
    },
    {
      id: crypto.randomUUID(),
      animalId: dataset.animals[37].id,
      type: "DECEASED",
      date: dateAfterDays(-2),
      notes: "Donnée de démonstration",
      createdAt: timestamp,
    },
  );

  dataset.animals
    .filter(
      (cat) =>
        cat.sterilizationStatus === "TODO" && getAnimalStatus(dataset, cat.id) !== "DECEASED",
    )
    .forEach((cat, index) =>
      dataset.tasks.push({
        id: crypto.randomUUID(),
        animalId: cat.id,
        type: "Stérilisation",
        status: "OPEN",
        dueDate: dateAfterDays(-7 + index),
        completedAt: "",
        notes: "Tâche de démonstration",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

  const careTasks: Array<{
    catIndex: number;
    type: "VERMIFUGE" | "VACCIN";
    days: number;
    notes: string;
  }> = [
    { catIndex: 0, type: "VERMIFUGE", days: 1, notes: "Milbemax · dose selon le poids" },
    { catIndex: 2, type: "VACCIN", days: 3, notes: "Rappel typhus-coryza" },
    {
      catIndex: 4,
      type: "VERMIFUGE",
      days: 5,
      notes: "À donner après la fin de l'antibiotique",
    },
    { catIndex: 6, type: "VACCIN", days: 8, notes: "Primo-vaccination" },
    { catIndex: 8, type: "VERMIFUGE", days: 12, notes: "Drontal · vérifier le poids" },
    { catIndex: 10, type: "VACCIN", days: 16, notes: "Rappel annuel" },
  ];
  careTasks.forEach(({ catIndex, type, days, notes }) => {
    const animal = dataset.animals[catIndex];
    if (!animal || !getSpeciesDefinition(animal.speciesId).careCategories.includes(type)) {
      return;
    }
    service.createTask({ animalId: animal.id, type, dueDate: dateAfterDays(days), notes });
  });

  dataset.adoptions
    .filter((adoption) => adoption.status === "ACTIVE")
    .slice(0, 8)
    .forEach((adoption, index) =>
      dataset.followUps.push({
        id: crypto.randomUUID(),
        animalId: adoption.animalId,
        adoptionId: adoption.id,
        requestedAt: dateAfterDays(-3),
        response: index % 2 ? "Photos reçues" : "",
        lastNewsAt: index % 2 ? dateAfterDays(-1) : "",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

  dataset.updatedAt = timestamp;
  return dataset;
}
