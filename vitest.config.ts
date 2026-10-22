import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/core/**/*.ts",
        "src/domain/**/*.ts",
        "src/application/**/*.ts",
        "src/legacy/**/*.ts",
        "src/infrastructure/**/*.ts"
      ],
      exclude: ["src/application/ports/**/*.ts", "**/*.test.ts"],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 80,
        lines: 75,
        "src/core/**/*.ts": { statements: 85, branches: 80, functions: 100, lines: 85 },
        "src/domain/**/*.ts": { statements: 80, branches: 65, functions: 95, lines: 80 },
        "src/application/**/*.ts": { statements: 75, branches: 65, functions: 80, lines: 75 },
        "src/infrastructure/**/*.ts": { statements: 55, branches: 50, functions: 55, lines: 55 },
        "src/legacy/**/*.ts": { statements: 85, branches: 65, functions: 95, lines: 85 }
      }
    }
  }
});
