import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { TABLES } from "./infrastructure/database/tables";
import { DatasetRepository } from "./infrastructure/datasetRepository";
import {
  MigrationFormatError,
  MigrationValidationError,
  runLegacyMigration,
} from "./infrastructure/migrations/engine";
import type { LegacyDatasetInspection } from "./infrastructure/migrations/inspectLegacy";
import { releaseStaleMigrationLock } from "./infrastructure/migrations/transaction";

interface CliOptions {
  directory: string;
  dryRun: boolean;
  yes: boolean;
  recoverLock: boolean;
}

export async function runMigrationCli(args: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(args);
  } catch (error) {
    stdout.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stdout.write(
      'Usage: npm run migrate:model -- --dataset "path/to/register" [--dry-run] [--yes] [--recover-lock]\n',
    );
    return 2;
  }
  if (!options.directory) {
    stdout.write(
      'Usage: npm run migrate:model -- --dataset "path/to/register" [--dry-run] [--yes]\n',
    );
    return 2;
  }
  if (options.recoverLock) {
    if (!options.yes && !stdin.isTTY) {
      stdout.write(
        "Exécution non interactive : ajoutez --yes pour confirmer la récupération du verrou.\n",
      );
      return 2;
    }
    try {
      const released = await releaseStaleMigrationLock(options.directory, async (owner) => {
        const pid = owner.pid === undefined ? "inconnu" : String(owner.pid);
        const started = owner.startedAt ?? "date inconnue";
        if (options.yes) {
          return true;
        }
        return confirmQuestion(
          `Le verrou indique PID ${pid}, démarré ${started}. Le processus doit être arrêté avant la récupération. Continuer ? [o/N] `,
        );
      });
      stdout.write(
        released
          ? "Verrou périmé libéré et récupération terminée.\n"
          : "Aucun verrou périmé libéré.\n",
      );
      return released ? 0 : 2;
    } catch (error) {
      stdout.write(
        `Récupération refusée : ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 4;
    }
  }
  if (!options.dryRun && !options.yes && !stdin.isTTY) {
    stdout.write("Exécution non interactive : ajoutez --yes pour confirmer la migration.\n");
    return 2;
  }
  try {
    let reportWasPrinted = false;
    const result = await runLegacyMigration({
      directory: options.directory,
      dryRun: options.dryRun,
      tables: TABLES,
      validateStaged: async (directory) => {
        await DatasetRepository.open(directory);
      },
      confirm: async (inspection) => {
        if (!reportWasPrinted) {
          printInspection(inspection);
          reportWasPrinted = true;
        }
        if (options.yes) {
          return true;
        }
        return confirmMigration();
      },
    });
    if (!reportWasPrinted) {
      printInspection(result.inspection);
    }
    if (result.status === "dry-run") {
      stdout.write("Simulation uniquement : aucun fichier, verrou ou sauvegarde n'a été créé.\n");
      return result.inspection.problems.length ? 3 : 0;
    }
    if (result.status === "current") {
      stdout.write("Ce jeu de données utilise déjà le modèle v1. Aucun changement effectué.\n");
      return 0;
    }
    if (result.status === "cancelled") {
      stdout.write("Migration annulée. Aucun fichier modifié.\n");
      return 2;
    }
    stdout.write(`Migration terminée. Sauvegarde complète : ${result.receipt.backupPath}\n`);
    stdout.write(`Reçu : ${result.receipt.migrationId}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stdout.write(`Échec de la migration : ${message}\n`);
    if (error instanceof MigrationFormatError || error instanceof MigrationValidationError) {
      return 3;
    }
    return /non pris en charge|invalide|inattendues|incohérent|unknown|schema/i.test(message)
      ? 3
      : 4;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { directory: "", dryRun: false, yes: false, recoverLock: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dataset") {
      options.directory = args[++index] ?? "";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--recover-lock") {
      options.recoverLock = true;
    } else {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }
  return options;
}

async function confirmMigration(): Promise<boolean> {
  stdout.write(
    "La migration convertira ce registre au modèle v1. Une sauvegarde complète sera créée; la version précédente ne pourra pas ouvrir le nouveau format.\n",
  );
  return confirmQuestion("Continuer ? [o/N] ");
}

async function confirmQuestion(question: string): Promise<boolean> {
  const input = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await input.question(question);
    return (
      answer.trim().toLocaleLowerCase("fr-FR") === "o" ||
      answer.trim().toLocaleLowerCase("fr-FR") === "oui"
    );
  } finally {
    input.close();
  }
}

function printInspection(inspection: LegacyDatasetInspection): void {
  stdout.write(`Dossier : ${inspection.directory}\n`);
  stdout.write(`Schéma source : ${inspection.sourceSchema ?? "inconnu"}\n`);
  if (inspection.format === "legacy") {
    stdout.write(
      "Conversion prévue : modèle v1, schéma 8 (registre activé en mode chats uniquement).\n",
    );
  }
  stdout.write(
    `Jeu de données : ${inspection.name ?? "sans nom"} (${inspection.datasetId ?? "identifiant absent"})\n`,
  );
  if (inspection.backupLocation) {
    stdout.write(`Emplacement prévu de la sauvegarde complète : ${inspection.backupLocation}\n`);
  }
  stdout.write("Enregistrements :\n");
  for (const [key, count] of Object.entries(inspection.counts)) {
    stdout.write(`  ${key}: ${count}\n`);
  }
  for (const problem of inspection.problems) {
    stdout.write(`Problème : ${problem}\n`);
  }
  if (inspection.hasUnfinishedTransaction) {
    stdout.write(
      "Transaction d'origine inachevée : sa récupération sera incluse dans la sauvegarde.\n",
    );
  }
}
