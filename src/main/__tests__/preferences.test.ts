import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppPreferences, saveAppPreferences } from "../preferences";

describe("app preferences", () => {
  it("starts a first launch in demo mode with the welcome pending", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-dispenser-preferences-"));
    const preferences = await loadAppPreferences(
      join(directory, "missing.json"),
      join(directory, "dataset"),
    );

    expect(preferences).toEqual({
      demoMode: true,
      demoWelcomeSeen: false,
      realDatasetDirectory: join(directory, "dataset"),
      demoEnabledSpecies: ["cat"],
      emailTemplates: expect.objectContaining({ leadDays: 14 }),
      generatedEmailsByDataset: {},
      emailOutputDirectory: "",
    });
  });

  it("persists leaving demo mode and the selected real dataset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cat-dispenser-preferences-"));
    const path = join(directory, "settings", "app-preferences.json");
    const expected = {
      demoMode: false,
      demoWelcomeSeen: true,
      realDatasetDirectory: join(directory, "real-data"),
      demoEnabledSpecies: ["cat" as const],
      emailTemplates: (
        await loadAppPreferences(join(directory, "missing.json"), join(directory, "dataset"))
      ).emailTemplates,
      generatedEmailsByDataset: {},
      emailOutputDirectory: "",
    };

    await saveAppPreferences(path, expected);

    expect(await loadAppPreferences(path, join(directory, "fallback"))).toEqual(expected);
    expect(await readFile(path, "utf8")).toContain('"demoWelcomeSeen": true');
  });
});
