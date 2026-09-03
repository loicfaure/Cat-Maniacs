import { CatService } from "../application/catService";
import { isValidIcad, normalizeIdentification } from "../domain/dataset";
import type {
  Dataset,
  ImportCommitResult,
  ImportIssue,
  LegacyImportPreview,
  LegacyImportRow,
  Sex
} from "../shared/types";
import { parseCsv } from "../infrastructure/csv";

interface LegacyField {
  key: string;
  aliases: string[];
}

const FIELDS: LegacyField[] = [
  { key: "adoptionDate", aliases: ["Date_adoption", "Date adoption"] },
  { key: "store", aliases: ["Magasin"] },
  { key: "courtesyTitle", aliases: ["M_Me", "M Me", "Civilité"] },
  { key: "lastName", aliases: ["NOM", "Nom"] },
  { key: "firstName", aliases: ["Prénom", "Prenom", "Prenom adoptant"] },
  { key: "recipientEmail", aliases: ["Recipient", "Email", "Destinataire"] },
  { key: "phone", aliases: ["Téléphone", "Telephone"] },
  { key: "catName", aliases: ["Nom chat"] },
  { key: "identificationNumber", aliases: ["Numéro identification", "Numero identification", "Numéro d'identification"] },
  { key: "birthDate", aliases: ["Date de naissance", "Date naissance"] },
  { key: "ageGroup", aliases: ["Adulte / Chaton", "Adulte ou Chaton"] },
  { key: "sex", aliases: ["Sexe"] },
  { key: "sterilized", aliases: ["Sté_Fait", "Ste_Fait", "Stérilisation faite"] },
  { key: "sterilizationVet", aliases: ["Véto pour sté ?", "Veto pour ste ?"] },
  { key: "remainingService", aliases: ["Presta restant à faire le jour de la JA", "Presta restante"] },
  { key: "ieDossierComplete", aliases: ["Dossier IE complet ?", "Dossier IE complet"] },
  { key: "year", aliases: ["year", "Année"] },
  { key: "ieDossierDate", aliases: ["Date dossier IE complet"] },
  { key: "ieChangeDone", aliases: ["Chgt IE Fait", "Changement IE fait"] },
  { key: "lifeStatus", aliases: ["Sapca / Retour / Perdu / dcd", "Statut : Sapca / Retour / Perdu / décédé"] },
  { key: "lifeStatusDate", aliases: ["Date", "Date statut"] },
  { key: "comments", aliases: ["Commentaires"] },
  { key: "followUpDate", aliases: ["Date relance nouvelles"] },
  { key: "followUpResponse", aliases: ["Réponse relance ?", "Réponse relance"] },
  { key: "lastNewsReceived", aliases: ["Dernières nlles reçues", "Dernières nouvelles"] }
];

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function previewLegacyCsv(source: string, sourcePath: string): LegacyImportPreview {
  const parsed = parseCsv(source);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join(" "));
  const [rawHeaders, ...rawRows] = parsed.rows;
  if (!rawHeaders) throw new Error("Le fichier CSV est vide.");
  const headers = rawHeaders.map((header) => header.replace(/\s+/g, " ").trim());
  const normalizedIndex = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const indexes = Object.fromEntries(
    FIELDS.map((field) => [
      field.key,
      field.aliases.map((alias) => normalizedIndex.get(normalizeHeader(alias))).find((index) => index !== undefined)
    ])
  ) as Record<string, number | undefined>;

  const rows = rawRows
    .map((row, sourceIndex) => buildRow(row, sourceIndex + 2, indexes))
    .filter((row) => Object.values(row.values).some(Boolean));
  addDuplicateIdentificationIssues(rows);
  const issues = rows.flatMap((row) => row.issues);
  return {
    sourcePath,
    headers,
    rows,
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length
  };
}

function buildRow(row: string[], rowNumber: number, indexes: Record<string, number | undefined>): LegacyImportRow {
  const values = Object.fromEntries(
    FIELDS.map((field) => [field.key, normalizeCell(indexes[field.key] === undefined ? "" : row[indexes[field.key]!])])
  );
  const issues: ImportIssue[] = [];
  const issue = (field: string, severity: "error" | "warning", message: string) =>
    issues.push({ rowNumber, field, severity, message });

  if (!values.catName) issue("catName", "error", "Nom du chat manquant : la ligne ne peut pas être importée.");
  if (!values.firstName && !values.lastName) issue("family", "warning", "Contact adoptant manquant; le chat sera importé sans adoption.");
  if (!values.adoptionDate) issue("adoptionDate", "warning", "Date d'adoption manquante.");
  if (values.adoptionDate && !parseFrenchDate(values.adoptionDate)) issue("adoptionDate", "error", "Date d'adoption invalide.");
  if (values.birthDate && !parseFrenchDate(values.birthDate)) issue("birthDate", "error", "Date de naissance invalide.");
  if (values.lifeStatusDate && !parseFrenchDate(values.lifeStatusDate)) issue("lifeStatusDate", "error", "Date de statut invalide.");
  if (values.recipientEmail && !values.recipientEmail.split(/[;,]/).every((email) => EMAIL_PATTERN.test(email.trim()))) {
    issue("recipientEmail", "warning", "Adresse e-mail invalide.");
  }
  if (values.identificationNumber && !isValidIcad(values.identificationNumber)) {
    issue("identificationNumber", "warning", "Numéro ICAD invalide; il sera conservé dans les notes, pas comme identifiant canonique.");
  }
  if (/^(x|ok)$/i.test(values.sterilized) && /st[ée]ril/i.test(values.remainingService)) {
    issue("sterilized", "warning", "Stérilisation indiquée comme faite et encore à réaliser.");
  }
  if (values.birthDate && values.adoptionDate && values.ageGroup) {
    const birth = parseFrenchDate(values.birthDate);
    const adoption = parseFrenchDate(values.adoptionDate);
    if (birth && adoption) {
      const oneYearLater = new Date(Date.UTC(birth.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate()));
      if (values.ageGroup.toLowerCase() === "chaton" && adoption >= oneYearLater) {
        issue("ageGroup", "warning", "Catégorie Chaton incohérente avec un âge d'au moins un an.");
      }
    }
  }
  return { sourceRowNumber: rowNumber, values, issues, importable: Boolean(values.catName) };
}

function addDuplicateIdentificationIssues(rows: LegacyImportRow[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const number = normalizeIdentification(row.values.identificationNumber);
    if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
  }
  for (const row of rows) {
    const number = normalizeIdentification(row.values.identificationNumber);
    if (number && (counts.get(number) ?? 0) > 1) {
      row.issues.push({
        rowNumber: row.sourceRowNumber,
        field: "identificationNumber",
        severity: "warning",
        message: `Numéro présent sur ${counts.get(number)} lignes; il ne sera pas utilisé comme identifiant canonique.`
      });
    }
  }
}

export function commitLegacyPreview(dataset: Dataset, preview: LegacyImportPreview): ImportCommitResult {
  const service = new CatService(dataset);
  const importableRows = preview.rows.filter((row) => row.importable);
  const idCounts = new Map<string, number>();
  for (const row of importableRows) {
    const number = normalizeIdentification(row.values.identificationNumber);
    if (number) idCounts.set(number, (idCounts.get(number) ?? 0) + 1);
  }
  let importedCats = 0;
  let importedFamilies = 0;
  let importedAdoptions = 0;

  for (const row of importableRows) {
    const values = row.values;
    const legacyId = normalizeIdentification(values.identificationNumber);
    const canonicalId = legacyId && isValidIcad(legacyId) && idCounts.get(legacyId) === 1 ? legacyId : "";
    const legacyNote = legacyId && !canonicalId ? `Numéro historique à vérifier : ${legacyId}. ` : "";
    const beforeCatIds = new Set(dataset.cats.map((cat) => cat.id));
    service.createCat({
      name: values.catName,
      identificationNumber: canonicalId,
      birthDate: toIsoDate(values.birthDate),
      sex: normalizeSex(values.sex),
      profile: normalizeHeader(values.ageGroup) === "chaton" ? "KITTEN" : "ADULT",
      sterilizationStatus: normalizeSterilization(values.sterilized, values.remainingService),
      intakeDate: toIsoDate(values.adoptionDate) || new Date().toISOString().slice(0, 10),
      notes: `${legacyNote}Importé de ${preview.sourcePath}, ligne ${row.sourceRowNumber}. ${values.comments}`.trim()
    });
    const cat = dataset.cats.find((candidate) => !beforeCatIds.has(candidate.id))!;
    importedCats += 1;

    let adopterId = "";
    if (values.firstName || values.lastName) {
      const existing = values.recipientEmail
        ? dataset.adopters.find((adopter) => adopter.email.toLowerCase() === values.recipientEmail.toLowerCase())
        : undefined;
      if (existing) {
        adopterId = existing.id;
      } else {
        const beforeAdopterIds = new Set(dataset.adopters.map((adopter) => adopter.id));
        service.createAdopter({
          courtesyTitle: values.courtesyTitle,
          firstName: values.firstName,
          lastName: values.lastName,
          email: EMAIL_PATTERN.test(values.recipientEmail) ? values.recipientEmail : "",
          phone: values.phone,
          notes: `Import legacy, ligne ${row.sourceRowNumber}.`
        });
        const adopter = dataset.adopters.find((candidate) => !beforeAdopterIds.has(candidate.id))!;
        adopterId = adopter.id;
        importedFamilies += 1;
      }
    }

    const adoptionDate = toIsoDate(values.adoptionDate);
    if (adopterId && adoptionDate) {
      service.createAdoption({ catIds: [cat.id], adopterId, adoptionDate, partner: values.store, notes: values.comments });
      importedAdoptions += 1;
    }
    if (values.remainingService && values.remainingService.toLowerCase() !== "ok") {
      const timestamp = new Date().toISOString();
      dataset.tasks.push({
        id: crypto.randomUUID(), catId: cat.id, type: values.remainingService, status: "OPEN", dueDate: "",
        completedAt: "", notes: `Import legacy, ligne ${row.sourceRowNumber}.`, createdAt: timestamp, updatedAt: timestamp
      });
    }
    if (values.followUpDate || values.followUpResponse || values.lastNewsReceived) {
      const timestamp = new Date().toISOString();
      const adoption = dataset.adoptions.find((candidate) => candidate.catId === cat.id);
      dataset.followUps.push({
        id: crypto.randomUUID(), catId: cat.id, adoptionId: adoption?.id ?? "",
        requestedAt: toIsoDate(values.followUpDate), response: values.followUpResponse,
        lastNewsAt: toIsoDate(values.lastNewsReceived), createdAt: timestamp, updatedAt: timestamp
      });
    }
  }

  dataset.updatedAt = new Date().toISOString();
  return { importedCats, importedFamilies, importedAdoptions, skippedRows: preview.rows.length - importableRows.length };
}

export function parseFrenchDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

export function toIsoDate(value: string): string {
  const date = parseFrenchDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function normalizeSex(value: string): Sex {
  const normalized = value.trim().toUpperCase();
  return normalized === "F" || normalized === "M" ? normalized : "UNKNOWN";
}

function normalizeSterilization(value: string, remainingService: string): "DONE" | "TODO" | "UNKNOWN" {
  const normalized = normalizeHeader(value);
  if (["x", "ok", "oui"].includes(normalized)) return "DONE";
  if (["non", "n/a"].includes(normalized) || /steril/.test(normalizeHeader(remainingService))) return "TODO";
  return "UNKNOWN";
}

function normalizeHeader(value: string): string {
  return normalizeCell(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}
