import { describe, expect, it } from "vitest";
import { buildCatTable } from "../src/renderer/catTable";
import type { CatView, Family } from "../src/shared/types";

function cat(index: number, overrides: Partial<CatView> = {}): CatView {
  return {
    id: `cat-${index}`, name: `Chat ${String(index).padStart(2, "0")}`, identificationNumber: "",
    birthDate: "", sex: "UNKNOWN", profile: "ADULT", sterilizationStatus: "UNKNOWN", adoptionEligibility: "ELIGIBLE", adoptionBlockedReason: "", healthStatus: "HEALTHY", intakeDate: `2026-01-${String(index + 1).padStart(2, "0")}`,
    notes: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    status: "AT_REFUGE", currentFamilyId: "", currentRefugeZoneId: "", currentLocationLabel: "", ...overrides
  };
}

const baseOptions = {
  query: "", status: "ALL" as const, sterilization: "ALL" as const,
  sortBy: "intakeDate" as const, direction: "desc" as const, page: 1, pageSize: 25
};

describe("cats table", () => {
  it("filters by lifecycle and sterilization status", () => {
    const cats = [
      cat(1, { status: "ADOPTED", sterilizationStatus: "DONE" }),
      cat(2, { status: "AT_REFUGE", sterilizationStatus: "TODO" }),
      cat(3, { status: "AT_REFUGE", sterilizationStatus: "DONE" })
    ];
    const result = buildCatTable(cats, [], { ...baseOptions, status: "AT_REFUGE", sterilization: "DONE" });
    expect(result.rows.map((row) => row.id)).toEqual(["cat-3"]);
  });

  it("searches foster contacts, sorts dates and paginates", () => {
    const family = {
      id: "family", label: "Accueil Durand", courtesyTitle: "", firstName: "Léa",
      lastName: "Durand", email: "", phone: "", address: "", maxCapacity: 3, acceptedProfiles: ["ADULT"], notes: "", createdAt: "", updatedAt: ""
    } satisfies Family;
    const cats = Array.from({ length: 30 }, (_, index) => cat(index));
    cats[5] = cat(5, { name: "Étoile", currentFamilyId: family.id, status: "FOSTERED", intakeDate: "2026-06-30" });
    expect(buildCatTable(cats, [family], { ...baseOptions, query: "durand" }).rows[0].name).toBe("Étoile");
    const secondPage = buildCatTable(cats, [family], { ...baseOptions, page: 2, pageSize: 10 });
    expect(secondPage.total).toBe(30);
    expect(secondPage.pageCount).toBe(3);
    expect(secondPage.rows).toHaveLength(10);
    expect(secondPage.rows[0].intakeDate >= secondPage.rows.at(-1)!.intakeDate).toBe(true);
  });
});
