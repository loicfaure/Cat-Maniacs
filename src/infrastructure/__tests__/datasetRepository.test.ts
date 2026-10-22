import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnimalService } from "../../application/animalService";
import { CURRENT_SCHEMA_VERSION } from "../../domain/dataset";
import { DatasetRepository } from "../datasetRepository";

describe("CSV dataset repository", () => {
  it("creates, saves and reloads a normalized dataset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-dispenser-test-"));
    const opened = await DatasetRepository.open(directory);
    const service = new AnimalService(opened.dataset);
    service.createAnimal({
      name: "Milo",
      birthDate: "2025-06-12",
      intakeDate: "2026-01-02",
      notes: "Très sociable",
    });
    service.createFamily({
      firstName: "Ana",
      lastName: "Martin",
      maxCapacity: 4,
      acceptanceRules: { cat: { profiles: ["ADULT", "KITTEN"] } },
      email: "ana@example.com",
    });
    service.createAdopter({ firstName: "Tom", lastName: "Durand", email: "tom@example.com" });
    await opened.repository.save(opened.dataset);

    const reloaded = await DatasetRepository.open(directory);
    expect(reloaded.dataset.animals[0].name).toBe("Milo");
    expect(reloaded.dataset.families[0].acceptanceRules?.cat?.profiles).toEqual([
      "ADULT",
      "KITTEN",
    ]);
    expect(reloaded.dataset.adopters[0].lastName).toBe("Durand");
    expect(await readFile(join(directory, "animals.csv"), "utf8")).toContain("Très sociable");
    const manifest = JSON.parse(await readFile(join(directory, "dataset.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(reloaded.dataset.schemaVersion).toBe(manifest.schemaVersion);
  });
});
