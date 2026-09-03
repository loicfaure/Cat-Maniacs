import { describe, expect, it } from "vitest";
import { createDemoDataset } from "../src/demo/demoDataset";
import { deriveCatView, validateDatasetReferences } from "../src/domain/dataset";

describe("demo dataset", () => {
  it("provides enough coherent data to exercise pagination and workflows", () => {
    const dataset = createDemoDataset();
    const views = dataset.cats.map((cat) => deriveCatView(dataset, cat));
    const statuses = new Set(views.map((cat) => cat.status));

    expect(dataset.cats).toHaveLength(64);
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
    expect(new Set(dataset.cats.map((cat) => cat.sterilizationStatus)).size).toBe(3);
    expect(validateDatasetReferences(dataset)).toEqual([]);
  });
});
