import { describe, expect, it } from "vitest";
import { searchAdoptionCats } from "../src/renderer/catSearch";
import type { CatView, Family } from "../src/shared/types";

function cat(index: number, overrides: Partial<CatView> = {}): CatView {
  return {
    id: `cat-${index}`,
    name: `Chat ${String(index).padStart(2, "0")}`,
    identificationNumber: `2502600000000${String(index).padStart(2, "0")}`,
    birthDate: "",
    sex: "UNKNOWN",
    profile: "ADULT",
    sterilizationStatus: "UNKNOWN",
    adoptionEligibility: "ELIGIBLE",
    adoptionBlockedReason: "",
    healthStatus: "HEALTHY",
    intakeDate: "2026-01-01",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "AT_REFUGE",
    currentFamilyId: "",
    currentRefugeZoneId: "",
    currentLocationLabel: "",
    ...overrides
  };
}

describe("adoption cat search", () => {
  it("limits the initial result list to ten cats", () => {
    const result = searchAdoptionCats(Array.from({ length: 25 }, (_, index) => cat(index)), [], "");
    expect(result.matches).toHaveLength(25);
    expect(result.visible).toHaveLength(10);
  });

  it("finds cats by name, ICAD or foster family without accents", () => {
    const family = {
      id: "family-1", label: "Famille Hébert", courtesyTitle: "", firstName: "Léa",
      lastName: "Hébert", email: "", phone: "", address: "", maxCapacity: 3, acceptedProfiles: ["ADULT"], notes: "", createdAt: "", updatedAt: ""
    } satisfies Family;
    const cats = [
      cat(1, { name: "Étoile", identificationNumber: "250260123456789", currentFamilyId: family.id }),
      cat(2, { name: "Milo" })
    ];
    expect(searchAdoptionCats(cats, [family], "etoile").visible[0].name).toBe("Étoile");
    expect(searchAdoptionCats(cats, [family], "6789").visible[0].name).toBe("Étoile");
    expect(searchAdoptionCats(cats, [family], "hebert").visible[0].name).toBe("Étoile");
  });
});
