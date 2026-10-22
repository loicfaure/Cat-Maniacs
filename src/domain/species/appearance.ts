import type { AppearanceCatalog, Dataset, SpeciesData, SpeciesId } from "../../core/types";

export const defaultAppearanceCatalogs: Readonly<Record<SpeciesId, AppearanceCatalog>> = {
  cat: {
    breeds: [
      "Européen",
      "Siamois",
      "Persan",
      "Maine Coon",
      "Chartreux",
      "Bengal",
      "British Shorthair",
    ],
    colors: ["Noir", "Blanc", "Roux", "Gris", "Crème", "Tigré", "Écaille de tortue", "Tricolore"],
  },
  dog: {
    breeds: [
      "Labrador",
      "Berger allemand",
      "Golden Retriever",
      "Bouledogue français",
      "Caniche",
      "Beagle",
      "Border Collie",
    ],
    colors: ["Noir", "Blanc", "Fauve", "Chocolat", "Gris", "Crème", "Bringé"],
  },
  rabbit: {
    breeds: ["Bélier", "Nain", "Rex", "Angora", "Géant des Flandres"],
    colors: ["Noir", "Blanc", "Gris", "Brun", "Roux", "Crème", "Chinchilla"],
  },
  snake: {
    breeds: ["Python royal", "Serpent des blés", "Boa constricteur", "Couleuvre"],
    colors: ["Brun", "Vert", "Jaune", "Noir", "Blanc", "Gris", "Albinos", "Tacheté", "Rayé"],
  },
};

export function normalizeSuggestion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function mergeSuggestions(...lists: readonly string[][]): string[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .map((value) => value.trim())
    .filter((value) => {
      const key = normalizeSuggestion(value);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

export function appearanceValues(data: SpeciesData): AppearanceCatalog {
  return {
    breeds: [
      "breed" in data ? (data.breed ?? "") : "taxon" in data ? (data.taxon ?? "") : "",
      data.mixedBreed ? (data.secondaryBreed ?? "") : "",
    ],
    colors: [data.coatColor ?? "", data.mixedCoatColor ? (data.secondaryCoatColor ?? "") : ""],
  };
}

export function rememberAppearance(
  dataset: Dataset,
  speciesId: SpeciesId,
  data: SpeciesData,
): void {
  const previous = dataset.settings.appearanceCatalog?.[speciesId];
  const stored = dataset.animals
    .filter((animal) => animal.speciesId === speciesId)
    .map((animal) => appearanceValues(animal.speciesData));
  const next = appearanceValues(data);
  const breeds = mergeSuggestions(
    previous?.breeds ?? [],
    ...stored.map((entry) => entry.breeds),
    next.breeds,
  );
  const colors = mergeSuggestions(
    previous?.colors ?? [],
    ...stored.map((entry) => entry.colors),
    next.colors,
  );
  if (breeds.length || colors.length) {
    dataset.settings.appearanceCatalog = {
      ...dataset.settings.appearanceCatalog,
      [speciesId]: { breeds, colors },
    };
  }
}
