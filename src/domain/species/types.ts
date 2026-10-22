import type {
  AnimalProfile,
  IdentificationScheme,
  SpeciesDataById,
  SpeciesId,
} from "../../core/types";

export type { SpeciesDataById, SpeciesId } from "../../core/types";
export type SpeciesProfileId = AnimalProfile;
export type IdentificationSchemeId = IdentificationScheme;
export type CareCategoryId = "VERMIFUGE" | "ANTI_PUCE" | "VACCIN" | "STERILISATION";

export interface SpeciesProfile {
  id: SpeciesProfileId;
  label: string;
}

export interface SpeciesFieldDescriptor {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: ReadonlyArray<{ value: string; label: string }>;
  unit?: string;
}

export interface SpeciesDemoData<Id extends SpeciesId = SpeciesId> {
  birthDate: string;
  speciesData: SpeciesDataById[Id];
}

export interface SpeciesDefinition<Id extends SpeciesId = SpeciesId> {
  id: Id;
  label: { singular: string; plural: string; definiteSingular: string };
  iconKey: string;
  profiles: ReadonlyArray<SpeciesProfile>;
  defaultProfile: SpeciesProfileId;
  deriveProfile?: (birthDate: string, referenceDate: Date) => SpeciesProfileId | undefined;
  validateSpeciesData: (value: unknown) => value is SpeciesDataById[Id];
  identificationSchemes: ReadonlyArray<{ id: IdentificationSchemeId; label: string }>;
  careCategories: ReadonlyArray<CareCategoryId>;
  fields: ReadonlyArray<SpeciesFieldDescriptor>;
  createDemoData: (
    referenceDate: Date,
    index: number,
    profile?: SpeciesProfileId,
  ) => SpeciesDemoData<Id>;
}
