import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSpeciesDemoData,
  getSpeciesDefinition,
  isSpeciesId,
  registeredSpecies,
  validateSpeciesData,
} from "./registry";
import type { SpeciesId } from "./types";

const sourceRoot = resolve(import.meta.dirname, "../..");
const speciesDirectory = resolve(sourceRoot, "domain/species");

describe("species registry", () => {
  it("registers the four initial species with French presentation and profile metadata", () => {
    expect(registeredSpecies.map(({ id }) => id)).toEqual(["cat", "dog", "rabbit", "snake"]);
    expect(registeredSpecies.map(({ label }) => label.plural)).toEqual([
      "Chats",
      "Chiens",
      "Lapins",
      "Serpents",
    ]);
    expect(getSpeciesDefinition("cat").profiles.map(({ id }) => id)).toEqual([
      "BOTTLE_KITTEN",
      "KITTEN",
      "ADULT",
      "SENIOR",
      "SPECIAL_NEEDS",
    ]);
    expect(getSpeciesDefinition("dog").deriveProfile).toBeUndefined();
    expect(getSpeciesDefinition("rabbit").deriveProfile).toBeUndefined();
    expect(getSpeciesDefinition("snake").deriveProfile).toBeUndefined();
    expect(getSpeciesDefinition("snake").careCategories).toEqual([]);
    expect(getSpeciesDefinition("snake").identificationSchemes.map(({ id }) => id)).toEqual([
      "OTHER",
    ]);
  });

  it("validates exact species details and rejects unknown species IDs", () => {
    expect(isSpeciesId("cat")).toBe(true);
    expect(isSpeciesId("ferret")).toBe(false);
    expect(validateSpeciesData("cat", { breed: "Européen" })).toEqual({ breed: "Européen" });
    expect(validateSpeciesData("dog", { size: "LARGE" })).toEqual({ size: "LARGE" });
    expect(validateSpeciesData("rabbit", {})).toEqual({});
    expect(validateSpeciesData("snake", { taxon: "Python royal", lengthCm: 90 })).toEqual({
      taxon: "Python royal",
      lengthCm: 90,
    });
    expect(() => validateSpeciesData("cat", { breed: "", taxon: "autre" })).toThrow(/détails/);
    expect(() => validateSpeciesData("dog", { size: "HUGE" })).toThrow(/détails/);
    expect(() => validateSpeciesData("snake", { lengthCm: -1 })).toThrow(/détails/);
    expect(() => validateSpeciesData("ferret", {})).toThrow(/non prise en charge/);
  });

  it("creates demo details relative to the supplied local date", () => {
    const referenceDate = new Date(2026, 0, 15);
    expect(createSpeciesDemoData("cat", referenceDate)).toEqual({
      birthDate: "2025-11-16",
      speciesData: { breed: "Européen" },
    });
    for (const id of ["dog", "rabbit", "snake"] as const satisfies readonly SpeciesId[]) {
      const demo = createSpeciesDemoData(id, referenceDate);
      expect(demo.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(getSpeciesDefinition(id).validateSpeciesData(demo.speciesData)).toBe(true);
    }
    expect(createSpeciesDemoData("cat", referenceDate, 99).birthDate).toBe("2025-11-16");
  });

  it("keeps species domain code within core and domain import boundaries", () => {
    for (const file of sourceFiles(speciesDirectory)) {
      const source = readFileSync(file, "utf8");
      const imports = source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g);
      for (const [, specifier] of imports) {
        expect(specifier, `${relative(sourceRoot, file)} imports ${specifier}`).toMatch(/^\./);
        const target = resolve(dirname(file), specifier);
        const root = relative(sourceRoot, target).split(sep)[0];
        expect(["core", "domain"], `${relative(sourceRoot, file)} imports ${specifier}`).toContain(
          root,
        );
      }
      expect(source).not.toMatch(/from\s+["'](?:react|\.\.\/\.\.\/renderer)/);
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [path]
        : [];
  });
}
