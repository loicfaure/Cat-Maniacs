import type { Dataset } from "../../core/types";
import type { StoredListKey } from "./records";

export interface TableDefinition {
  key: StoredListKey;
  file: string;
  headers: string[];
}

export interface TransactionFile {
  temporary: string;
  target: string;
}

export interface TransactionJournal {
  id: string;
  files: TransactionFile[];
}

export type DatasetManifest = Pick<
  Dataset,
  "modelVersion" | "schemaVersion" | "datasetId" | "name" | "createdAt" | "updatedAt" | "settings"
>;
