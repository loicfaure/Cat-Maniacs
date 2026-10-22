import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../../domain/dataset";
import { registeredSpecies } from "../../domain/species/registry";
import { parseDatasetManifest, parseTransactionJournal } from "../database/json";
import {
  loadDatasetTable,
  parseAnimal,
  parseProfiles,
  serializeDatasetTable,
} from "../database/records";
import { TABLES } from "../database/tables";

describe("database row and file types", () => {
  it("parses and serializes every declared dataset table", () => {
    const dataset = createEmptyDataset();
    for (const table of TABLES) {
      loadDatasetTable(table.key, dataset, [
        {
          id: "row-1",
          name: "Milo",
          ...(table.key === "animals"
            ? {
                speciesId: "cat",
                speciesData: "{}",
                identificationScheme: "NONE",
                compatibilityBySpecies: "{}",
              }
            : {}),
          ...(table.key === "families"
            ? { acceptanceRules: '{"cat":{"profiles":["ADULT"]}}' }
            : {}),
          ...(table.key === "refugeZones" ? { allowedSpecies: '["cat"]' } : {}),
        },
      ]);
      expect(serializeDatasetTable(table.key, dataset)).toHaveLength(1);
    }
    expect(dataset.animals[0].sex).toBe("UNKNOWN");
    expect(dataset.families[0].acceptanceRules?.cat?.profiles).toEqual(["ADULT"]);
    expect(dataset.sponsorships[0].monthlyAmount).toBe(0);
  });

  it("validates manifests and recovery journals at the JSON boundary", () => {
    expect(
      parseDatasetManifest(
        JSON.stringify({
          modelVersion: 1,
          schemaVersion: 8,
          settings: { enabledSpecies: ["cat"] },
          datasetId: "dataset-1",
          name: "Animals",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ).schemaVersion,
    ).toBe(8);
    expect(() => parseDatasetManifest("{}")).toThrow("manifeste");
    expect(
      parseTransactionJournal(
        JSON.stringify({ id: "tx-1", files: [{ temporary: "a.tmp", target: "a" }] }),
      ),
    ).toEqual({ id: "tx-1", files: [{ temporary: "a.tmp", target: "a" }] });
    expect(() => parseTransactionJournal(JSON.stringify({ id: "tx-1", files: [null] }))).toThrow(
      "entrée invalide",
    );
  });

  it("uses registry profile metadata as the codec's supported profile catalog", () => {
    for (const species of registeredSpecies) {
      expect(parseProfiles(species.profiles.map((profile) => profile.id).join("|"))).toEqual(
        species.profiles.map((profile) => profile.id),
      );
      for (const profile of species.profiles) {
        expect(
          parseAnimal({
            id: `${species.id}-${profile.id}`,
            speciesId: species.id,
            speciesData: "{}",
            identificationScheme: "NONE",
            compatibilityBySpecies: "{}",
            profile: profile.id,
          }).profile,
        ).toBe(profile.id);
      }
    }
    expect(() =>
      parseAnimal({
        id: "dog-kitten",
        speciesId: "dog",
        speciesData: "{}",
        identificationScheme: "NONE",
        compatibilityBySpecies: "{}",
        profile: "KITTEN",
      }),
    ).toThrow("incompatible");
  });
});
