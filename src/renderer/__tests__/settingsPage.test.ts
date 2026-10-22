// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalService } from "../../application/animalService";
import { createEmptyDataset } from "../../domain/dataset";
import type { AnimalAppApi, AppSnapshot } from "../../shared/types";
import { App } from "../App";

let root: Root | undefined;

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function snapshot(): AppSnapshot {
  return {
    ...createEmptyDataset(),
    datasetPath: "/tmp/settings-page-test",
    demoMode: false,
    showDemoWelcome: false,
    animalViews: [],
    emailTemplates: {
      leadDays: 14,
      sterilisation: { subject: "", body: "" },
      vaccination: { subject: "", body: "" },
      antiFlea: { subject: "", body: "" },
      deworming: { subject: "", body: "" },
      icad: { subject: "", body: "" },
    },
    generatedEmails: [],
    emailOutputDirectory: "",
  };
}

async function openSettings(
  initial: AppSnapshot,
  save: AnimalAppApi["setEnabledSpecies"] = vi.fn(),
): Promise<void> {
  Object.defineProperty(window, "catApp", {
    configurable: true,
    value: { bootstrap: async () => initial, setEnabledSpecies: save },
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(App)));
  const navigation = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
    (button) => button.textContent?.includes("Paramètres"),
  );
  expect(navigation).toBeDefined();
  await act(async () => navigation?.click());
}

function checkbox(label: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

describe("settings page", () => {
  it("keeps the last species enabled and allows another species to be added", async () => {
    const initial = snapshot();
    const save = vi.fn(async (enabledSpecies) => ({
      ...initial,
      settings: { ...initial.settings, enabledSpecies },
    }));
    await openSettings(initial, save);

    expect(checkbox("Chats").disabled).toBe(true);
    expect(document.getElementById("settings-species-cat-description")?.textContent).toContain(
      "Au moins une espèce",
    );
    await act(async () => checkbox("Chiens").click());

    expect(save).toHaveBeenCalledWith(["cat", "dog"]);
    expect(checkbox("Chiens").checked).toBe(true);
    expect(checkbox("Chats").disabled).toBe(false);
  });

  it.each([false, true])(
    "locks species with stored animals in demoMode=%s and shows every count",
    async (demoMode) => {
      const initial = snapshot();
      const service = new AnimalService(initial);
      service.setEnabledSpecies(["cat", "dog"]);
      service.createAnimal({ name: "Moka", speciesId: "dog" });
      initial.demoMode = demoMode;
      const save = vi.fn();
      await openSettings(initial, save);

      const dog = checkbox("Chiens");
      expect(dog.disabled).toBe(true);
      expect(document.getElementById(dog.getAttribute("aria-describedby")!)?.textContent).toContain(
        "1 animal enregistré",
      );
      expect(checkbox("Chats").disabled).toBe(false);
      expect(dog.closest("label")?.querySelector(".badge")?.textContent).toBe("1 animal");
      expect(checkbox("Chats").closest("label")?.querySelector(".badge")?.textContent).toBe(
        "0 animaux",
      );
      expect(checkbox("Lapins").closest("label")?.querySelector(".badge")?.textContent).toBe(
        "0 animaux",
      );
      await act(async () => dog.click());
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("explains demo replacement while keeping species with animals locked", async () => {
    const initial = snapshot();
    const service = new AnimalService(initial);
    service.setEnabledSpecies(["cat", "dog"]);
    service.createAnimal({ name: "Moka", speciesId: "dog" });
    initial.demoMode = true;
    await openSettings(initial);

    expect(checkbox("Chiens").disabled).toBe(true);
    expect(document.getElementById("settings-demo-description")?.textContent).toContain(
      "remplace vos essais",
    );
  });

  it("blocks overlapping saves and retains saved choices when a save fails", async () => {
    let rejectSave!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<AppSnapshot>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    await openSettings(snapshot(), save);
    await act(async () => checkbox("Chiens").click());

    expect(document.querySelector("fieldset")?.disabled).toBe(true);
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Enregistrement");
    await act(async () => checkbox("Lapins").click());
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => rejectSave(new Error("Enregistrement impossible.")));

    expect(document.querySelector("fieldset")?.disabled).toBe(false);
    expect(checkbox("Chiens").checked).toBe(false);
    expect(checkbox("Chats").checked).toBe(true);
    expect(document.querySelector(".notice.error")?.textContent).toContain(
      "Enregistrement impossible.",
    );
  });
});
