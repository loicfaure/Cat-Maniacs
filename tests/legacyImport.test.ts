import { describe, expect, it } from "vitest";
import { createEmptyDataset } from "../src/domain/dataset";
import { stringifyCsv } from "../src/infrastructure/csv";
import { commitLegacyPreview, previewLegacyCsv } from "../src/legacy/legacyImport";

const headers = [
  "Date adoption", "Magasin", "Civilité", "NOM", "Prénom", "Recipient", "Téléphone", "Nom chat",
  "Numéro identification", "Date de naissance", "Adulte / Chaton", "Sexe", "Sté_Fait", "Véto pour sté ?",
  "Presta restant à faire le jour de la JA", "Dossier IE complet ?", "year", "Date dossier IE complet",
  "Chgt IE Fait", "Sapca / Retour / Perdu / dcd", "Date", "Commentaires", "Date relance nouvelles",
  "Réponse relance ?", "Dernières nlles reçues"
];

function syntheticLegacyCsv(): string {
  const rows = Array.from({ length: 38 }, (_, index) => ({
    "Date adoption": "01/06/2024",
    Magasin: "Partenaire fictif",
    Civilité: "",
    NOM: `Adoptant ${index + 1}`,
    "Prénom": "Exemple",
    Recipient: "adresse-invalide",
    "Téléphone": "0000000000",
    "Nom chat": index < 3 ? "" : `Chat ${index + 1}`,
    "Numéro identification": `identifiant-invalide-${index + 1}`,
    "Date de naissance": "01/01/2023",
    "Adulte / Chaton": "Adulte",
    Sexe: index % 2 === 0 ? "F" : "M",
    "Sté_Fait": index % 2 === 0 ? "x" : "non",
    "Véto pour sté ?": "",
    "Presta restant à faire le jour de la JA": "Stérilisation",
    "Dossier IE complet ?": "",
    year: "2024",
    "Date dossier IE complet": "",
    "Chgt IE Fait": "",
    "Sapca / Retour / Perdu / dcd": "",
    Date: "",
    Commentaires: "Donnée de test entièrement fictive.",
    "Date relance nouvelles": "",
    "Réponse relance ?": "",
    "Dernières nlles reçues": ""
  }));
  return stringifyCsv(headers, rows);
}

describe("legacy adoption import", () => {
  it("parses a synthetic 25-column fixture and surfaces its problems", () => {
    const preview = previewLegacyCsv(syntheticLegacyCsv(), "synthetic-test-fixture.csv");
    expect(preview.headers).toHaveLength(25);
    expect(preview.rows).toHaveLength(38);
    expect(preview.rows.filter((row) => row.importable)).toHaveLength(35);
    expect(preview.warningCount).toBeGreaterThan(50);
    expect(preview.rows[0].issues.some((issue) => issue.field === "catName")).toBe(true);
    expect(preview.rows.some((row) => row.issues.some((issue) => issue.message.includes("Adresse e-mail")))).toBe(true);
    expect(preview.rows.some((row) => row.issues.some((issue) => issue.message.includes("Stérilisation indiquée")))).toBe(true);
  });

  it("imports rows without accepting invalid legacy identifiers", () => {
    const preview = previewLegacyCsv(syntheticLegacyCsv(), "synthetic-test-fixture.csv");
    const dataset = createEmptyDataset();
    const result = commitLegacyPreview(dataset, preview);
    expect(result.importedCats).toBe(35);
    expect(result.skippedRows).toBe(3);
    expect(dataset.cats).toHaveLength(35);
    expect(dataset.cats.every((cat) => cat.identificationNumber === "")).toBe(true);
    expect(new Set(dataset.cats.map((cat) => cat.id)).size).toBe(35);
    expect(dataset.cats.some((cat) => cat.sterilizationStatus === "DONE")).toBe(true);
    expect(dataset.cats.some((cat) => cat.sterilizationStatus === "TODO")).toBe(true);
  });
});
