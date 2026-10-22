import type { AnimalStatus, AnimalView, Family, SterilizationStatus } from "../shared/types";

export type AnimalSortField = "name" | "birthDate" | "intakeDate" | "updatedAt";
export type SortDirection = "asc" | "desc";

export interface AnimalTableOptions {
  query: string;
  status: AnimalStatus | "ALL";
  sterilization: SterilizationStatus | "ALL";
  sortBy: AnimalSortField;
  direction: SortDirection;
  page: number;
  pageSize: number;
}

export interface AnimalTableResult {
  rows: AnimalView[];
  total: number;
  page: number;
  pageCount: number;
}

export function buildAnimalTable(
  animals: AnimalView[],
  families: Family[],
  options: AnimalTableOptions,
): AnimalTableResult {
  const query = normalize(options.query);
  const familyById = new Map(families.map((family) => [family.id, family]));
  const filtered = animals.filter((cat) => {
    if (options.status !== "ALL" && cat.status !== options.status) {
      return false;
    }
    if (options.sterilization !== "ALL" && cat.sterilizationStatus !== options.sterilization) {
      return false;
    }
    if (!query) {
      return true;
    }
    const family = familyById.get(cat.currentFamilyId);
    return normalize(
      [
        cat.name,
        cat.identificationNumber,
        cat.notes,
        cat.sex,
        cat.status,
        family?.label,
        family?.firstName,
        family?.lastName,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(query);
  });

  filtered.sort((left, right) => compareAnimals(left, right, options.sortBy, options.direction));
  const pageCount = Math.max(1, Math.ceil(filtered.length / options.pageSize));
  const page = Math.min(Math.max(1, options.page), pageCount);
  const start = (page - 1) * options.pageSize;
  return {
    rows: filtered.slice(start, start + options.pageSize),
    total: filtered.length,
    page,
    pageCount,
  };
}

function compareAnimals(
  left: AnimalView,
  right: AnimalView,
  field: AnimalSortField,
  direction: SortDirection,
): number {
  const leftValue = left[field] || "";
  const rightValue = right[field] || "";
  if (!leftValue && rightValue) {
    return 1;
  }
  if (leftValue && !rightValue) {
    return -1;
  }
  const compared =
    field === "name"
      ? leftValue.localeCompare(rightValue, "fr", { sensitivity: "base" })
      : leftValue.localeCompare(rightValue);
  return direction === "asc" ? compared : -compared;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
