import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../../domain/dataset";
import { validateSpeciesData } from "../../domain/species/registry";
import { DatasetRepository } from "../../infrastructure/datasetRepository";
import { AnimalService } from "../animalService";

describe("animal characteristics", () => {
  it("round trips mixed values, unknown adoptability, needs and weight, and remembers suggestions after edits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "animal-characteristics-"));
    const opened = await DatasetRepository.open(directory);
    const service = new AnimalService(opened.dataset);
    service.createAnimal({
      name: "Moka",
      speciesId: "cat",
      birthDate: "2020-01-01",
      adoptionEligibility: "UNKNOWN",
      speciesData: {
        breed: "Race locale",
        mixedBreed: true,
        secondaryBreed: "Siamois",
        coatColor: "Ambre clair",
        mixedCoatColor: true,
        specialNeeds: "Alimentation adaptée",
        weightKg: 4.25,
      },
    });
    await opened.repository.save(opened.dataset);
    const reloaded = await DatasetRepository.open(directory);
    expect(reloaded.dataset.animals[0]).toMatchObject({
      profile: "ADULT",
      adoptionEligibility: "UNKNOWN",
      speciesData: opened.dataset.animals[0].speciesData,
    });
    expect(reloaded.dataset.settings.appearanceCatalog?.cat).toEqual({
      breeds: ["Race locale", "Siamois"],
      colors: ["Ambre clair"],
    });
    const editing = new AnimalService(reloaded.dataset);
    editing.updateAnimal({
      id: reloaded.dataset.animals[0].id,
      speciesData: { breed: "Européen", coatColor: "Blanc" },
    });
    await reloaded.repository.save(reloaded.dataset);
    const afterEdit = await DatasetRepository.open(directory);
    expect(afterEdit.dataset.settings.appearanceCatalog?.cat?.breeds).toContain("Race locale");
    expect(afterEdit.dataset.settings.appearanceCatalog?.cat?.colors).toContain("Ambre clair");
    expect(afterEdit.dataset.settings.appearanceCatalog?.dog).toBeUndefined();
  });

  it.each(["cat", "dog", "rabbit", "snake"] as const)(
    "accepts unknown mixed values and validates optional weight for %s",
    (speciesId) => {
      expect(validateSpeciesData(speciesId, { mixedBreed: true, mixedCoatColor: true })).toEqual({
        mixedBreed: true,
        mixedCoatColor: true,
      });
      for (const weightKg of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
        expect(() => validateSpeciesData(speciesId, { weightKg })).toThrow("invalides");
      }
      expect(validateSpeciesData(speciesId, { weightKg: 0.025 })).toEqual({ weightKg: 0.025 });
    },
  );

  it("requires a reason for a newly non-adoptable animal", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    expect(() => service.createAnimal({ name: "Moka", adoptionEligibility: "INELIGIBLE" })).toThrow(
      "motif",
    );
    expect(dataset.animals).toHaveLength(0);
    service.createAnimal({ name: "Moka", adoptionEligibility: "UNKNOWN" });
    expect(() =>
      service.updateAnimal({ id: dataset.animals[0].id, adoptionEligibility: "INELIGIBLE" }),
    ).toThrow("motif");
    expect(dataset.animals[0].adoptionEligibility).toBe("UNKNOWN");
  });

  it("checks special-needs acceptance without turning needs into an age profile", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.createAnimal({
      name: "Moka",
      profile: "ADULT",
      speciesData: { specialNeeds: "Besoin d'un accueil adapté" },
    });
    service.createFamily({
      firstName: "Famille",
      lastName: "Test",
      maxCapacity: 3,
      acceptanceRules: { cat: { profiles: ["ADULT"] } },
    });
    const placement = {
      animalId: dataset.animals[0].id,
      familyId: dataset.families[0].id,
      startDate: "2026-10-22",
    };
    expect(service.assessPlacement(placement).warnings.join(" ")).toContain("besoins particuliers");
    dataset.families[0].acceptanceRules = { cat: { profiles: ["SPECIAL_NEEDS"] } };
    expect(service.assessPlacement(placement).warnings).toEqual([]);
    expect(dataset.animals[0].profile).toBe("ADULT");
  });
});
