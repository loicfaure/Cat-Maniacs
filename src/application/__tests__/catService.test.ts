import { describe, expect, it } from "vitest";
import type { FamilyInput } from "../../core/types";
import { createEmptyDataset, deriveAnimalView } from "../../domain/dataset";
import { AnimalService } from "../animalService";

const foster: FamilyInput = {
  firstName: "Léa",
  lastName: "Accueil",
  maxCapacity: 2,
  acceptanceRules: { cat: { profiles: ["ADULT"] } },
};

describe("cat lifecycle", () => {
  it("validates and updates cat identity and profile fields", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    expect(() => service.createAnimal({ name: "  " })).toThrow("nom de l'animal est obligatoire");
    expect(() => service.createAnimal({ name: "A", birthDate: "invalid" })).toThrow();
    service.createAnimal({ name: " Nala ", identificationNumber: "ab 123456" });
    const cat = dataset.animals[0];
    expect(cat.name).toBe("Nala");
    expect(cat.identificationNumber).toBe("ab123456");
    expect(() => service.createAnimal({ name: "Milo", identificationNumber: "ab 123456" })).toThrow(
      "déjà utilisé",
    );
    expect(() => service.updateAnimal({ id: cat.id, name: "  " })).toThrow(
      "nom de l'animal est obligatoire",
    );
    service.updateAnimal({
      id: cat.id,
      name: "Nala II",
      profile: "SPECIAL_NEEDS",
      notes: " suivi ",
    });
    expect(cat.name).toBe("Nala II");
    expect(cat.profile).toBe("SPECIAL_NEEDS");
    expect(cat.notes).toBe("suivi");
  });

  it("records care and history, schedules follow-up, and closes active work at death", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "Milo" });
    const animalId = dataset.animals[0].id;
    service.createTask({ animalId, type: "VACCIN", dueDate: "2026-02-01" });
    const taskId = dataset.tasks[0].id;
    service.completeTask(taskId, "2026-02-01", "2026-08-01");
    expect(dataset.tasks.map((task) => task.status)).toEqual(["DONE", "OPEN"]);
    service.recordCare({
      animalId,
      type: "VERMIFUGE",
      completedAt: "2026-02-02",
      nextDueDate: "2026-05-02",
    });
    service.recordAnimalHistory({
      animalId,
      date: "2026-02-03",
      title: "Consultation",
      nextDate: "2026-03-03",
    });
    const note = dataset.animalEvents.find((event) => event.type === "NOTE_ADDED");
    expect(note?.label).toBe("Consultation");
    service.deleteAnimalEvent(note?.id ?? "");
    service.createSponsorship({
      animalId,
      firstName: " Camille ",
      lastName: " Martin ",
      monthlyAmount: 15,
      startDate: "2026-01-01",
    });
    service.declareAnimalDeceased(animalId, "2026-04-01", "Fin de vie");
    expect(dataset.sponsorships[0].endDate).toBe("2026-04-01");
    expect(dataset.tasks.filter((task) => task.status === "OPEN")).toHaveLength(0);
    expect(() =>
      service.createSponsorship({
        animalId,
        firstName: "Camille",
        lastName: "Martin",
        monthlyAmount: 15,
        startDate: "2026-01-01",
      }),
    ).toThrow("décédé");
    expect(() => service.declareAnimalDeceased(animalId, "2026-04-01")).toThrow("déjà déclaré");
  });

  it("keeps foster families and definitive adopters separate", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "Nala", intakeDate: "2026-01-01" });
    service.createFamily(foster);
    service.createAdopter({ firstName: "Tom", lastName: "Adoptant" });
    const cat = dataset.animals[0];
    service.startPlacement({
      animalId: cat.id,
      familyId: dataset.families[0].id,
      startDate: "2026-01-02",
    });
    service.createAdoption({
      animalIds: [cat.id],
      adopterId: dataset.adopters[0].id,
      adoptionDate: "2026-02-01",
    });
    expect(dataset.fosterPlacements[0].endDate).toBe("2026-02-01");
    expect(deriveAnimalView(dataset, cat).status).toBe("ADOPTED");
    service.returnAdoption(dataset.adoptions[0].id, "2026-03-01", "Allergie");
    service.sendToRefuge(cat.id, dataset.refugeZones[0].id, "2026-03-01", "Retour");
    expect(deriveAnimalView(dataset, cat).status).toBe("AT_REFUGE");
    expect(dataset.families).toHaveLength(1);
    expect(dataset.adopters).toHaveLength(1);
  });

  it("warns on capacity, profile and holidays but allows a documented override", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "A", profile: "ADULT" });
    service.createAnimal({ name: "B", profile: "KITTEN" });
    service.createFamily({ ...foster, maxCapacity: 1 });
    service.startPlacement({
      animalId: dataset.animals[0].id,
      familyId: dataset.families[0].id,
      startDate: "2026-04-01",
    });
    service.addFamilyHoliday(dataset.families[0].id, "2026-04-01", "2026-04-30");
    const input = {
      animalId: dataset.animals[1].id,
      familyId: dataset.families[0].id,
      startDate: "2026-04-10",
    };
    expect(service.assessPlacement(input).warnings).toHaveLength(3);
    expect(() => service.startPlacement(input)).toThrow("Avertissement");
    service.startPlacement({
      ...input,
      overrideWarnings: true,
      overrideReason: "Solution d'urgence validée",
    });
    expect(dataset.fosterPlacements[1].overrideReason).toContain("urgence");
  });

  it("groups adoption-day suggestions by household and excludes non-adoptable animals", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createFamily({ ...foster, maxCapacity: 5 });
    service.createAnimal({ name: "A" });
    service.createAnimal({ name: "B" });
    service.createAnimal({
      name: "C",
      adoptionEligibility: "INELIGIBLE",
      adoptionBlockedReason: "Soins",
    });
    for (const cat of dataset.animals) {
      service.startPlacement({
        animalId: cat.id,
        familyId: dataset.families[0].id,
        startDate: "2026-01-01",
      });
    }
    service.createAdoptionDay({ name: "Fête", startDate: "2026-06-01", endDate: "2026-06-02" });
    const groups = service.getAdoptionDaySuggestions(dataset.adoptionDays[0].id);
    expect(groups[0].animals.map((item) => item.animalId)).toEqual([
      dataset.animals[0].id,
      dataset.animals[1].id,
    ]);
    service.addAnimalsToAdoptionDay(
      dataset.adoptionDays[0].id,
      groups[0].animals.map((item) => item.animalId),
    );
    expect(dataset.adoptionDayAnimals).toHaveLength(2);
  });

  it("traces exposure in the same refuge zone only", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createRefugeZone("Isolement");
    service.createAnimal({ name: "Malade" });
    service.createAnimal({ name: "Contact" });
    service.createAnimal({ name: "Séparé" });
    service.sendToRefuge(dataset.animals[0].id, dataset.refugeZones[0].id, "2026-07-01");
    service.sendToRefuge(dataset.animals[1].id, dataset.refugeZones[0].id, "2026-07-05");
    service.sendToRefuge(dataset.animals[2].id, dataset.refugeZones[1].id, "2026-07-05");
    const result = service.declareSickness(dataset.animals[0].id, "Coryza", "2026-07-10", 10);
    expect(result.exposures.map((item) => item.animalId)).toEqual([dataset.animals[1].id]);
  });

  it("prevents duplicate canonical identification numbers", () => {
    const service = new AnimalService(createEmptyDataset());
    service.createAnimal({ name: "A", identificationNumber: "250260123456789" });
    expect(() =>
      service.createAnimal({ name: "B", identificationNumber: "250260123456789" }),
    ).toThrow("déjà utilisé");
  });

  it("creates a definitive adopter and adoption atomically", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "Sia" });
    service.createAdoptionWithNewFamily({
      adoption: { animalIds: [dataset.animals[0].id], adoptionDate: "2026-06-20" },
      family: { firstName: "Eva", lastName: "Martin", email: "eva@example.com" },
    });
    expect(dataset.families).toHaveLength(0);
    expect(dataset.adopters[0].firstName).toBe("Eva");
    expect(dataset.adoptions[0].adopterId).toBe(dataset.adopters[0].id);
  });

  it("books then confirms an adoption from an adoption day", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "Moka", intakeDate: "2026-01-01" });
    service.createAdopter({ firstName: "Ana", lastName: "Martin" });
    service.createAdoptionDay({
      name: "Partenaire · 10/09/2026",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      partner: "Partenaire",
    });
    service.addAnimalsToAdoptionDay(dataset.adoptionDays[0].id, [dataset.animals[0].id]);
    service.bookAnimalForAdoption(
      dataset.adoptionDayAnimals[0].id,
      dataset.adopters[0].id,
      "2026-09-01",
    );
    expect(dataset.adoptionDayAnimals[0].adopterId).toBe(dataset.adopters[0].id);
    service.confirmAdoptionBooking(dataset.adoptionDayAnimals[0].id, "2026-09-10");
    expect(dataset.adoptionDayAnimals[0].status).toBe("ADOPTED");
    expect(dataset.adoptions[0].partner).toBe("Partenaire");
  });

  it("ends health alerts and manages partner places and empty refuge zones", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({ name: "Nova", intakeDate: "2026-01-01" });
    service.declareSickness(dataset.animals[0].id, "Coryza", "2026-02-01", 14);
    service.resolveHealthAlert(dataset.healthAlerts[0].id, "2026-02-10", "Guérie");
    expect(dataset.healthAlerts[0].status).toBe("RESOLVED");
    expect(dataset.animals[0].healthStatus).toBe("RECOVERED");
    service.createPartnerPlace("Animalerie", "1 rue des Chats");
    expect(dataset.partnerPlaces[0].name).toBe("Animalerie");
    service.createRefugeZone("Nurserie");
    service.updateRefugeZone(dataset.refugeZones[1].id, "Nurserie calme", "Chatons");
    expect(dataset.refugeZones[1].name).toBe("Nurserie calme");
    service.deleteRefugeZone(dataset.refugeZones[1].id);
    expect(dataset.refugeZones).toHaveLength(1);
  });
});
