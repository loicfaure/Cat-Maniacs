import { profileForBirthDate } from "../catAge";
import type {
  SpeciesDataById,
  SpeciesDefinition,
  SpeciesId,
  SpeciesProfile,
  SpeciesProfileId,
} from "./types";

const catProfiles: SpeciesProfile[] = [
  { id: "BOTTLE_KITTEN", label: "Chaton au biberon" },
  { id: "KITTEN", label: "Chaton" },
  { id: "ADULT", label: "Adulte" },
  { id: "SENIOR", label: "Senior" },
  { id: "SPECIAL_NEEDS", label: "Besoins particuliers" },
];

const dogProfiles: SpeciesProfile[] = [
  { id: "PUPPY", label: "Chiot" },
  { id: "ADULT", label: "Adulte" },
  { id: "SENIOR", label: "Senior" },
  { id: "SPECIAL_NEEDS", label: "Besoins particuliers" },
];

const rabbitProfiles: SpeciesProfile[] = [
  { id: "YOUNG", label: "Jeune lapin" },
  { id: "ADULT", label: "Adulte" },
  { id: "SENIOR", label: "Senior" },
  { id: "SPECIAL_NEEDS", label: "Besoins particuliers" },
];

const snakeProfiles: SpeciesProfile[] = [
  { id: "JUVENILE", label: "Juvénile" },
  { id: "ADULT", label: "Adulte" },
  { id: "SPECIAL_NEEDS", label: "Besoins particuliers" },
  { id: "UNKNOWN", label: "Stade inconnu" },
];

const standardCare = ["VERMIFUGE", "ANTI_PUCE", "VACCIN", "STERILISATION"] as const;
const commonSchemes = [
  { id: "ICAD", label: "ICAD" },
  { id: "OTHER", label: "Autre identifiant" },
] as const;
const nonIcadSchemes = [{ id: "OTHER", label: "Autre identifiant" }] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const sharedKeys = [
    "specialNeeds",
    "weightKg",
    "mixedBreed",
    "secondaryBreed",
    "coatColor",
    "secondaryCoatColor",
    "mixedCoatColor",
  ];
  return (
    Object.keys(value).every((key) => keys.includes(key) || sharedKeys.includes(key)) &&
    ["specialNeeds", "secondaryBreed", "coatColor", "secondaryCoatColor"].every((key) =>
      optionalText(value, key),
    ) &&
    ["mixedBreed", "mixedCoatColor"].every(
      (key) => value[key] === undefined || typeof value[key] === "boolean",
    ) &&
    (value.weightKg === undefined ||
      (typeof value.weightKg === "number" && Number.isFinite(value.weightKg) && value.weightKg > 0))
  );
}

function optionalText(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === "string";
}

function isCatData(value: unknown): value is SpeciesDataById["cat"] {
  return isRecord(value) && hasOnlyKeys(value, ["breed"]) && optionalText(value, "breed");
}

function isDogData(value: unknown): value is SpeciesDataById["dog"] {
  if (!isRecord(value) || !hasOnlyKeys(value, ["breed", "size"]) || !optionalText(value, "breed")) {
    return false;
  }
  return (
    value.size === undefined ||
    value.size === "SMALL" ||
    value.size === "MEDIUM" ||
    value.size === "LARGE"
  );
}

function isRabbitData(value: unknown): value is SpeciesDataById["rabbit"] {
  return isRecord(value) && hasOnlyKeys(value, ["breed"]) && optionalText(value, "breed");
}

function isSnakeData(value: unknown): value is SpeciesDataById["snake"] {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["taxon", "lengthCm"]) ||
    !optionalText(value, "taxon")
  ) {
    return false;
  }
  return (
    value.lengthCm === undefined ||
    (typeof value.lengthCm === "number" && Number.isFinite(value.lengthCm) && value.lengthCm > 0)
  );
}

function dateDaysBefore(date: Date, days: number): string {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - days);
  return formatLocalDate(result);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function definitionDate(referenceDate: Date): Date {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
}

const definitions = [
  {
    id: "cat",
    label: { singular: "chat", plural: "Chats", definiteSingular: "le chat" },
    iconKey: "cat",
    profiles: catProfiles,
    defaultProfile: "ADULT",
    deriveProfile: profileForBirthDate,
    validateSpeciesData: isCatData,
    identificationSchemes: commonSchemes,
    careCategories: standardCare,
    fields: [{ key: "breed", label: "Race", kind: "text" }],
    createDemoData: (referenceDate: Date) => ({
      birthDate: dateDaysBefore(referenceDate, 60),
      speciesData: { breed: "Européen" },
    }),
  },
  {
    id: "dog",
    label: { singular: "chien", plural: "Chiens", definiteSingular: "le chien" },
    iconKey: "dog",
    profiles: dogProfiles,
    defaultProfile: "ADULT",
    validateSpeciesData: isDogData,
    identificationSchemes: commonSchemes,
    careCategories: standardCare,
    fields: [
      { key: "breed", label: "Race", kind: "text" },
      {
        key: "size",
        label: "Gabarit",
        kind: "select",
        options: [
          { value: "SMALL", label: "Petit" },
          { value: "MEDIUM", label: "Moyen" },
          { value: "LARGE", label: "Grand" },
        ],
      },
    ],
    createDemoData: (referenceDate: Date, index: number, profile?: SpeciesProfileId) => ({
      birthDate: dateDaysBefore(
        referenceDate,
        profile === "PUPPY"
          ? 90
          : profile === "SENIOR"
            ? 365 * 10
            : profile === "SPECIAL_NEEDS"
              ? 365 * 3
              : [90, 365 * 3, 365 * 10, 365 * 3][index % 4]!,
      ),
      speciesData: { breed: "Croisé", size: "MEDIUM" as const },
    }),
  },
  {
    id: "rabbit",
    label: { singular: "lapin", plural: "Lapins", definiteSingular: "le lapin" },
    iconKey: "rabbit",
    profiles: rabbitProfiles,
    defaultProfile: "ADULT",
    validateSpeciesData: isRabbitData,
    identificationSchemes: nonIcadSchemes,
    careCategories: standardCare,
    fields: [{ key: "breed", label: "Race", kind: "text" }],
    createDemoData: (referenceDate: Date, index: number, profile?: SpeciesProfileId) => ({
      birthDate: dateDaysBefore(
        referenceDate,
        profile === "YOUNG"
          ? 90
          : profile === "SENIOR"
            ? 365 * 8
            : profile === "SPECIAL_NEEDS"
              ? 365
              : [90, 365, 365 * 8, 365][index % 4]!,
      ),
      speciesData: { breed: "Bélier" },
    }),
  },
  {
    id: "snake",
    label: { singular: "serpent", plural: "Serpents", definiteSingular: "le serpent" },
    iconKey: "snake",
    profiles: snakeProfiles,
    defaultProfile: "UNKNOWN",
    validateSpeciesData: isSnakeData,
    identificationSchemes: nonIcadSchemes,
    careCategories: [],
    fields: [
      { key: "taxon", label: "Taxon", kind: "text" },
      { key: "lengthCm", label: "Longueur", kind: "number", unit: "cm" },
    ],
    createDemoData: (referenceDate: Date, index: number, profile?: SpeciesProfileId) => ({
      birthDate: dateDaysBefore(
        referenceDate,
        profile === "JUVENILE"
          ? 180
          : profile === "SPECIAL_NEEDS"
            ? 365 * 2
            : [180, 365 * 2, 365 * 2, 365 * 2][index % 4]!,
      ),
      speciesData: { taxon: "Python royal", lengthCm: 90 },
    }),
  },
] satisfies ReadonlyArray<SpeciesDefinition>;

export const speciesRegistry: Readonly<Record<SpeciesId, SpeciesDefinition>> = Object.freeze(
  Object.fromEntries(
    definitions.map((definition) => [definition.id, definition]),
  ) as unknown as Record<SpeciesId, SpeciesDefinition>,
);

export const registeredSpecies: ReadonlyArray<SpeciesDefinition> = Object.freeze(definitions);

export function isSpeciesId(value: unknown): value is SpeciesId {
  return typeof value === "string" && Object.hasOwn(speciesRegistry, value);
}

export function getSpeciesDefinition(value: string): SpeciesDefinition {
  if (!isSpeciesId(value)) {
    throw new Error(`Espèce non prise en charge : ${value}.`);
  }
  return speciesRegistry[value];
}

export function validateSpeciesData(speciesId: string, value: unknown): SpeciesDataById[SpeciesId] {
  const definition = getSpeciesDefinition(speciesId);
  if (!definition.validateSpeciesData(value)) {
    throw new Error(`Les détails de l'espèce « ${definition.label.singular} » sont invalides.`);
  }
  return value;
}

export function createSpeciesDemoData(
  speciesId: string,
  referenceDate: Date,
  index = 0,
  profile?: SpeciesProfileId,
) {
  const definition = getSpeciesDefinition(speciesId);
  const normalizedDate = definitionDate(referenceDate);
  return definition.createDemoData(normalizedDate, index, profile);
}
