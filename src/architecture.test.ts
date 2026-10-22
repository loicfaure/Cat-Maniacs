import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = import.meta.dirname;
const layers = new Map([
  ["core", new Set(["core"])],
  ["domain", new Set(["core", "domain"])],
  ["application", new Set(["core", "domain", "application"])],
  ["legacy", new Set(["core", "domain", "application", "legacy"])],
  ["demo", new Set(["core", "domain", "application", "demo"])],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [path]
        : [];
  });
}

describe("layer boundaries", () => {
  it("keeps core, domain, and application free of desktop and storage adapters", () => {
    for (const [layer, allowedRoots] of layers) {
      for (const file of sourceFiles(resolve(sourceRoot, layer))) {
        const source = readFileSync(file, "utf8");
        const imports = source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g);
        for (const [, specifier] of imports) {
          expect(specifier, `${relative(sourceRoot, file)} imports ${specifier}`).toMatch(/^\./);
          const target = resolve(dirname(file), specifier);
          const targetRelative = relative(sourceRoot, target);
          const root = targetRelative.split(sep)[0];
          expect(allowedRoots.has(root), `${relative(sourceRoot, file)} imports ${specifier}`).toBe(
            true,
          );
        }
      }
    }
  });
});
