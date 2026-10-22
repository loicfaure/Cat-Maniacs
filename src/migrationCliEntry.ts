import { runMigrationCli } from "./migrationCli";

runMigrationCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
