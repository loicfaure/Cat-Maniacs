import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseCsv } from "../../core/csv";
import { isSpeciesId } from "../../domain/species/registry";
import {
  type LegacySchema,
  type LegacyTableSpec,
  type LegacyTables,
  tablesForSchema,
} from "../../legacy/migration/legacyFormat";

export type MigrationFormat = "current" | "legacy" | "unsupported" | "malformed" | "missing";
export interface LegacyDatasetInspection {
  directory: string;
  format: MigrationFormat;
  sourceSchema?: number;
  datasetId?: string;
  name?: string;
  backupLocation?: string;
  counts: Record<string, number>;
  problems: string[];
  hasUnfinishedTransaction: boolean;
}

export async function inspectLegacyDataset(directory: string): Promise<LegacyDatasetInspection> {
  const base: LegacyDatasetInspection = {
    directory,
    format: "missing",
    counts: {},
    problems: [],
    hasUnfinishedTransaction: await exists(join(directory, ".transaction.json")),
  };
  const manifestPath = join(directory, "dataset.json");
  if (!(await exists(manifestPath))) {
    return base;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return { ...base, format: "malformed", problems: [`Manifeste illisible : ${message(error)}`] };
  }
  if (!isRecord(parsed) || !Number.isInteger(parsed.schemaVersion)) {
    return {
      ...base,
      format: "malformed",
      problems: ["Le manifeste ne contient pas de schemaVersion entier valide."],
    };
  }
  const manifestSchemaVersion = parsed.schemaVersion as number;
  if (parsed.modelVersion !== undefined) {
    if (parsed.modelVersion === 1 && manifestSchemaVersion === 8) {
      if (
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
        return {
          ...base,
          format: "malformed",
          sourceSchema: 8,
          problems: ["Le manifeste model-v1 est invalide."],
        };
      }
      return {
        ...base,
        format: "current",
        sourceSchema: 8,
        datasetId: stringField(parsed, "datasetId"),
        name: stringField(parsed, "name"),
      };
    }
    return {
      ...base,
      format: "unsupported",
      sourceSchema: manifestSchemaVersion,
      problems: [
        "Le jeu de données utilise une version de modèle ou de schéma non prise en charge.",
      ],
    };
  }
  const sourceSchema = manifestSchemaVersion;
  if (sourceSchema !== 3 && sourceSchema !== 7) {
    return {
      ...base,
      format: "unsupported",
      sourceSchema,
      problems: [`Le schéma ${sourceSchema} n'a pas d'adaptateur de migration vers le modèle v1.`],
    };
  }
  const result: LegacyDatasetInspection = {
    ...base,
    format: "legacy",
    sourceSchema,
    datasetId: stringField(parsed, "datasetId"),
    name: stringField(parsed, "name"),
    backupLocation: join(
      dirname(resolve(directory)),
      `${basename(resolve(directory))}.legacy-backup-<migration-id>`,
    ),
  };
  if (base.hasUnfinishedTransaction) {
    result.problems.push(
      "Une transaction historique est inachevée; les comptes seront lus après sauvegarde et récupération consenties.",
    );
    return result;
  }
  try {
    const tables = await readLegacyTables(directory, sourceSchema as LegacySchema);
    for (const [key, rows] of tables) {
      result.counts[key] = rows.length;
    }
  } catch (error) {
    result.format = "malformed";
    result.problems.push(message(error));
  }
  return result;
}

export async function readLegacyTables(
  directory: string,
  schemaVersion: LegacySchema,
): Promise<LegacyTables> {
  const specs = tablesForSchema(schemaVersion);
  if (!specs) {
    throw new Error(`Schéma source non pris en charge : ${schemaVersion}.`);
  }
  const tables: LegacyTables = new Map();
  for (const spec of specs) {
    const filePath = join(directory, spec.file);
    if (!(await exists(filePath))) {
      tables.set(spec.key, []);
      continue;
    }
    tables.set(spec.key, parseTable(await readFile(filePath, "utf8"), spec));
  }
  return tables;
}

function parseTable(source: string, spec: LegacyTableSpec): Array<Record<string, string>> {
  const parsed = parseCsv(source);
  if (parsed.errors.length) {
    throw new Error(`${spec.file}: ${parsed.errors.join(" ")}`);
  }
  const [headers, ...rows] = parsed.rows;
  if (!headers) {
    throw new Error(`${spec.file}: en-tête CSV manquant.`);
  }
  if (
    headers.length !== spec.headers.length ||
    headers.some((header, index) => header !== spec.headers[index])
  ) {
    throw new Error(
      `${spec.file}: colonnes inattendues pour le schéma historique; conversion interrompue pour éviter toute perte de données.`,
    );
  }
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row, index) => {
      if (row.length > headers.length && row.slice(headers.length).some((cell) => cell.trim())) {
        throw new Error(`${spec.file}: colonnes supplémentaires à la ligne ${index + 2}.`);
      }
      return Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""]));
    });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringField(record: Record<string, unknown>, field: string): string | undefined {
  return typeof record[field] === "string" ? record[field] : undefined;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
