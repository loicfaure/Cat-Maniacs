import type { CatStatus, CatView, Family, SterilizationStatus } from "../shared/types";

export type CatSortField = "name" | "birthDate" | "intakeDate" | "updatedAt";
export type SortDirection = "asc" | "desc";

export interface CatTableOptions {
  query: string;
  status: CatStatus | "ALL";
  sterilization: SterilizationStatus | "ALL";
  sortBy: CatSortField;
  direction: SortDirection;
  page: number;
  pageSize: number;
}

export interface CatTableResult {
  rows: CatView[];
  total: number;
  page: number;
  pageCount: number;
}

export function buildCatTable(
  cats: CatView[],
  families: Family[],
  options: CatTableOptions
): CatTableResult {
  const query = normalize(options.query);
  const familyById = new Map(families.map((family) => [family.id, family]));
  const filtered = cats.filter((cat) => {
    if (options.status !== "ALL" && cat.status !== options.status) return false;
    if (options.sterilization !== "ALL" && cat.sterilizationStatus !== options.sterilization) return false;
    if (!query) return true;
    const family = familyById.get(cat.currentFamilyId);
    return normalize([
      cat.name,
      cat.identificationNumber,
      cat.notes,
      cat.sex,
      cat.status,
      family?.label,
      family?.firstName,
      family?.lastName
    ].filter(Boolean).join(" ")).includes(query);
  });

  filtered.sort((left, right) => compareCats(left, right, options.sortBy, options.direction));
  const pageCount = Math.max(1, Math.ceil(filtered.length / options.pageSize));
  const page = Math.min(Math.max(1, options.page), pageCount);
  const start = (page - 1) * options.pageSize;
  return { rows: filtered.slice(start, start + options.pageSize), total: filtered.length, page, pageCount };
}

function compareCats(left: CatView, right: CatView, field: CatSortField, direction: SortDirection): number {
  const leftValue = left[field] || "";
  const rightValue = right[field] || "";
  if (!leftValue && rightValue) return 1;
  if (leftValue && !rightValue) return -1;
  const compared = field === "name"
    ? leftValue.localeCompare(rightValue, "fr", { sensitivity: "base" })
    : leftValue.localeCompare(rightValue);
  return direction === "asc" ? compared : -compared;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
