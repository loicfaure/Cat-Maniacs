// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimalService } from "../../application/animalService";
import type { AnimalInput, AnimalUpdateInput, SpeciesId } from "../../core/types";
import { createEmptyDataset, deriveAnimalView } from "../../domain/dataset";
import { App } from "../App";

let root: Root | undefined;
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function openApp(species: SpeciesId[] = ["cat"], seed = false) {
  const dataset = createEmptyDataset();
  dataset.settings.enabledSpecies = species;
  const service = new AnimalService(dataset);
  if (seed) {
    for (const speciesId of species) {
      service.createAnimal({ name: `Animal ${speciesId}`, speciesId });
    }
  }
  const snapshot = () => ({
    ...dataset,
    animalViews: dataset.animals.map((animal) => deriveAnimalView(dataset, animal)),
    datasetPath: "/tmp/animal-fields-test",
    demoMode: false,
    showDemoWelcome: false,
  });
  const createAnimal = vi.fn(async (input: AnimalInput) => {
    service.createAnimal(input);
    return snapshot();
  });
  const updateAnimal = vi.fn(async (input: AnimalUpdateInput) => {
    service.updateAnimal(input);
    return snapshot();
  });
  Object.defineProperty(window, "catApp", {
    configurable: true,
    value: { bootstrap: async () => snapshot(), createAnimal, updateAnimal },
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(App)));
  const navigation = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
    (button) => button.textContent?.includes(species.length > 1 ? "Animaux" : "Chats"),
  )!;
  await act(async () => navigation.click());
  return { dataset, createAnimal, updateAnimal };
}

async function createForm() {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes("Nouveau"),
  )!;
  await act(async () => button.click());
}

async function fill(name: string, value: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  )!;
  expect(element, name).not.toBeNull();
  const prototype =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("animal forms and table presentation", () => {
  it("edits the same characteristics and conditional adoption reason in the animal details", async () => {
    const { updateAnimal } = await openApp(["cat"], true);
    await act(async () => document.querySelector<HTMLElement>(".cat-identity")!.click());
    await fill("speciesData.weightKg", "3.75");
    await fill("speciesData.specialNeeds", "Accueil calme");
    const adoption = document.querySelector<HTMLSelectElement>('select[aria-label="Adoptable"]')!;
    await act(async () => {
      adoption.value = "INELIGIBLE";
      adoption.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await fill("reason", "Repos nécessaire");
    await act(async () =>
      document.querySelector<HTMLFormElement>(".cat-detail-form")!.requestSubmit(),
    );
    expect(updateAnimal).toHaveBeenCalledWith(
      expect.objectContaining({
        adoptionEligibility: "INELIGIBLE",
        adoptionBlockedReason: "Repos nécessaire",
        speciesData: expect.objectContaining({ weightKg: 3.75, specialNeeds: "Accueil calme" }),
      }),
    );
  });
  it("uses date pickers and saves special needs, weight and a conditional adoption reason independently of age", async () => {
    const { createAnimal } = await openApp();
    await createForm();
    expect(document.querySelector<HTMLInputElement>('[name="birthDate"]')?.type).toBe("date");
    expect(document.querySelector<HTMLInputElement>('[name="intakeDate"]')?.type).toBe("date");
    expect(document.querySelector('select option[value="SPECIAL_NEEDS"]')).toBeNull();
    expect(document.querySelector('textarea[name="adoptionBlockedReason"]')).toBeNull();
    const adoption = document.querySelector<HTMLSelectElement>('select[aria-label="Adoptable"]')!;
    expect([...adoption.options].map((option) => option.textContent)).toEqual([
      "Inconnu",
      "Oui",
      "Non",
    ]);
    await act(async () => {
      adoption.value = "INELIGIBLE";
      adoption.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      document.querySelector<HTMLTextAreaElement>('[name="adoptionBlockedReason"]')?.required,
    ).toBe(true);
    await fill("name", "Moka");
    await fill("birthDate", "2020-01-01");
    await fill("speciesData.specialNeeds", "Alimentation adaptée");
    await fill("speciesData.weightKg", "4.25");
    await fill("adoptionBlockedReason", "Soins en cours");
    await act(async () =>
      document.querySelector<HTMLFormElement>('form:has(input[name="name"])')!.requestSubmit(),
    );
    expect(createAnimal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Moka",
        birthDate: "2020-01-01",
        profile: "ADULT",
        adoptionEligibility: "INELIGIBLE",
        adoptionBlockedReason: "Soins en cours",
        speciesData: expect.objectContaining({
          specialNeeds: "Alimentation adaptée",
          weightKg: 4.25,
        }),
      }),
    );
  });

  it("filters breed/color suggestions, accepts new values, and permits unknown halves of mixed characteristics", async () => {
    const { createAnimal, dataset } = await openApp();
    await createForm();
    await fill("name", "Moka");
    await fill("speciesData.breed", "sia");
    expect(document.querySelector('[role="listbox"]')?.textContent).toContain("Siamois");
    expect(document.querySelector('[role="listbox"]')?.textContent).not.toContain("Persan");
    await fill("speciesData.breed", "Race locale");
    const use = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes("Utiliser"),
    )!;
    await act(async () => use.click());
    await act(async () =>
      document.querySelector<HTMLInputElement>('[name="speciesData.mixedBreed"]')!.click(),
    );
    expect(
      document.querySelector<HTMLInputElement>('[name="speciesData.secondaryBreed"]')?.value,
    ).toBe("");
    await fill("speciesData.coatColor", "Ambre clair");
    await act(async () =>
      document.querySelector<HTMLInputElement>('[name="speciesData.mixedCoatColor"]')!.click(),
    );
    expect(
      document.querySelector<HTMLInputElement>('[name="speciesData.secondaryCoatColor"]')?.value,
    ).toBe("");
    await act(async () =>
      document.querySelector<HTMLFormElement>('form:has(input[name="name"])')!.requestSubmit(),
    );
    expect(createAnimal).toHaveBeenCalledWith(
      expect.objectContaining({
        adoptionEligibility: "UNKNOWN",
        speciesData: expect.objectContaining({
          breed: "Race locale",
          mixedBreed: true,
          coatColor: "Ambre clair",
          mixedCoatColor: true,
        }),
      }),
    );
    expect(dataset.settings.appearanceCatalog?.cat?.breeds).toContain("Race locale");
    expect(dataset.settings.appearanceCatalog?.cat?.colors).toContain("Ambre clair");
    await createForm();
    await fill("speciesData.breed", "race loc");
    expect(document.querySelector('[role="listbox"]')?.textContent).toContain("Race locale");
  });

  it("switches species-specific catalogs and labels when creating another species", async () => {
    await openApp(["cat", "dog", "rabbit", "snake"]);
    await createForm();
    const selector = document.querySelector<HTMLSelectElement>(".species-selector select")!;
    await act(async () => {
      selector.value = "snake";
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.querySelector('[name="speciesData.breed"]')).toBeNull();
    await fill("speciesData.taxon", "Python");
    expect(document.querySelector('[role="listbox"]')?.textContent).toContain("Python royal");
    expect(document.querySelector('[role="listbox"]')?.textContent).not.toContain("Labrador");
    expect(
      [...document.querySelectorAll(".field-label")].map((label) => label.textContent),
    ).toContain("Couleur / motif des écailles");
  });

  it("shows species emoji only in their column and opens the refuge without opening the animal drawer", async () => {
    await openApp(["cat", "dog"], true);
    const icons = [...document.querySelectorAll<HTMLElement>(".registry-table .species-chip")];
    expect(icons.map((icon) => icon.textContent).sort()).toEqual(["🐱", "🐶"].sort());
    expect(icons.every((icon) => icon.closest("td")?.classList.contains("species-column"))).toBe(
      true,
    );
    expect(document.querySelector(".cat-identity .species-chip")).toBeNull();
    expect(icons.every((icon) => Boolean(icon.title && icon.getAttribute("aria-label")))).toBe(
      true,
    );
    const refuge = document.querySelector<HTMLElement>(".registry-table tbody .family-link")!;
    expect(refuge.textContent).toContain("Le refuge");
    await act(async () => refuge.click());
    expect(document.querySelector("main h1")?.textContent).toBe("Le refuge");
    expect(document.querySelector(".cat-detail-dialog")).toBeNull();
  });
});
