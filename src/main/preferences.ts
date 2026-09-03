import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AppPreferences {
  demoMode: boolean;
  demoWelcomeSeen: boolean;
  realDatasetDirectory: string;
}

export function defaultAppPreferences(realDatasetDirectory: string): AppPreferences {
  return {
    demoMode: true,
    demoWelcomeSeen: false,
    realDatasetDirectory
  };
}

export async function loadAppPreferences(path: string, defaultRealDatasetDirectory: string): Promise<AppPreferences> {
  const defaults = defaultAppPreferences(defaultRealDatasetDirectory);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<AppPreferences>;
    return {
      demoMode: typeof parsed.demoMode === "boolean" ? parsed.demoMode : defaults.demoMode,
      demoWelcomeSeen: typeof parsed.demoWelcomeSeen === "boolean" ? parsed.demoWelcomeSeen : defaults.demoWelcomeSeen,
      realDatasetDirectory: typeof parsed.realDatasetDirectory === "string" && parsed.realDatasetDirectory.trim()
        ? parsed.realDatasetDirectory
        : defaults.realDatasetDirectory
    };
  } catch {
    return defaults;
  }
}

export async function saveAppPreferences(path: string, preferences: AppPreferences): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
