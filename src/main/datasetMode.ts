import type { SpeciesId } from "../core/types";
import { createDemoDataset } from "../demo/demoDataset";
import { DatasetRepository } from "../infrastructure/datasetRepository";

/** Demo sessions start fresh; edits use the same repository as ordinary datasets. */
export async function openModeDataset(
  directory: string,
  demoMode: boolean,
  demoSpecies: SpeciesId[] = ["cat"],
) {
  if (demoMode) {
    return DatasetRepository.openDemo(directory, createDemoDataset(demoSpecies));
  }
  return DatasetRepository.open(directory);
}
