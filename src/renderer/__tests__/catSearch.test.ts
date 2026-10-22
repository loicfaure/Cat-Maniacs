import { describe, expect, it } from "vitest";
import type { AnimalView, Family } from "../../shared/types";
import { searchAdoptionAnimals } from "../animalSearch";

function cat(index: number, overrides: Partial<AnimalView> = {}): AnimalView {
  return {
    id: `cat-${index}`,
    speciesId: "cat",
    speciesData: {},
    identificationScheme: "ICAD",
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
    compatibilityBySpecies: {},
    status: "AT_REFUGE",
    currentFamilyId: "",
    currentRefugeZoneId: "",
    currentLocationLabel: "",
    ...overrides,
  };
}

describe("adoption cat search", () => {
  it("limits the initial result list to ten animals", () => {
    const result = searchAdoptionAnimals(
      Array.from({ length: 25 }, (_, index) => cat(index)),
      [],
      "",
    );
    expect(result.matches).toHaveLength(25);
    expect(result.visible).toHaveLength(10);
  });

  it("finds animals by name, ICAD or foster family without accents", () => {
    const family = {
      id: "family-1",
      label: "Famille Hébert",
      courtesyTitle: "",
      firstName: "Léa",
      lastName: "Hébert",
      email: "",
      phone: "",
      address: "",
      maxCapacity: 3,
      acceptanceRules: { cat: { profiles: ["ADULT"] } },
      notes: "",
      createdAt: "",
      updatedAt: "",
    } satisfies Family;
    const animals = [
      cat(1, {
        name: "Étoile",
        identificationNumber: "250260123456789",
        currentFamilyId: family.id,
      }),
      cat(2, { name: "Milo" }),
    ];
    expect(searchAdoptionAnimals(animals, [family], "etoile").visible[0].name).toBe("Étoile");
    expect(searchAdoptionAnimals(animals, [family], "6789").visible[0].name).toBe("Étoile");
    expect(searchAdoptionAnimals(animals, [family], "hebert").visible[0].name).toBe("Étoile");
  });
});
