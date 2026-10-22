import { stringifyCsv } from "../../core/csv";
import type { MigratedLegacyDataset } from "../../legacy/migration/mapLegacy";

export interface TargetMigrationTable {
  key: string;
  file: string;
  headers: string[];
}
export interface MigrationWrite {
  name: string;
  content: string;
  manifest?: boolean;
}

/** Serialize the pure mapping with the application's current storage contract. */
export function serializeMigratedDataset(
  migrated: MigratedLegacyDataset,
  tables: readonly TargetMigrationTable[],
): MigrationWrite[] {
  const output: MigrationWrite[] = [];
  for (const table of tables) {
    const rows = migrated.tables.get(table.key) ?? [];
    output.push({
      name: table.file,
      content: stringifyCsv(table.headers, rows),
    });
  }
  output.push({
    name: "dataset.json",
    content: `${JSON.stringify(migrated.manifest, null, 2)}\n`,
    manifest: true,
  });
  return output;
}

export function retiredLegacyFiles(tables: readonly TargetMigrationTable[]): string[] {
  const currentFiles = new Set(tables.map((table) => table.file));
  return ["cats.csv", "cat_events.csv", "adoption_day_cats.csv"].filter(
    (file) => !currentFiles.has(file),
  );
}
