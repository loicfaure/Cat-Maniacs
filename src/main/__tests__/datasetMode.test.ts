import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalService } from "../../application/animalService";
import { profileForBirthDate } from "../../domain/catAge";
import { openModeDataset } from "../datasetMode";

describe("dataset modes", () => {
  afterEach(() => vi.useRealTimers());

  it("saves demo edits and replaces them with current data on the next activation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00"));
    const root = await mkdtemp(join(tmpdir(), "cat-dispenser-modes-"));
    const realDirectory = join(root, "real");
    const demoDirectory = join(root, "demo");
    const real = await openModeDataset(realDirectory, false);
    new AnimalService(real.dataset).createAnimal({ name: "Chat réel" });
    await real.repository.save(real.dataset);
    const savedReal = await real.repository.load();

    const demo = await openModeDataset(demoDirectory, true);
    const firstBirthDate = demo.dataset.animals[0].birthDate;
    new AnimalService(demo.dataset).updateAnimal({
      id: demo.dataset.animals[0].id,
      name: "Chat modifié",
    });
    new AnimalService(demo.dataset).createAnimal({ name: "Chat ajouté" });
    await demo.repository.save(demo.dataset);
    const savedEdits = await demo.repository.load();
    expect(savedEdits.animals).toHaveLength(65);
    expect(savedEdits.animals[0].name).toBe("Chat modifié");

    // Resetting during the same day also replaces the edited records.
    const reset = await openModeDataset(demoDirectory, true);
    expect(reset.dataset.animals).toHaveLength(64);
    expect(reset.dataset.animals[0].name).toBe("Amande");
    expect(reset.dataset.animals[0].birthDate).toBe(firstBirthDate);

    vi.setSystemTime(new Date("2030-01-01T12:00:00"));
    const refreshed = await openModeDataset(demoDirectory, true);
    expect(refreshed.dataset.animals[0].birthDate).not.toBe(firstBirthDate);
    expect(profileForBirthDate(refreshed.dataset.animals[0].birthDate)).toBe("KITTEN");
    expect(await refreshed.repository.load()).toMatchObject(refreshed.dataset);

    const reopenedReal = await openModeDataset(realDirectory, false);
    expect(reopenedReal.dataset).toEqual(savedReal);
  });
});
