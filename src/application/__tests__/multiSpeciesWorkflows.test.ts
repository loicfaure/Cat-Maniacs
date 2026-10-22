import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SpeciesId } from "../../core/types";
import { createEmptyDataset, deriveAnimalView } from "../../domain/dataset";
import { DatasetRepository } from "../../infrastructure/datasetRepository";
import { AnimalService } from "../animalService";

describe("mixed-species workflows", () => {
  it.each([
    ["dog", { breed: "Croisé", size: "MEDIUM" }, "ADULT"],
    ["rabbit", { breed: "Bélier" }, "ADULT"],
    ["snake", { taxon: "Python royal", lengthCm: 90 }, "JUVENILE"],
  ] as const)(
    "creates, saves, reloads and updates a %s",
    async (speciesId, speciesData, profile) => {
      const directory = await mkdtemp(join(tmpdir(), "animal-species-"));
      const { repository, dataset } = await DatasetRepository.open(directory);
      const service = new AnimalService(dataset);
      service.setEnabledSpecies(["cat", speciesId]);
      service.createAnimal({
        speciesId,
        speciesData,
        name: `Test ${speciesId}`,
        profile,
        intakeDate: "2026-01-01",
      });
      await repository.save(dataset, false);

      const reloaded = await DatasetRepository.open(directory);
      const animal = reloaded.dataset.animals[0]!;
      expect(animal.speciesId).toBe(speciesId);
      expect(animal.speciesData).toEqual(speciesData);
      expect(animal.identificationScheme).toBe("NONE");
      expect(
        reloaded.dataset.refugeZones[0]?.allowedSpecies === null ||
          reloaded.dataset.refugeZones[0]?.allowedSpecies.includes(speciesId),
      ).toBe(true);
      new AnimalService(reloaded.dataset).updateAnimal({
        id: animal.id,
        notes: "Détails conservés",
      });
      expect(animal.notes).toBe("Détails conservés");
      expect(deriveAnimalView(reloaded.dataset, animal).speciesId).toBe(speciesId);
    },
  );

  it("rejects disabled, unknown and unsupported profile or identification choices", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    expect(() => service.createAnimal({ name: "Fido", speciesId: "dog" })).toThrow(
      /espèce activée/,
    );
    expect(() => service.createAnimal({ name: "X", speciesId: "lizard" as SpeciesId })).toThrow(
      /inconnue/,
    );
    service.setEnabledSpecies(["cat", "dog", "rabbit"]);
    expect(() =>
      service.createAnimal({ name: "Fido", speciesId: "dog", profile: "KITTEN" }),
    ).toThrow(/profil/);
    expect(() =>
      service.createAnimal({
        name: "Moka",
        speciesId: "rabbit",
        identificationNumber: "R-1",
        identificationScheme: "ICAD",
      }),
    ).toThrow(/schéma d'identification/);
  });

  it("enforces species acceptance, shared capacity, species capacity and refuge zones", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.setEnabledSpecies(["cat", "dog"]);
    service.createAnimal({ name: "Milo", speciesId: "cat", intakeDate: "2026-01-01" });
    service.createAnimal({ name: "Rex", speciesId: "dog", intakeDate: "2026-01-01" });
    service.createAnimal({ name: "Buddy", speciesId: "dog", intakeDate: "2026-01-01" });
    const [cat, dog, secondDog] = dataset.animals;
    service.createFamily({
      firstName: "Léa",
      lastName: "Accueil",
      maxCapacity: 2,
      acceptanceRules: {
        cat: { profiles: ["ADULT"] },
        dog: { profiles: ["ADULT"], maxCapacity: 1 },
      },
    });
    const family = dataset.families[0]!;
    expect(
      service.assessPlacement({ animalId: cat!.id, familyId: family.id, startDate: "2026-02-01" })
        .allowed,
    ).toBe(true);
    service.startPlacement({ animalId: cat!.id, familyId: family.id, startDate: "2026-02-01" });
    expect(
      service.assessPlacement({ animalId: dog!.id, familyId: family.id, startDate: "2026-02-01" })
        .allowed,
    ).toBe(true);
    service.startPlacement({ animalId: dog!.id, familyId: family.id, startDate: "2026-02-01" });
    const fullAssessment = service.assessPlacement({
      animalId: secondDog!.id,
      familyId: family.id,
      startDate: "2026-02-02",
    });
    expect(fullAssessment.allowed).toBe(true);
    expect(fullAssessment.warnings.join(" ")).toMatch(/Capacité atteinte/);
    expect(fullAssessment.warnings.join(" ")).toMatch(/Capacité de cette espèce atteinte/);
    expect(() =>
      service.startPlacement({
        animalId: secondDog!.id,
        familyId: family.id,
        startDate: "2026-02-02",
      }),
    ).toThrow(/Confirmez le dépassement/);

    const dogZone = service.createRefugeZone("Chiens", "", ["dog"]).refugeZones.at(-1)!;
    expect(() => service.sendToRefuge(cat!.id, dogZone.id, "2026-02-03")).toThrow(
      /n'accepte pas les chats/,
    );
    expect(() => service.sendToRefuge(dog!.id, dogZone.id, "2026-02-03")).not.toThrow();
  });

  it("adopts and returns animals using animal ids regardless of species", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.setEnabledSpecies(["dog", "rabbit"]);
    service.createAnimal({ name: "Rex", speciesId: "dog", intakeDate: "2026-01-01" });
    service.createAnimal({ name: "Moka", speciesId: "rabbit", intakeDate: "2026-01-01" });
    service.createAdopter({ firstName: "Sam", lastName: "Martin" });
    const animalIds = dataset.animals.map((animal) => animal.id);
    service.createAdoption({
      animalIds,
      adopterId: dataset.adopters[0]!.id,
      adoptionDate: "2026-02-01",
    });
    expect(dataset.adoptions.map((adoption) => adoption.animalId)).toEqual(animalIds);
    service.returnAdoption(dataset.adoptions[0]!.id, "2026-03-01", "Retour test");
    expect(deriveAnimalView(dataset, dataset.animals[0]!).status).toBe("AT_REFUGE");
    expect(deriveAnimalView(dataset, dataset.animals[0]!).currentLocationLabel).toContain(
      "Zone principale",
    );
    expect(dataset.animals[1]!.speciesId).toBe("rabbit");
  });

  it("does not add cat-only sterilization warnings to snakes and preserves historical care records", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.setEnabledSpecies(["snake"]);
    service.createAnimal({
      name: "Python",
      speciesId: "snake",
      profile: "JUVENILE",
      intakeDate: "2026-01-01",
    });
    const snake = dataset.animals[0]!;
    service.createAdoptionDay({
      name: "Portes ouvertes",
      startDate: "2026-02-01",
      endDate: "2026-02-01",
    });
    const suggestions = service.getAdoptionDaySuggestions(dataset.adoptionDays[0]!.id);
    expect(
      suggestions.flatMap((group) => group.animals).find((animal) => animal.animalId === snake.id)
        ?.warnings,
    ).not.toContain("Stérilisation non confirmée");
    expect(() =>
      service.createTask({ animalId: snake.id, type: "VACCIN", dueDate: "2026-02-01" }),
    ).toThrow(/pas disponible/);
    expect(() =>
      service.recordCare({ animalId: snake.id, type: "STERILISATION", completedAt: "2026-02-01" }),
    ).toThrow(/pas disponible/);

    dataset.tasks.push({
      id: "historical-care",
      animalId: snake.id,
      type: "VACCIN",
      status: "OPEN",
      dueDate: "2026-02-01",
      completedAt: "",
      notes: "Historique conservé",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    service.completeTask("historical-care", "2026-02-01");
    expect(dataset.tasks[0]?.status).toBe("DONE");
    expect(dataset.tasks[0]?.notes).toBe("Historique conservé");
  });
});
