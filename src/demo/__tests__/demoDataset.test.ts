import { afterEach, describe, expect, it, vi } from "vitest";
import { profileForBirthDate } from "../../domain/catAge";
import { assertIsoDate, deriveAnimalView, validateDatasetReferences } from "../../domain/dataset";
import { findHealthExposures } from "../../domain/healthTracing";
import { getSpeciesDefinition } from "../../domain/species/registry";
import { createDemoDataset } from "../demoDataset";

describe("demo dataset", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["cat", "dog", "snake", "rabbit"] as const)(
    "builds a coherent %s-only demonstration",
    (speciesId) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-06-15T12:00:00"));
      const dataset = createDemoDataset([speciesId]);
      const species = getSpeciesDefinition(speciesId);
      expect(dataset.settings.enabledSpecies).toEqual([speciesId]);
      expect(dataset.animals).toHaveLength(64);
      expect(dataset.animals.every((animal) => animal.speciesId === speciesId)).toBe(true);
      expect(
        dataset.animals.every((animal) =>
          species.profiles.some((profile) => profile.id === animal.profile),
        ),
      ).toBe(true);
      expect(dataset.animals.every((animal) => animal.birthDate <= animal.intakeDate)).toBe(true);
      expect(validateDatasetReferences(dataset)).toEqual([]);
      if (speciesId !== "cat") {
        const ageInDays = (animal: (typeof dataset.animals)[number]) =>
          (Date.parse("2026-06-15") - Date.parse(animal.birthDate)) / 86_400_000;
        for (const animal of dataset.animals) {
          if (["PUPPY", "YOUNG", "JUVENILE"].includes(animal.profile)) {
            expect(ageInDays(animal)).toBeLessThan(200);
          }
          if (animal.profile === "SENIOR") {
            expect(ageInDays(animal)).toBeGreaterThan(2500);
          }
        }
      }
    },
  );

  it("provides enough coherent data to exercise pagination and workflows", () => {
    const dataset = createDemoDataset();
    const views = dataset.animals.map((cat) => deriveAnimalView(dataset, cat));
    const statuses = new Set(views.map((cat) => cat.status));

    expect(dataset.animals).toHaveLength(64);
    expect(dataset.families.length).toBeGreaterThan(5);
    expect(dataset.adopters.length).toBeGreaterThan(10);
    expect(dataset.fosterPlacements.length).toBeGreaterThan(5);
    expect(dataset.adoptions.length).toBeGreaterThan(12);
    expect(dataset.adoptionDays.length).toBeGreaterThan(1);
    expect(dataset.refugeZones.length).toBeGreaterThan(2);
    expect(dataset.healthAlerts).toHaveLength(1);
    expect(dataset.tasks.length).toBeGreaterThan(5);
    expect(dataset.followUps.length).toBeGreaterThan(5);
    expect(statuses).toEqual(new Set(["FOSTERED", "AT_REFUGE", "ADOPTED", "LOST", "DECEASED"]));
    expect(new Set(dataset.animals.map((cat) => cat.sterilizationStatus)).size).toBe(3);
    expect(validateDatasetReferences(dataset)).toEqual([]);
  });

  it.each([
    "2026-01-01T00:30:00",
    "2026-03-29T00:30:00",
    "2026-10-25T23:30:00",
    "2028-02-29T00:30:00",
    "2032-12-31T23:30:00",
    "2040-05-01T12:00:00",
  ])("keeps ages and timelines coherent on %s", (currentDate) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(currentDate));
    const today = currentDate.slice(0, 10);
    const dataset = createDemoDataset();
    const catById = new Map(dataset.animals.map((cat) => [cat.id, cat]));
    const assertHistoryDate = (animalId: string, date: string) => {
      expect(() => assertIsoDate(date, "Date démo")).not.toThrow();
      expect(date >= catById.get(animalId)!.intakeDate).toBe(true);
      expect(date <= today).toBe(true);
    };

    expect(new Set(dataset.animals.map((cat) => cat.profile))).toEqual(
      new Set(["BOTTLE_KITTEN", "KITTEN", "ADULT", "SENIOR", "SPECIAL_NEEDS"]),
    );
    for (const cat of dataset.animals) {
      expect(() => assertIsoDate(cat.birthDate, "Naissance démo")).not.toThrow();
      expect(cat.birthDate <= cat.intakeDate && cat.intakeDate <= today).toBe(true);
      if (cat.profile !== "SPECIAL_NEEDS") {
        expect(profileForBirthDate(cat.birthDate)).toBe(cat.profile);
      }
      if (cat.profile === "KITTEN" || cat.profile === "BOTTLE_KITTEN") {
        const daysOld = (Date.parse(today) - Date.parse(cat.birthDate)) / 86_400_000;
        expect(daysOld).toBeLessThan(180);
        if (cat.profile === "BOTTLE_KITTEN") {
          expect(daysOld).toBeLessThan(60);
        }
      }
      if (cat.medicationEndDate) {
        expect(cat.medicationEndDate > today).toBe(true);
      }
      // Dates embedded in care descriptions must also move with the calendar.
      for (const text of [cat.vaccines, cat.deworming, cat.antiFlea]) {
        const match = text?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
          const date = `${match[3]}-${match[2]}-${match[1]}`;
          expect(() => assertIsoDate(date, "Soin démo")).not.toThrow();
          expect(date >= cat.intakeDate).toBe(true);
          expect(text?.startsWith("Dernière") ? date <= today : date > today).toBe(true);
        }
      }
    }
    for (const event of dataset.animalEvents) {
      assertHistoryDate(event.animalId, event.date);
    }
    for (const stay of [...dataset.fosterPlacements, ...dataset.refugeStays]) {
      assertHistoryDate(stay.animalId, stay.startDate);
      if (stay.endDate) {
        expect(stay.endDate >= stay.startDate && stay.endDate <= today).toBe(true);
      }
    }
    for (const adoption of dataset.adoptions) {
      assertHistoryDate(adoption.animalId, adoption.adoptionDate);
      expect(catById.get(adoption.animalId)!.profile).not.toBe("BOTTLE_KITTEN");
      if (adoption.endedAt) {
        expect(adoption.endedAt >= adoption.adoptionDate && adoption.endedAt <= today).toBe(true);
      }
    }
    for (const followUp of dataset.followUps) {
      const adoption = dataset.adoptions.find((row) => row.id === followUp.adoptionId)!;
      expect(followUp.requestedAt >= adoption.adoptionDate && followUp.requestedAt <= today).toBe(
        true,
      );
      if (followUp.lastNewsAt) {
        expect(followUp.lastNewsAt >= followUp.requestedAt && followUp.lastNewsAt <= today).toBe(
          true,
        );
      }
    }
    for (const sponsor of dataset.sponsorships) {
      assertHistoryDate(sponsor.animalId, sponsor.startDate);
      expect(sponsor.paymentNotes).toContain(
        new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      );
    }
    for (const alert of dataset.healthAlerts) {
      assertHistoryDate(alert.animalId, alert.declaredAt);
      expect(findHealthExposures(dataset, alert)).toHaveLength(4);
    }
    for (const day of dataset.adoptionDays) {
      expect(day.endDate >= day.startDate).toBe(true);
      const formattedRange = [day.startDate, day.endDate]
        .map((date) => date.split("-").reverse().join("/"))
        .join("–");
      expect(day.name).toContain(formattedRange);
      expect(day.status === "CLOSED" ? day.endDate < today : day.startDate > today).toBe(true);
    }
    expect(dataset.fosterFamilyHolidays.some((row) => row.startDate > today)).toBe(true);
    expect(
      dataset.fosterFamilyHolidays.some((row) => row.startDate <= today && row.endDate >= today),
    ).toBe(true);
    expect(dataset.tasks.some((task) => task.dueDate < today)).toBe(true);
    expect(dataset.tasks.some((task) => task.dueDate > today)).toBe(true);
    for (const task of dataset.tasks) {
      expect(task.dueDate >= catById.get(task.animalId)!.intakeDate).toBe(true);
    }
    expect(validateDatasetReferences(dataset)).toEqual([]);
  });
});
