import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AnimalService } from "../../application/animalService";
import { createEmptyDataset, deriveAnimalView } from "../../domain/dataset";
import { getSpeciesDefinition } from "../../domain/species/registry";
import type { AppSnapshot } from "../../shared/types";
import { App } from "../App";

let dom: JSDOM | undefined;
let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  dom?.window.close();
  dom = undefined;
});

async function openAnimalForm(
  enabledSpecies: AppSnapshot["settings"]["enabledSpecies"],
  { openForm = true, populate = false } = {},
): Promise<Document> {
  dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Event: { configurable: true, value: dom.window.Event },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  const dataset = createEmptyDataset();
  dataset.settings.enabledSpecies = [...enabledSpecies];
  if (populate) {
    const service = new AnimalService(dataset);
    for (let index = 0; index < 31; index++) {
      service.createAnimal({ name: `Chat ${index}`, speciesId: "cat" });
    }
    service.createAnimal({ name: "Fido", speciesId: "dog" });
  }
  const snapshot: AppSnapshot = {
    ...dataset,
    demoMode: false,
    showDemoWelcome: false,
    datasetPath: "/tmp/species-dom-test",
    animalViews: dataset.animals.map((animal) => deriveAnimalView(dataset, animal)),
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
  Object.defineProperty(dom.window, "catApp", {
    configurable: true,
    value: { bootstrap: async () => snapshot },
  });
  const container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const navText =
    enabledSpecies.length === 1 ? getSpeciesDefinition(enabledSpecies[0]!).label.plural : "Animaux";
  const animalNav = [...dom.window.document.querySelectorAll<HTMLButtonElement>("nav button")].find(
    (button) => button.textContent?.includes(navText),
  );
  await act(async () => {
    animalNav?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const createButton = [...dom.window.document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Nouveau"),
  );
  if (!animalNav || !createButton) {
    throw new Error(dom.window.document.body.textContent ?? "App did not load");
  }
  if (openForm) {
    await act(async () => {
      createButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return dom.window.document;
}

describe("integrated app species controls", () => {
  it.each(["cat", "dog", "rabbit", "snake"] as const)(
    "does not render a species choice for a %s-only dataset",
    async (speciesId) => {
      const document = await openAnimalForm([speciesId]);
      expect(document.querySelector(".species-selector")).toBeNull();
      expect(document.querySelector(".species-filter")).toBeNull();
    },
  );

  it("renders and offers enabled species in the mixed dataset animal form", async () => {
    const document = await openAnimalForm(["cat", "dog"]);
    const selector = document.querySelector<HTMLSelectElement>(".species-selector select");
    expect(selector).not.toBeNull();
    expect([...selector!.options].map((option) => option.value)).toEqual(["cat", "dog"]);
  });

  it("groups the labeled filters together and resets pagination when species changes", async () => {
    const document = await openAnimalForm(["cat", "dog"], { openForm: false, populate: true });
    const filters = document.querySelector('[role="group"][aria-label="Filtres du registre"]')!;
    expect(
      [...filters.querySelectorAll(".registry-filter-trigger")].map((button) => button.textContent),
    ).toEqual(expect.arrayContaining(["Espèce", "Statut", "Stérilisation"]));
    expect(document.querySelector(".registry-toolbar select")).toBeNull();
    const next = [...document.querySelectorAll<HTMLButtonElement>(".pagination button")].find(
      (button) => button.textContent?.includes("Suivant"),
    )!;
    await act(async () => next.click());
    expect(document.querySelector(".pagination > span")?.textContent).toContain("Page 2 sur 2");

    await act(async () => {
      [...filters.querySelectorAll<HTMLButtonElement>(".registry-filter-trigger")]
        .find((button) => button.textContent === "Espèce")!
        .click();
    });
    const species = [
      ...document.querySelectorAll<HTMLLabelElement>(".registry-facet-options label"),
    ].find((label) => label.textContent?.includes("Chiens"))!;
    await act(async () => {
      species.querySelector<HTMLInputElement>("input")!.click();
      [...document.querySelectorAll<HTMLButtonElement>(".registry-filter-drawer footer button")]
        .find((button) => button.textContent?.startsWith("Afficher"))!
        .click();
    });
    expect(document.querySelector(".pagination > span")?.textContent).toContain("Page 1 sur 1");
    expect(document.querySelectorAll(".registry-table tbody tr")).toHaveLength(1);
    expect(document.querySelector(".registry-table tbody")?.textContent).toContain("Fido");
  });
});
