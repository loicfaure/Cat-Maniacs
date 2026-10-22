// @vitest-environment jsdom
// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SpeciesData, SpeciesId } from "../../core/types";

// Emulates a host adding another definition. The production ID map stays closed to its four v1 species.
vi.mock("../../domain/species/registry", () => ({
  getSpeciesDefinition: () => ({
    id: "ferret",
    label: { singular: "furet", plural: "Furets", definiteSingular: "le furet" },
    iconKey: "ferret",
    profiles: [{ id: "ADULT", label: "Adulte" }],
    validateSpeciesData: () => true,
    identificationSchemes: [{ id: "OTHER", label: "Autre identifiant" }],
    careCategories: [],
    fields: [
      { key: "coat", label: "Robe", kind: "text" },
      {
        key: "coatPattern",
        label: "Motif",
        kind: "select",
        options: [{ value: "MASKED", label: "Masqué" }],
      },
    ],
    createDemoData: () => ({ birthDate: "2024-01-01", speciesData: { coat: "Sable" } }),
  }),
}));

import { SpeciesDetailsFields } from "../speciesPresentation";

describe("species extension presentation contract", () => {
  it("renders fields from an additional definition without species-specific renderer code", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeciesDetailsFields, {
        speciesId: "ferret" as SpeciesId,
        value: {} as SpeciesData,
        onChange: () => {},
      }),
    );
    const document = new DOMParser().parseFromString(markup, "text/html");

    expect(document.querySelector("fieldset legend")?.textContent).toBe("Détails · furet");
    expect(document.querySelector('input[name="speciesData.coat"]')?.getAttribute("type")).toBe(
      "text",
    );
    expect(
      document.querySelector('select[name="speciesData.coatPattern"] option[value="MASKED"]')
        ?.textContent,
    ).toBe("Masqué");
  });
});
