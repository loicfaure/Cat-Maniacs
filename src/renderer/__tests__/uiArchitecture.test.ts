import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../..");
const rendererRoot = resolve(sourceRoot, "renderer");

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("shared renderer style architecture", () => {
  it("keeps one stylesheet, imported only by the renderer entry point", () => {
    const sourceFiles = files(sourceRoot);
    expect(sourceFiles.filter((file) => /\.(css|scss|sass|less)$/.test(file))).toEqual([
      resolve(rendererRoot, "styles.css"),
    ]);
    const importers = sourceFiles.filter((file) => {
      if (!/\.[jt]sx?$/.test(file) || file.endsWith(".test.ts")) {
        return false;
      }
      return /(?:import|from)\s*["'][^"']+\.(?:css|scss|sass|less)["']/.test(
        readFileSync(file, "utf8"),
      );
    });
    expect(importers).toEqual([resolve(rendererRoot, "main.tsx")]);
  });

  it("keeps presentation in CSS and allows dynamic values only through custom properties", () => {
    for (const file of files(rendererRoot).filter((path) => /\.(tsx|html)$/.test(path))) {
      const source = readFileSync(file, "utf8");
      const name = relative(rendererRoot, file);
      expect(source, name).not.toMatch(/<style(?:\s|>)/i);
      const inlineStyles = [
        ...source.matchAll(/\bstyle=\{([\s\S]*?)\}\s*(?:as CSSProperties)?\s*\}/g),
      ];
      expect(inlineStyles.length, name).toBe((source.match(/\bstyle=/g) ?? []).length);
      for (const [, body] of inlineStyles) {
        const properties = [...body.matchAll(/(?:^|[{\n,])\s*(?:["']([^"']+)["']|(\w+))\s*:/g)];
        expect(properties.length, name).toBeGreaterThan(0);
        for (const [, quoted, unquoted] of properties) {
          expect(quoted ?? unquoted, name).toMatch(/^--/);
        }
      }
    }
  });

  it("parses the shared stylesheet and has no duplicate selectors in the same scope", () => {
    const css = readFileSync(resolve(rendererRoot, "styles.css"), "utf8");
    const dom = new JSDOM(`<style>${css}</style>`);
    try {
      const sheet = dom.window.document.styleSheets[0];
      expect(sheet?.cssRules.length).toBeGreaterThan(0);
      function inspect(rules: CSSRuleList) {
        const selectors = new Set<string>();
        for (const rule of rules) {
          if ("selectorText" in rule) {
            const selector = String(rule.selectorText);
            expect(selectors.has(selector), selector).toBe(false);
            selectors.add(selector);
          }
          if ("cssRules" in rule) {
            inspect((rule as CSSGroupingRule).cssRules);
          }
        }
      }
      inspect(sheet.cssRules);
      const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
      for (const [, property, fallback] of css.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
        expect(defined.has(property) || Boolean(fallback), property).toBe(true);
      }
    } finally {
      dom.window.close();
    }
  });

  it("sizes checkboxes and radios consistently without page-specific classes", () => {
    const css = readFileSync(resolve(rendererRoot, "styles.css"), "utf8");
    const dom = new JSDOM(
      `<style>${css}</style><input type="checkbox"><input type="radio">
       <div class="zone-setting-row"><label class="checkbox"><input type="checkbox"></label></div>`,
    );
    try {
      for (const input of dom.window.document.querySelectorAll("input")) {
        const style = dom.window.getComputedStyle(input);
        expect(style.width).toBe("18px");
        expect(style.height).toBe("18px");
      }
    } finally {
      dom.window.close();
    }
  });
});
