import type { ChangeEvent, ReactNode } from "react";
import type {
  AdoptionEligibility,
  Animal,
  AppearanceCatalog,
  SpeciesData,
  SpeciesDataById,
  SpeciesId,
} from "../core/types";
import {
  appearanceValues,
  defaultAppearanceCatalogs,
  mergeSuggestions,
} from "../domain/species/appearance";
import { getSpeciesDefinition } from "../domain/species/registry";
import { Checkbox, Field, FieldGroup, SearchSelect } from "./ui";

interface SpeciesSelectorProps {
  enabledSpecies: readonly SpeciesId[];
  value: SpeciesId;
  onChange: (speciesId: SpeciesId) => void;
  id?: string;
  label?: string;
}

/** Species choice is only needed when a dataset supports more than one species. */
export function SpeciesSelector({
  enabledSpecies,
  value,
  onChange,
  id = "speciesId",
  label = "Espèce",
}: SpeciesSelectorProps): ReactNode {
  if (enabledSpecies.length < 2) {
    return null;
  }

  return (
    <Field className="species-selector" htmlFor={id} label={label}>
      <select
        id={id}
        name="speciesId"
        required
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as SpeciesId)}
      >
        {enabledSpecies.map((speciesId) => {
          const species = getSpeciesDefinition(speciesId);
          return (
            <option key={speciesId} value={speciesId}>
              {species.label.singular[0].toLocaleUpperCase("fr-FR") +
                species.label.singular.slice(1)}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

export function SpeciesFilter({
  enabledSpecies,
  value,
  onChange,
}: {
  enabledSpecies: readonly SpeciesId[];
  value: SpeciesId | "ALL";
  onChange: (speciesId: SpeciesId | "ALL") => void;
}): ReactNode {
  if (enabledSpecies.length < 2) {
    return null;
  }
  return (
    <Field label="Espèce" className="species-filter">
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as SpeciesId | "ALL")}
      >
        <option value="ALL">Toutes les espèces</option>
        {enabledSpecies.map((id) => (
          <option key={id} value={id}>
            {getSpeciesDefinition(id).label.plural}
          </option>
        ))}
      </select>
    </Field>
  );
}

interface SpeciesDetailsFieldsProps {
  speciesId: SpeciesId;
  value: SpeciesData;
  onChange: (value: SpeciesData) => void;
  disabled?: boolean;
  catalog?: AppearanceCatalog;
  animals?: readonly Animal[];
}

/** Renders optional profile details using the registered species descriptors. */
export function SpeciesDetailsFields({
  speciesId,
  value,
  onChange,
  disabled = false,
  catalog,
  animals = [],
}: SpeciesDetailsFieldsProps): ReactNode {
  const species = getSpeciesDefinition(speciesId);
  const values = value as Record<string, unknown>;

  const defaults = defaultAppearanceCatalogs[speciesId];
  const stored = animals
    .filter((animal) => animal.speciesId === speciesId)
    .map((animal) => appearanceValues(animal.speciesData));
  const breeds = mergeSuggestions(
    defaults?.breeds ?? [],
    catalog?.breeds ?? [],
    ...stored.map((entry) => entry.breeds),
  );
  const colors = mergeSuggestions(
    defaults?.colors ?? [],
    catalog?.colors ?? [],
    ...stored.map((entry) => entry.colors),
  );

  function updateField(key: string, fieldValue: string | number | boolean | undefined): void {
    const nextValue = { ...values, [key]: fieldValue } as SpeciesDataById[typeof speciesId];
    onChange(nextValue);
  }

  return (
    <FieldGroup
      className="species-details"
      data-species-id={speciesId}
      label={`Détails · ${species.label.singular}`}
      wide
    >
      <div className="form-grid">
        {species.fields.map((field) => {
          if (field.key === "breed" || field.key === "taxon") {
            return (
              <MixedAppearance
                key={field.key}
                label={field.label}
                primaryKey={field.key}
                secondaryKey="secondaryBreed"
                mixedKey="mixedBreed"
                mixedLabel={field.key === "taxon" ? "Hybride" : "Croisé"}
                values={values}
                options={breeds}
                disabled={disabled}
                update={updateField}
              />
            );
          }
          const fieldId = `${speciesId}-${field.key}`;
          const currentValue = values[field.key];
          return (
            <Field
              className="species-detail-field"
              htmlFor={fieldId}
              key={field.key}
              label={`${field.label}${field.unit ? ` (${field.unit})` : ""}`}
            >
              {field.kind === "select" ? (
                <select
                  id={fieldId}
                  name={`speciesData.${field.key}`}
                  value={typeof currentValue === "string" ? currentValue : ""}
                  disabled={disabled}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    updateField(field.key, event.currentTarget.value || undefined)
                  }
                >
                  <option value="">Non précisé</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={fieldId}
                  name={`speciesData.${field.key}`}
                  type={field.kind}
                  value={
                    typeof currentValue === "string" || typeof currentValue === "number"
                      ? currentValue
                      : ""
                  }
                  min={field.kind === "number" ? 0.1 : undefined}
                  step={field.kind === "number" ? "any" : undefined}
                  disabled={disabled}
                  onChange={(event) => {
                    const rawValue = event.currentTarget.value;
                    updateField(
                      field.key,
                      field.kind === "number"
                        ? rawValue === ""
                          ? undefined
                          : Number(rawValue)
                        : rawValue,
                    );
                  }}
                />
              )}
            </Field>
          );
        })}
        <MixedAppearance
          label={speciesId === "snake" ? "Couleur / motif des écailles" : "Couleur du pelage"}
          primaryKey="coatColor"
          secondaryKey="secondaryCoatColor"
          mixedKey="mixedCoatColor"
          mixedLabel="Deux couleurs / motifs"
          values={values}
          options={colors}
          disabled={disabled}
          update={updateField}
        />
        <Field label="Poids (kg)">
          <input
            name="speciesData.weightKg"
            type="number"
            min="0.001"
            step="any"
            value={value.weightKg ?? ""}
            disabled={disabled}
            onChange={(event) =>
              updateField(
                "weightKg",
                event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value),
              )
            }
          />
        </Field>
        <Field label="Besoins particuliers" wide>
          <textarea
            name="speciesData.specialNeeds"
            rows={3}
            value={value.specialNeeds ?? ""}
            disabled={disabled}
            placeholder="Précisez les besoins de cet animal, s'il y en a."
            onChange={(event) =>
              updateField("specialNeeds", event.currentTarget.value || undefined)
            }
          />
        </Field>
      </div>
    </FieldGroup>
  );
}

function MixedAppearance({
  label,
  primaryKey,
  secondaryKey,
  mixedKey,
  mixedLabel,
  values,
  options,
  update,
  disabled,
}: {
  label: string;
  primaryKey: string;
  secondaryKey: string;
  mixedKey: string;
  mixedLabel: string;
  values: Record<string, unknown>;
  options: string[];
  disabled: boolean;
  update: (key: string, value: string | boolean | undefined) => void;
}) {
  const mixed = values[mixedKey] === true;
  return (
    <div className="appearance-fields">
      <div className="inline-fields">
        <Field label={label}>
          <SearchSelect
            name={`speciesData.${primaryKey}`}
            value={typeof values[primaryKey] === "string" ? (values[primaryKey] as string) : ""}
            options={options}
            disabled={disabled}
            onChange={(value) => update(primaryKey, value || undefined)}
          />
        </Field>
        {mixed && (
          <Field label={`Autre ${label.toLocaleLowerCase("fr-FR")}`}>
            <SearchSelect
              name={`speciesData.${secondaryKey}`}
              value={
                typeof values[secondaryKey] === "string" ? (values[secondaryKey] as string) : ""
              }
              options={options}
              disabled={disabled}
              onChange={(value) => update(secondaryKey, value || undefined)}
            />
          </Field>
        )}
      </div>
      <Checkbox
        name={`speciesData.${mixedKey}`}
        checked={mixed}
        disabled={disabled}
        onChange={(event) => update(mixedKey, event.currentTarget.checked)}
      >
        {mixedLabel}
      </Checkbox>
    </div>
  );
}

export function AdoptabilityFields({
  value,
  onChange,
  reasonName = "adoptionBlockedReason",
  reason = "",
}: {
  value: AdoptionEligibility;
  onChange: (value: AdoptionEligibility) => void;
  reasonName?: string;
  reason?: string;
}) {
  return (
    <>
      <Field label="Adoptable">
        <select
          aria-label="Adoptable"
          value={value === "ON_HOLD" ? "UNKNOWN" : value}
          onChange={(event) => onChange(event.currentTarget.value as AdoptionEligibility)}
        >
          <option value="UNKNOWN">Inconnu</option>
          <option value="ELIGIBLE">Oui</option>
          <option value="INELIGIBLE">Non</option>
        </select>
      </Field>
      {value === "INELIGIBLE" && (
        <Field label="Motif de non-adoptabilité *" wide>
          <textarea name={reasonName} rows={3} defaultValue={reason} required />
        </Field>
      )}
    </>
  );
}

interface SpeciesLabelProps {
  speciesId: SpeciesId;
  form?: "singular" | "plural" | "definiteSingular";
}

export function SpeciesLabel({ speciesId, form = "singular" }: SpeciesLabelProps): string {
  return getSpeciesDefinition(speciesId).label[form];
}

export function SpeciesChip({ speciesId }: { speciesId: SpeciesId }): ReactNode {
  const species = getSpeciesDefinition(speciesId);
  return (
    <span
      className="species-chip"
      data-species-id={speciesId}
      role="img"
      title={species.label.singular}
      aria-label={species.label.singular}
      tabIndex={0}
    >
      {{ cat: "🐱", dog: "🐶", rabbit: "🐰", snake: "🐍" }[speciesId] ?? "🐾"}
    </span>
  );
}

export function SpeciesTableHeader({ enabledSpecies }: { enabledSpecies: readonly SpeciesId[] }) {
  return enabledSpecies.length > 1 ? (
    <th className="species-column" scope="col">
      Espèce
    </th>
  ) : null;
}

export function SpeciesTableCell({
  enabledSpecies,
  speciesId,
}: {
  enabledSpecies: readonly SpeciesId[];
  speciesId?: SpeciesId;
}) {
  return enabledSpecies.length > 1 ? (
    <td className="species-column">{speciesId ? <SpeciesChip speciesId={speciesId} /> : "—"}</td>
  ) : null;
}
