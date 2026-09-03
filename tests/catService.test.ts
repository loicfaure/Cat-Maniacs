import { describe, expect, it } from "vitest";
import { CatService } from "../src/application/catService";
import { createEmptyDataset, deriveCatView } from "../src/domain/dataset";

const foster = { firstName: "Léa", lastName: "Accueil", maxCapacity: 2, acceptedProfiles: ["ADULT" as const] };

describe("cat lifecycle", () => {
  it("keeps foster families and definitive adopters separate", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createCat({ name: "Nala", intakeDate: "2026-01-01" });
    service.createFamily(foster);
    service.createAdopter({ firstName: "Tom", lastName: "Adoptant" });
    const cat = dataset.cats[0];
    service.startPlacement({ catId: cat.id, familyId: dataset.families[0].id, startDate: "2026-01-02" });
    service.createAdoption({ catIds: [cat.id], adopterId: dataset.adopters[0].id, adoptionDate: "2026-02-01" });
    expect(dataset.fosterPlacements[0].endDate).toBe("2026-02-01");
    expect(deriveCatView(dataset, cat).status).toBe("ADOPTED");
    service.returnAdoption(dataset.adoptions[0].id, "2026-03-01", "Allergie");
    service.sendToRefuge(cat.id, dataset.refugeZones[0].id, "2026-03-01", "Retour");
    expect(deriveCatView(dataset, cat).status).toBe("AT_REFUGE");
    expect(dataset.families).toHaveLength(1);
    expect(dataset.adopters).toHaveLength(1);
  });

  it("warns on capacity, profile and holidays but allows a documented override", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createCat({ name: "A", profile: "ADULT" }); service.createCat({ name: "B", profile: "KITTEN" });
    service.createFamily({ ...foster, maxCapacity: 1 });
    service.startPlacement({ catId: dataset.cats[0].id, familyId: dataset.families[0].id, startDate: "2026-04-01" });
    service.addFamilyHoliday(dataset.families[0].id, "2026-04-01", "2026-04-30");
    const input = { catId: dataset.cats[1].id, familyId: dataset.families[0].id, startDate: "2026-04-10" };
    expect(service.assessPlacement(input).warnings).toHaveLength(3);
    expect(() => service.startPlacement(input)).toThrow("Avertissement");
    service.startPlacement({ ...input, overrideWarnings: true, overrideReason: "Solution d'urgence validée" });
    expect(dataset.fosterPlacements[1].overrideReason).toContain("urgence");
  });

  it("groups adoption-day suggestions by household and excludes non-adoptable cats", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createFamily({ ...foster, maxCapacity: 5 });
    service.createCat({ name: "A" }); service.createCat({ name: "B" });
    service.createCat({ name: "C", adoptionEligibility: "INELIGIBLE", adoptionBlockedReason: "Soins" });
    for (const cat of dataset.cats) service.startPlacement({ catId: cat.id, familyId: dataset.families[0].id, startDate: "2026-01-01" });
    service.createAdoptionDay({ name: "Fête", startDate: "2026-06-01", endDate: "2026-06-02" });
    const groups = service.getAdoptionDaySuggestions(dataset.adoptionDays[0].id);
    expect(groups[0].cats.map((item) => item.catId)).toEqual([dataset.cats[0].id, dataset.cats[1].id]);
    service.addCatsToAdoptionDay(dataset.adoptionDays[0].id, groups[0].cats.map((item) => item.catId));
    expect(dataset.adoptionDayCats).toHaveLength(2);
  });

  it("traces exposure in the same refuge zone only", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createRefugeZone("Isolement");
    service.createCat({ name: "Malade" }); service.createCat({ name: "Contact" }); service.createCat({ name: "Séparé" });
    service.sendToRefuge(dataset.cats[0].id, dataset.refugeZones[0].id, "2026-07-01");
    service.sendToRefuge(dataset.cats[1].id, dataset.refugeZones[0].id, "2026-07-05");
    service.sendToRefuge(dataset.cats[2].id, dataset.refugeZones[1].id, "2026-07-05");
    const result = service.declareSickness(dataset.cats[0].id, "Coryza", "2026-07-10", 10);
    expect(result.exposures.map((item) => item.catId)).toEqual([dataset.cats[1].id]);
  });

  it("prevents duplicate canonical identification numbers", () => {
    const service = new CatService(createEmptyDataset());
    service.createCat({ name: "A", identificationNumber: "250260123456789" });
    expect(() => service.createCat({ name: "B", identificationNumber: "250260123456789" })).toThrow("déjà utilisé");
  });

  it("creates a definitive adopter and adoption atomically", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset); service.createCat({ name: "Sia" });
    service.createAdoptionWithNewFamily({ adoption: { catIds: [dataset.cats[0].id], adoptionDate: "2026-06-20" }, family: { firstName: "Eva", lastName: "Martin", email: "eva@example.com" } });
    expect(dataset.families).toHaveLength(0); expect(dataset.adopters[0].firstName).toBe("Eva");
    expect(dataset.adoptions[0].adopterId).toBe(dataset.adopters[0].id);
  });

  it("books then confirms an adoption from an adoption day", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createCat({ name: "Moka", intakeDate: "2026-01-01" });
    service.createAdopter({ firstName: "Ana", lastName: "Martin" });
    service.createAdoptionDay({ name: "Partenaire · 10/09/2026", startDate: "2026-09-10", endDate: "2026-09-10", partner: "Partenaire" });
    service.addCatsToAdoptionDay(dataset.adoptionDays[0].id, [dataset.cats[0].id]);
    service.bookCatForAdoption(dataset.adoptionDayCats[0].id, dataset.adopters[0].id, "2026-09-01");
    expect(dataset.adoptionDayCats[0].adopterId).toBe(dataset.adopters[0].id);
    service.confirmAdoptionBooking(dataset.adoptionDayCats[0].id, "2026-09-10");
    expect(dataset.adoptionDayCats[0].status).toBe("ADOPTED");
    expect(dataset.adoptions[0].partner).toBe("Partenaire");
  });

  it("ends health alerts and manages partner places and empty refuge zones", () => {
    const dataset = createEmptyDataset(); const service = new CatService(dataset);
    service.createCat({ name: "Nova", intakeDate: "2026-01-01" });
    service.declareSickness(dataset.cats[0].id, "Coryza", "2026-02-01", 14);
    service.resolveHealthAlert(dataset.healthAlerts[0].id, "2026-02-10", "Guérie");
    expect(dataset.healthAlerts[0].status).toBe("RESOLVED");
    expect(dataset.cats[0].healthStatus).toBe("RECOVERED");
    service.createPartnerPlace("Animalerie", "1 rue des Chats");
    expect(dataset.partnerPlaces[0].name).toBe("Animalerie");
    service.createRefugeZone("Nurserie");
    service.updateRefugeZone(dataset.refugeZones[1].id, "Nurserie calme", "Chatons");
    expect(dataset.refugeZones[1].name).toBe("Nurserie calme");
    service.deleteRefugeZone(dataset.refugeZones[1].id);
    expect(dataset.refugeZones).toHaveLength(1);
  });
});
