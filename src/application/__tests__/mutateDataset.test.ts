import { describe, expect, it, vi } from "vitest";
import { createEmptyDataset } from "../../domain/dataset";
import { mutateDataset } from "../mutateDataset";
import type { DatasetRepositoryPort } from "../ports/datasetRepository";

function repository(save: DatasetRepositoryPort["save"]): DatasetRepositoryPort {
  return { load: vi.fn(), save };
}

describe("mutateDataset", () => {
  it("persists an isolated draft before returning it", async () => {
    const current = createEmptyDataset();
    const save = vi.fn<DatasetRepositoryPort["save"]>().mockResolvedValue(undefined);
    const outcome = await mutateDataset(repository(save), current, (service) =>
      service.createAnimal({ name: "Milo" }),
    );

    expect(current.animals).toHaveLength(0);
    expect(outcome.dataset.animals[0].name).toBe("Milo");
    expect(outcome.result.animals[0].name).toBe("Milo");
    expect(save).toHaveBeenCalledWith(outcome.dataset);
  });

  it("leaves the current dataset untouched when persistence fails", async () => {
    const current = createEmptyDataset();
    const save = vi.fn<DatasetRepositoryPort["save"]>().mockRejectedValue(new Error("disk full"));

    await expect(
      mutateDataset(repository(save), current, (service) => service.createAnimal({ name: "Milo" })),
    ).rejects.toThrow("disk full");
    expect(current.animals).toHaveLength(0);
  });
});
