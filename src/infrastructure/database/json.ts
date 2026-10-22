import type { Dataset } from "../../core/types";
import { isSpeciesId } from "../../domain/species/registry";
import type { DatasetManifest, TransactionFile, TransactionJournal } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDatasetManifest(source: string): DatasetManifest {
  const parsed: unknown = JSON.parse(source);
  const manifestKeys = [
    "modelVersion",
    "schemaVersion",
    "datasetId",
    "name",
    "createdAt",
    "updatedAt",
    "settings",
  ];
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).some((key) => !manifestKeys.includes(key)) ||
    parsed.modelVersion !== 1 ||
    parsed.schemaVersion !== 8 ||
    typeof parsed.datasetId !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string" ||
    !isRecord(parsed.settings) ||
    !Array.isArray(parsed.settings.enabledSpecies) ||
    parsed.settings.enabledSpecies.length === 0 ||
    !parsed.settings.enabledSpecies.every(isSpeciesId) ||
    new Set(parsed.settings.enabledSpecies).size !== parsed.settings.enabledSpecies.length
  ) {
    throw new Error("Le manifeste du jeu de données est invalide.");
  }
  return {
    modelVersion: 1,
    schemaVersion: parsed.schemaVersion,
    datasetId: parsed.datasetId,
    name: parsed.name,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    settings: {
      enabledSpecies: parsed.settings.enabledSpecies,
      ...(parsed.settings.appearanceCatalog === undefined
        ? {}
        : { appearanceCatalog: parseAppearanceCatalog(parsed.settings.appearanceCatalog) }),
    },
  };
}

function parseAppearanceCatalog(
  value: unknown,
): NonNullable<Dataset["settings"]["appearanceCatalog"]> {
  if (!isRecord(value)) {
    throw new Error("Le catalogue des races et couleurs est invalide.");
  }
  const catalog: NonNullable<Dataset["settings"]["appearanceCatalog"]> = {};
  for (const [speciesId, entry] of Object.entries(value)) {
    if (
      !isSpeciesId(speciesId) ||
      !isRecord(entry) ||
      Object.keys(entry).some((key) => !["breeds", "colors"].includes(key)) ||
      !Array.isArray(entry.breeds) ||
      !entry.breeds.every((item) => typeof item === "string") ||
      !Array.isArray(entry.colors) ||
      !entry.colors.every((item) => typeof item === "string")
    ) {
      throw new Error("Le catalogue des races et couleurs est invalide.");
    }
    catalog[speciesId] = { breeds: entry.breeds, colors: entry.colors };
  }
  return catalog;
}

export function parseTransactionJournal(source: string): TransactionJournal {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || typeof parsed.id !== "string" || !Array.isArray(parsed.files)) {
    throw new Error("Le journal de transaction est invalide.");
  }
  const files: TransactionFile[] = parsed.files.map((entry): TransactionFile => {
    if (
      !isRecord(entry) ||
      typeof entry.temporary !== "string" ||
      typeof entry.target !== "string"
    ) {
      throw new Error("Le journal de transaction contient une entrée invalide.");
    }
    return { temporary: entry.temporary, target: entry.target };
  });
  return { id: parsed.id, files };
}
