import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../../domain/dataset";
import { AnimalService } from "../animalService";

describe("enabled species settings", () => {
  it("allows enabling another registered species and normalizes duplicates", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);

    service.setEnabledSpecies(["cat", "dog", "dog"]);

    expect(dataset.settings.enabledSpecies).toEqual(["cat", "dog"]);
  });

  it("refuses to disable a species used by a deceased animal and retains its history", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);
    service.setEnabledSpecies(["cat", "dog"]);
    service.createAnimal({ name: "Fido", speciesId: "dog" });
    const dog = dataset.animals[0];
    dataset.animalEvents.push({
      id: "event-deceased",
      animalId: dog.id,
      type: "DECEASED",
      date: "2026-03-04",
      notes: "Historique à conserver",
      createdAt: "2026-03-04T12:00:00.000Z",
    });

    expect(() => service.setEnabledSpecies(["cat"])).toThrow(/1 animal/);
    expect(dataset.settings.enabledSpecies).toEqual(["cat", "dog"]);
    expect(dataset.animals).toContainEqual(dog);
    expect(dataset.animalEvents.find((event) => event.id === "event-deceased")?.notes).toBe(
      "Historique à conserver",
    );
  });

  it("requires at least one enabled species", () => {
    const dataset = createEmptyDataset();
    const service = new AnimalService(dataset);

    expect(() => service.setEnabledSpecies([])).toThrow(/Au moins une espèce/);
    expect(dataset.settings.enabledSpecies).toEqual(["cat"]);
  });
});
