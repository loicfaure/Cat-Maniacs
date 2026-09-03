import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CatService } from "../src/application/catService";
import { DatasetRepository } from "../src/infrastructure/datasetRepository";

describe("CSV dataset repository", () => {
  it("creates, saves and reloads a normalized dataset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-dispenser-test-"));
    const opened = await DatasetRepository.open(directory);
    const service = new CatService(opened.dataset);
    service.createCat({ name: "Milo", birthDate: "2025-06-12", intakeDate: "2026-01-02", notes: "Très sociable" });
    service.createFamily({ firstName: "Ana", lastName: "Martin", maxCapacity: 4, acceptedProfiles: ["ADULT", "KITTEN"], email: "ana@example.com" });
    service.createAdopter({ firstName: "Tom", lastName: "Durand", email: "tom@example.com" });
    await opened.repository.save(opened.dataset);

    const reloaded = await DatasetRepository.open(directory);
    expect(reloaded.dataset.cats[0].name).toBe("Milo");
    expect(reloaded.dataset.families[0].acceptedProfiles).toEqual(["ADULT", "KITTEN"]);
    expect(reloaded.dataset.adopters[0].lastName).toBe("Durand");
    expect(await readFile(join(directory, "cats.csv"), "utf8")).toContain("Très sociable");
    expect(await readFile(join(directory, "dataset.json"), "utf8")).toContain('"schemaVersion": 3');
  });
});
