import type { Dataset } from "../../core/types";

/** Persistence boundary for opening, loading, and saving a dataset. */
export interface DatasetRepositoryPort {
  load(): Promise<Dataset>;
  save(dataset: Dataset, createBackup?: boolean): Promise<void>;
}
