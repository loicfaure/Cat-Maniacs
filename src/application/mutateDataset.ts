import type { Dataset } from "../core/types";
import { AnimalService } from "./animalService";
import type { DatasetRepositoryPort } from "./ports/datasetRepository";

/** Apply a domain action to an isolated copy and publish it only after persistence succeeds. */
export async function mutateDataset<T>(
  repository: DatasetRepositoryPort,
  current: Dataset,
  action: (service: AnimalService, draft: Dataset) => T,
): Promise<{ dataset: Dataset; result: T }> {
  const draft = structuredClone(current);
  const result = action(new AnimalService(draft), draft);
  await repository.save(draft);
  return { dataset: draft, result };
}
