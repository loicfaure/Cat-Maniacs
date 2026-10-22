// @vitest-environment jsdom
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SpeciesData } from "../../core/types";
import {
  SpeciesChip,
  SpeciesDetailsFields,
  SpeciesLabel,
  SpeciesSelector,
} from "../speciesPresentation";

function renderInDocument(element: ReactNode): Document {
  const markup = renderToStaticMarkup(element);
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("species presentation", () => {
  it("renders a species selector and the matching details in multi-species mode", () => {
    const onChange = vi.fn();
    const document = renderInDocument(
      createElement(
        Fragment,
        null,
        createElement(SpeciesSelector, {
          enabledSpecies: ["cat", "dog"],
          value: "dog",
          onChange,
        }),
        createElement(SpeciesDetailsFields, {
          speciesId: "dog",
          value: { breed: "Croisé" },
          onChange,
        }),
      ),
    );

    const selector = document.querySelector<HTMLSelectElement>('select[name="speciesId"]');
    expect(selector).not.toBeNull();
    expect(selector?.required).toBe(true);
    expect(Array.from(selector?.options ?? []).map((option) => option.textContent)).toEqual([
      "Chat",
      "Chien",
    ]);
    expect(document.querySelector('fieldset[data-species-id="dog"] legend')?.textContent).toBe(
      "Détails · chien",
    );
    expect(document.querySelector('input[name="speciesData.breed"]')).not.toBeNull();
    expect(document.querySelector('select[name="speciesData.size"]')).not.toBeNull();
  });

  it("omits the species selector in single-species mode while keeping species details", () => {
    const onChange = vi.fn();
    const document = renderInDocument(
      createElement(
        Fragment,
        null,
        createElement(SpeciesSelector, {
          enabledSpecies: ["snake"],
          value: "snake",
          onChange,
        }),
        createElement(SpeciesDetailsFields, {
          speciesId: "snake",
          value: { taxon: "Python royal", lengthCm: 90 },
          onChange: (value: SpeciesData) => onChange(value),
        }),
      ),
    );

    expect(document.querySelector('select[name="speciesId"]')).toBeNull();
    expect(document.querySelector('fieldset[data-species-id="snake"]')).not.toBeNull();
    expect(document.querySelector('input[name="speciesData.taxon"]')).not.toBeNull();
    expect(document.querySelector('input[name="speciesData.lengthCm"]')).not.toBeNull();
  });

  it("uses registry labels for chips and singular or plural text", () => {
    const document = renderInDocument(
      createElement(
        Fragment,
        null,
        createElement(SpeciesChip, { speciesId: "rabbit" }),
        createElement("span", { "data-testid": "singular" }, SpeciesLabel({ speciesId: "rabbit" })),
        createElement(
          "span",
          { "data-testid": "plural" },
          SpeciesLabel({ speciesId: "rabbit", form: "plural" }),
        ),
      ),
    );

    expect(document.querySelector(".species-chip")?.textContent).toBe("🐰");
    expect(document.querySelector(".species-chip")?.getAttribute("title")).toBe("lapin");
    expect(document.querySelector(".species-chip")?.getAttribute("aria-label")).toBe("lapin");
    expect(document.querySelector('[data-testid="singular"]')?.textContent).toBe("lapin");
    expect(document.querySelector('[data-testid="plural"]')?.textContent).toBe("Lapins");
  });
});
