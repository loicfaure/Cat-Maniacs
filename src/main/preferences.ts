import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SpeciesId } from "../core/types";
import { isSpeciesId } from "../domain/species/registry";
import type { EmailTemplates, GeneratedEmail } from "../shared/types";

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  leadDays: 14,
  sterilisation: {
    subject: "Rappel de stérilisation — {animal}",
    body: "Bonjour {contact},\n\nLa stérilisation de {animal} est prévue le {date}. Merci de nous tenir informés du rendez-vous.\n\nL’association Cha’Mania",
  },
  vaccination: {
    subject: "Rappel de vaccination — {animal}",
    body: "Bonjour {contact},\n\nLa vaccination de {animal} est à prévoir le {date}. Merci de nous confirmer lorsque le soin aura été effectué.\n\nL’association Cha’Mania",
  },
  antiFlea: {
    subject: "Rappel antipuce — {animal}",
    body: "Bonjour {contact},\n\nLe traitement antipuce de {animal} est à prévoir le {date}.\n\nL’association Cha’Mania",
  },
  deworming: {
    subject: "Rappel vermifuge — {animal}",
    body: "Bonjour {contact},\n\nLe vermifuge de {animal} est à prévoir le {date}.\n\nL’association Cha’Mania",
  },
  icad: {
    subject: "Changement de détenteur ICAD — {animal}",
    body: "Bonjour {contact},\n\nSix mois se sont écoulés depuis l’adoption de {animal}. Sa stérilisation étant effectuée, vous pouvez demander le changement de détenteur auprès de l’ICAD afin que l’animal soit enregistré à votre nom.\n\nL’association Cha’Mania",
  },
};

export interface AppPreferences {
  demoMode: boolean;
  demoWelcomeSeen: boolean;
  realDatasetDirectory: string;
  demoEnabledSpecies: SpeciesId[];
  emailTemplates: EmailTemplates;
  generatedEmailsByDataset: Record<string, GeneratedEmail[]>;
  emailOutputDirectory: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultAppPreferences(realDatasetDirectory: string): AppPreferences {
  return {
    demoMode: true,
    demoWelcomeSeen: false,
    realDatasetDirectory,
    demoEnabledSpecies: ["cat"],
    emailTemplates: structuredClone(DEFAULT_EMAIL_TEMPLATES),
    generatedEmailsByDataset: {},
    emailOutputDirectory: "",
  };
}

export async function loadAppPreferences(
  path: string,
  defaultRealDatasetDirectory: string,
): Promise<AppPreferences> {
  const defaults = defaultAppPreferences(defaultRealDatasetDirectory);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(parsed)) {
      return defaults;
    }
    return {
      demoMode: typeof parsed.demoMode === "boolean" ? parsed.demoMode : defaults.demoMode,
      demoWelcomeSeen:
        typeof parsed.demoWelcomeSeen === "boolean"
          ? parsed.demoWelcomeSeen
          : defaults.demoWelcomeSeen,
      realDatasetDirectory:
        typeof parsed.realDatasetDirectory === "string" && parsed.realDatasetDirectory.trim()
          ? parsed.realDatasetDirectory
          : defaults.realDatasetDirectory,
      demoEnabledSpecies:
        Array.isArray(parsed.demoEnabledSpecies) &&
        parsed.demoEnabledSpecies.length > 0 &&
        parsed.demoEnabledSpecies.every(isSpeciesId)
          ? [...new Set(parsed.demoEnabledSpecies)]
          : defaults.demoEnabledSpecies,
      emailTemplates: parseEmailTemplates(parsed.emailTemplates),
      generatedEmailsByDataset: isRecord(parsed.generatedEmailsByDataset)
        ? (Object.fromEntries(
            Object.entries(parsed.generatedEmailsByDataset).filter(([, value]) =>
              Array.isArray(value),
            ),
          ) as Record<string, GeneratedEmail[]>)
        : {},
      emailOutputDirectory:
        typeof parsed.emailOutputDirectory === "string" ? parsed.emailOutputDirectory : "",
    };
  } catch {
    return defaults;
  }
}

function parseEmailTemplates(raw: unknown): EmailTemplates {
  if (!isRecord(raw)) {
    return structuredClone(DEFAULT_EMAIL_TEMPLATES);
  }
  const result = structuredClone(DEFAULT_EMAIL_TEMPLATES);
  for (const key of ["sterilisation", "vaccination", "antiFlea", "deworming", "icad"] as const) {
    const template = raw[key];
    if (isRecord(template)) {
      if (typeof template.subject === "string") {
        result[key].subject = template.subject;
      }
      if (typeof template.body === "string") {
        result[key].body = template.body;
      }
    }
  }
  if (typeof raw.leadDays === "number" && Number.isInteger(raw.leadDays)) {
    result.leadDays = Math.min(90, Math.max(0, raw.leadDays));
  }
  return result;
}

export async function saveAppPreferences(path: string, preferences: AppPreferences): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
