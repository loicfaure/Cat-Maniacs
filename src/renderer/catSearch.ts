import type { CatView, Family } from "../shared/types";

export interface AdoptionCatSearchResult {
  matches: CatView[];
  visible: CatView[];
}

export function searchAdoptionCats(
  cats: CatView[],
  families: Family[],
  query: string,
  limit = 10
): AdoptionCatSearchResult {
  const normalizedQuery = normalize(query);
  const familyById = new Map(families.map((family) => [family.id, family]));
  const matches = cats
    .filter((cat) => {
      if (!normalizedQuery) return true;
      const family = familyById.get(cat.currentFamilyId);
      return normalize([
        cat.name,
        cat.identificationNumber,
        cat.status,
        family?.label,
        family?.firstName,
        family?.lastName
      ].filter(Boolean).join(" ")).includes(normalizedQuery);
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));

  return { matches, visible: matches.slice(0, limit) };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
