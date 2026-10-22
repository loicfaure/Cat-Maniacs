import type {
  AdopterInput,
  AdoptionDayInput,
  AdoptionDaySuggestionGroup,
  AdoptionInput,
  AdoptionWithNewFamilyInput,
  AnimalEventType,
  AnimalHistoryInput,
  AnimalInput,
  AnimalUpdateInput,
  CareRecordInput,
  Dataset,
  FamilyInput,
  HealthAlert,
  HealthExposure,
  PlacementAssessment,
  PlacementInput,
  SpeciesId,
  SponsorshipInput,
  TaskInput,
} from "../core/types";
import {
  activeAdoption,
  activePlacement,
  activeRefugeStay,
  assertIsoDate,
  getAnimalStatus,
  normalizeIdentification,
  requireAdopter,
  requireAnimal,
  requireFamily,
} from "../domain/dataset";
import { findHealthExposures } from "../domain/healthTracing";
import { rememberAppearance } from "../domain/species/appearance";
import { getSpeciesDefinition, isSpeciesId, validateSpeciesData } from "../domain/species/registry";

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const id = () => crypto.randomUUID();
const touch = (dataset: Dataset) => {
  dataset.updatedAt = now();
};
function addEvent(
  dataset: Dataset,
  animalId: string,
  type: AnimalEventType,
  date: string,
  notes = "",
): void {
  dataset.animalEvents.push({ id: id(), animalId, type, date, notes, createdAt: now() });
}

export class AnimalService {
  constructor(private readonly dataset: Dataset) {}

  setEnabledSpecies(enabledSpecies: SpeciesId[]): Dataset {
    const unique = [...new Set(enabledSpecies)];
    if (!unique.length || unique.some((species) => !getSpeciesDefinition(species))) {
      throw new Error("Au moins une espèce prise en charge doit rester activée.");
    }
    for (const species of this.dataset.settings.enabledSpecies) {
      if (unique.includes(species)) {
        continue;
      }
      const count = this.dataset.animals.filter((animal) => animal.speciesId === species).length;
      if (count) {
        throw new Error(
          `Impossible de désactiver cette espèce : ${count} animal(aux) enregistré(s) utilisent encore cette espèce.`,
        );
      }
    }
    this.dataset.settings.enabledSpecies = unique;
    touch(this.dataset);
    return this.dataset;
  }

  createAnimal(input: AnimalInput): Dataset {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Le nom de l'animal est obligatoire.");
    }
    const enabledSpecies = this.dataset.settings.enabledSpecies;
    const speciesId =
      input.speciesId ?? (enabledSpecies.length === 1 ? enabledSpecies[0] : undefined);
    if (speciesId && !isSpeciesId(speciesId)) {
      throw new Error(`Espèce inconnue : ${String(speciesId)}.`);
    }
    if (!speciesId || !enabledSpecies.includes(speciesId)) {
      throw new Error("Choisissez une espèce activée dans les paramètres.");
    }
    const definition = getSpeciesDefinition(speciesId);
    if (input.adoptionEligibility === "INELIGIBLE" && !input.adoptionBlockedReason?.trim()) {
      throw new Error("Précisez le motif de non-adoptabilité.");
    }
    const speciesData = validateSpeciesData(speciesId, input.speciesData ?? {});
    const identificationNumber = normalizeIdentification(input.identificationNumber ?? "");
    const identificationScheme =
      input.identificationScheme ??
      (identificationNumber ? (definition.identificationSchemes[0]?.id ?? "OTHER") : "NONE");
    if (
      identificationScheme !== "NONE" &&
      !definition.identificationSchemes.some((scheme) => scheme.id === identificationScheme)
    ) {
      throw new Error(
        `Le schéma d'identification n'est pas disponible pour les ${definition.label.plural.toLocaleLowerCase("fr-FR")}.`,
      );
    }
    const compatibilityBySpecies = validateCompatibility(input.compatibilityBySpecies ?? {});
    const profile =
      input.profile ??
      definition.deriveProfile?.(input.birthDate ?? "", new Date()) ??
      definition.defaultProfile;
    if (!definition.profiles.some((candidate) => candidate.id === profile)) {
      throw new Error(
        `Le profil ${profile} n'est pas disponible pour les ${definition.label.plural.toLocaleLowerCase("fr-FR")}.`,
      );
    }
    if (
      identificationNumber &&
      this.dataset.animals.some((cat) => cat.identificationNumber === identificationNumber)
    ) {
      throw new Error("Ce numéro d'identification est déjà utilisé.");
    }
    if (input.birthDate) {
      assertIsoDate(input.birthDate, "La date de naissance");
    }
    const intakeDate = input.intakeDate || today();
    assertIsoDate(intakeDate, "La date d'arrivée");
    const timestamp = now();
    const animalId = id();
    this.dataset.animals.push({
      id: animalId,
      speciesId,
      speciesData,
      identificationScheme,
      name,
      identificationNumber,
      birthDate: input.birthDate ?? "",
      sex: input.sex ?? "UNKNOWN",
      profile,
      sterilizationStatus: input.sterilizationStatus ?? "UNKNOWN",
      adoptionEligibility: input.adoptionEligibility ?? "ELIGIBLE",
      adoptionBlockedReason: input.adoptionBlockedReason?.trim() ?? "",
      healthStatus: input.healthStatus ?? "HEALTHY",
      intakeDate,
      notes: input.notes?.trim() ?? "",
      description: input.description?.trim() ?? "",
      photo: input.photo?.trim() ?? "",
      compatibilityBySpecies,
      okWithChildren: input.okWithChildren ?? null,
      medications: input.medications?.trim() ?? "",
      medicationSchedule: input.medicationSchedule?.trim() ?? "",
      medicationEndDate: input.medicationEndDate ?? "",
      vaccines: input.vaccines?.trim() ?? "",
      deworming: input.deworming?.trim() ?? "",
      antiFlea: input.antiFlea?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    addEvent(this.dataset, animalId, "REGISTERED", intakeDate);
    rememberAppearance(this.dataset, speciesId, speciesData);
    touch(this.dataset);
    return this.dataset;
  }

  updateAnimal(input: AnimalUpdateInput): Dataset {
    const cat = requireAnimal(this.dataset, input.id);
    const previousSpeciesData = cat.speciesData;
    if (
      input.adoptionEligibility === "INELIGIBLE" &&
      !(input.adoptionBlockedReason ?? cat.adoptionBlockedReason).trim()
    ) {
      throw new Error("Précisez le motif de non-adoptabilité.");
    }
    if (input.speciesId !== undefined && input.speciesId !== cat.speciesId) {
      throw new Error("L'espèce d'un animal enregistré ne peut pas être modifiée.");
    }
    if (input.speciesData !== undefined) {
      cat.speciesData = validateSpeciesData(cat.speciesId, input.speciesData);
    }
    if (input.identificationScheme !== undefined) {
      if (
        input.identificationScheme !== "NONE" &&
        !getSpeciesDefinition(cat.speciesId).identificationSchemes.some(
          (scheme) => scheme.id === input.identificationScheme,
        )
      ) {
        throw new Error("Schéma d'identification indisponible pour cette espèce.");
      }
      cat.identificationScheme = input.identificationScheme;
    }
    if (input.compatibilityBySpecies !== undefined) {
      cat.compatibilityBySpecies = validateCompatibility(input.compatibilityBySpecies);
    }
    if (
      input.profile !== undefined &&
      !getSpeciesDefinition(cat.speciesId).profiles.some((profile) => profile.id === input.profile)
    ) {
      throw new Error("Le profil choisi n'est pas compatible avec l'espèce.");
    }
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error("Le nom de l'animal est obligatoire.");
    }
    if (input.identificationNumber !== undefined) {
      const number = normalizeIdentification(input.identificationNumber);
      if (
        number &&
        this.dataset.animals.some(
          (candidate) => candidate.id !== cat.id && candidate.identificationNumber === number,
        )
      ) {
        throw new Error("Ce numéro d'identification est déjà utilisé.");
      }
      cat.identificationNumber = number;
    }
    const fields: Array<keyof AnimalInput> = [
      "name",
      "birthDate",
      "sex",
      "profile",
      "sterilizationStatus",
      "adoptionEligibility",
      "adoptionBlockedReason",
      "healthStatus",
      "intakeDate",
      "notes",
      "description",
      "photo",
      "compatibilityBySpecies",
      "okWithChildren",
      "medications",
      "medicationSchedule",
      "medicationEndDate",
      "vaccines",
      "deworming",
      "antiFlea",
    ];
    for (const field of fields) {
      if (input[field] !== undefined) {
        const value = input[field];
        Object.assign(cat, {
          [field]: typeof value === "string" ? value.trim() : value,
        });
      }
    }
    if (cat.profile !== "SPECIAL_NEEDS") {
      cat.profile =
        getSpeciesDefinition(cat.speciesId).deriveProfile?.(cat.birthDate, new Date()) ??
        (input.profile && input.profile !== "SPECIAL_NEEDS" ? input.profile : cat.profile);
    }
    cat.updatedAt = now();
    rememberAppearance(this.dataset, cat.speciesId, previousSpeciesData);
    rememberAppearance(this.dataset, cat.speciesId, cat.speciesData);
    touch(this.dataset);
    return this.dataset;
  }

  createSponsorship(input: SponsorshipInput, sponsorshipId?: string): Dataset {
    const cat = requireAnimal(this.dataset, input.animalId);
    if (getAnimalStatus(this.dataset, cat.id) === "DECEASED") {
      throw new Error("Un animal décédé ne peut pas avoir de parrainage actif.");
    }
    if (!input.firstName.trim() && !input.lastName.trim()) {
      throw new Error("Le nom du parrain ou de la marraine est obligatoire.");
    }
    if (!Number.isFinite(input.monthlyAmount) || input.monthlyAmount <= 0) {
      throw new Error("Le montant mensuel doit être supérieur à zéro.");
    }
    assertIsoDate(input.startDate, "La date de début");
    if (input.endDate) {
      assertIsoDate(input.endDate, "La date de fin");
      if (input.endDate < input.startDate) {
        throw new Error("La date de fin précède la date de début.");
      }
    }
    const timestamp = now();
    const existing = sponsorshipId
      ? this.dataset.sponsorships.find((row) => row.id === sponsorshipId)
      : undefined;
    if (sponsorshipId && !existing) {
      throw new Error("Parrainage introuvable.");
    }
    const row = {
      id: existing?.id ?? id(),
      animalId: input.animalId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim() ?? "",
      monthlyAmount: input.monthlyAmount,
      startDate: input.startDate,
      endDate: input.endDate ?? "",
      paymentNotes: input.paymentNotes?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, row);
    } else {
      this.dataset.sponsorships.push(row);
    }
    touch(this.dataset);
    return this.dataset;
  }

  declareAnimalDeceased(animalId: string, date: string, notes = ""): Dataset {
    const cat = requireAnimal(this.dataset, animalId);
    if (getAnimalStatus(this.dataset, animalId) === "DECEASED") {
      throw new Error(`${cat.name} est déjà déclaré décédé.`);
    }
    assertIsoDate(date, "La date du décès");
    const timestamp = now();
    addEvent(this.dataset, animalId, "DECEASED", date, notes.trim());
    for (const sponsorship of this.dataset.sponsorships) {
      if (sponsorship.animalId === animalId && !sponsorship.endDate) {
        sponsorship.endDate = date;
        sponsorship.updatedAt = timestamp;
      }
    }
    for (const task of this.dataset.tasks) {
      if (task.animalId === animalId && task.status === "OPEN") {
        task.status = "CANCELLED";
        task.updatedAt = timestamp;
      }
    }
    touch(this.dataset);
    return this.dataset;
  }

  createTask(input: TaskInput): Dataset {
    assertCareCategorySupported(requireAnimal(this.dataset, input.animalId), input.type);
    assertIsoDate(input.dueDate, "La date du soin");
    const timestamp = now();
    this.dataset.tasks.push({
      id: id(),
      animalId: input.animalId,
      type: input.type,
      status: "OPEN",
      dueDate: input.dueDate,
      completedAt: "",
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }
  recordCare(input: CareRecordInput): Dataset {
    assertCareCategorySupported(requireAnimal(this.dataset, input.animalId), input.type);
    assertIsoDate(input.completedAt, "La date du soin effectué");
    if (input.nextDueDate) {
      assertIsoDate(input.nextDueDate, "La prochaine échéance");
      if (input.nextDueDate < input.completedAt) {
        throw new Error("La prochaine échéance précède la date du soin.");
      }
    }
    const timestamp = now();
    this.dataset.tasks.push({
      id: id(),
      animalId: input.animalId,
      type: input.type,
      status: "DONE",
      dueDate: input.completedAt,
      completedAt: input.completedAt,
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (input.nextDueDate) {
      this.dataset.tasks.push({
        id: id(),
        animalId: input.animalId,
        type: input.type,
        status: "OPEN",
        dueDate: input.nextDueDate,
        completedAt: "",
        notes: input.notes?.trim() ?? "",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    touch(this.dataset);
    return this.dataset;
  }
  recordAnimalHistory(input: AnimalHistoryInput): Dataset {
    requireAnimal(this.dataset, input.animalId);
    if (!input.title.trim()) {
      throw new Error("Le titre de l'événement est obligatoire.");
    }
    assertIsoDate(input.date, "La date de l'événement");
    if (input.nextDate) {
      assertIsoDate(input.nextDate, "La prochaine échéance");
      if (input.nextDate < input.date) {
        throw new Error("La prochaine échéance précède l'événement.");
      }
    }
    const timestamp = now();
    this.dataset.animalEvents.push({
      id: id(),
      animalId: input.animalId,
      type: "NOTE_ADDED",
      date: input.date,
      label: input.title.trim(),
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
    });
    if (input.nextDate) {
      this.dataset.tasks.push({
        id: id(),
        animalId: input.animalId,
        type: input.title.trim(),
        status: "OPEN",
        dueDate: input.nextDate,
        completedAt: "",
        notes: input.notes?.trim() ?? "",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    touch(this.dataset);
    return this.dataset;
  }
  deleteAnimalEvent(eventId: string): Dataset {
    const index = this.dataset.animalEvents.findIndex(
      (event) => event.id === eventId && event.type === "NOTE_ADDED",
    );
    if (index < 0) {
      throw new Error("Événement introuvable ou non supprimable.");
    }
    this.dataset.animalEvents.splice(index, 1);
    touch(this.dataset);
    return this.dataset;
  }
  completeTask(taskId: string, completedAt: string, nextDueDate?: string): Dataset {
    const task = this.dataset.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "OPEN") {
      throw new Error("Soin à terminer introuvable.");
    }
    assertIsoDate(completedAt, "La date du soin effectué");
    if (nextDueDate) {
      assertIsoDate(nextDueDate, "La prochaine échéance");
      if (nextDueDate < completedAt) {
        throw new Error("La prochaine échéance précède la date du soin.");
      }
    }
    task.status = "DONE";
    task.completedAt = completedAt;
    task.updatedAt = now();
    if (nextDueDate) {
      const timestamp = now();
      this.dataset.tasks.push({
        id: id(),
        animalId: task.animalId,
        type: task.type,
        status: "OPEN",
        dueDate: nextDueDate,
        completedAt: "",
        notes: task.notes,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    touch(this.dataset);
    return this.dataset;
  }

  createFamily(input: FamilyInput): Dataset {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName && !lastName && !input.label?.trim()) {
      throw new Error("Le nom de la famille d'accueil est obligatoire.");
    }
    if (input.email && !EMAIL_PATTERN.test(input.email.trim())) {
      throw new Error("L'adresse e-mail n'est pas valide.");
    }
    if (!Number.isInteger(input.maxCapacity) || input.maxCapacity < 1) {
      throw new Error("La capacité doit être au moins de 1.");
    }
    const acceptanceRules = input.acceptanceRules ?? {};
    if (
      !Object.entries(acceptanceRules).some(
        ([species, rule]) =>
          this.dataset.settings.enabledSpecies.includes(species as SpeciesId) &&
          (rule?.profiles.length ?? 0) > 0,
      )
    ) {
      throw new Error("Choisissez au moins une espèce et un profil acceptés.");
    }
    const timestamp = now();
    this.dataset.families.push({
      id: id(),
      label: input.label?.trim() || `${firstName} ${lastName}`.trim(),
      courtesyTitle: input.courtesyTitle?.trim() ?? "",
      firstName,
      lastName,
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      address: input.address?.trim() ?? "",
      maxCapacity: input.maxCapacity,
      acceptanceRules,
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }

  createAdopter(input: AdopterInput): Dataset {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName && !lastName) {
      throw new Error("Le nom de l'adoptant est obligatoire.");
    }
    if (input.email && !EMAIL_PATTERN.test(input.email.trim())) {
      throw new Error("L'adresse e-mail n'est pas valide.");
    }
    const timestamp = now();
    this.dataset.adopters.push({
      id: id(),
      label: input.label?.trim() || `${firstName} ${lastName}`.trim(),
      courtesyTitle: input.courtesyTitle?.trim() ?? "",
      firstName,
      lastName,
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      address: input.address?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }

  addFamilyHoliday(familyId: string, startDate: string, endDate: string, notes = ""): Dataset {
    requireFamily(this.dataset, familyId);
    assertIsoDate(startDate, "La date de début");
    assertIsoDate(endDate, "La date de fin");
    if (endDate < startDate) {
      throw new Error("La fin des vacances précède leur début.");
    }
    this.dataset.fosterFamilyHolidays.push({
      id: id(),
      familyId,
      startDate,
      endDate,
      notes: notes.trim(),
      createdAt: now(),
    });
    touch(this.dataset);
    return this.dataset;
  }

  assessPlacement(input: PlacementInput): PlacementAssessment {
    const cat = requireAnimal(this.dataset, input.animalId);
    const family = requireFamily(this.dataset, input.familyId);
    const status = getAnimalStatus(this.dataset, cat.id);
    const occupancy = this.dataset.fosterPlacements.filter(
      (placement) =>
        placement.familyId === family.id && !placement.endDate && placement.animalId !== cat.id,
    ).length;
    const warnings: string[] = [];
    const speciesRule = family.acceptanceRules?.[cat.speciesId];
    if (!this.dataset.settings.enabledSpecies.includes(cat.speciesId)) {
      return {
        allowed: false,
        warnings: ["L'espèce de cet animal est désactivée dans les paramètres."],
        currentOccupancy: occupancy,
        maxCapacity: family.maxCapacity,
      };
    }
    if (!speciesRule || speciesRule.profiles.length === 0) {
      return {
        allowed: false,
        warnings: [
          `La famille n'accueille pas les ${getSpeciesDefinition(cat.speciesId).label.plural.toLocaleLowerCase("fr-FR")} ${cat.name}.`,
        ],
        currentOccupancy: occupancy,
        maxCapacity: family.maxCapacity,
      };
    }
    if (["ADOPTED", "LOST", "DECEASED"].includes(status)) {
      return {
        allowed: false,
        warnings: ["Le statut actuel de l’animal interdit ce placement."],
        currentOccupancy: occupancy,
        maxCapacity: family.maxCapacity,
      };
    }
    if (activePlacement(this.dataset, cat.id)?.familyId === family.id) {
      return {
        allowed: false,
        warnings: ["Cet animal est déjà dans cette famille."],
        currentOccupancy: occupancy,
        maxCapacity: family.maxCapacity,
      };
    }
    if (occupancy >= family.maxCapacity) {
      warnings.push(`Capacité atteinte (${occupancy}/${family.maxCapacity}).`);
    }
    const hasSpecialNeeds =
      cat.profile === "SPECIAL_NEEDS" || Boolean(cat.speciesData.specialNeeds?.trim());
    const acceptsSpecialNeeds = speciesRule.profiles.includes("SPECIAL_NEEDS");
    if (!speciesRule.profiles.includes(cat.profile) && !(hasSpecialNeeds && acceptsSpecialNeeds)) {
      warnings.push(
        `La famille n'accepte pas le profil ${
          getSpeciesDefinition(cat.speciesId)
            .profiles.find((profile) => profile.id === cat.profile)
            ?.label.toLocaleLowerCase("fr-FR") ?? cat.profile.toLocaleLowerCase("fr-FR")
        } pour les ${getSpeciesDefinition(cat.speciesId).label.plural.toLocaleLowerCase("fr-FR")}.`,
      );
    }
    if (hasSpecialNeeds && cat.profile !== "SPECIAL_NEEDS" && !acceptsSpecialNeeds) {
      warnings.push("La famille n'accepte pas les animaux ayant des besoins particuliers.");
    }
    if (speciesRule.maxCapacity !== undefined) {
      const speciesOccupancy = this.dataset.fosterPlacements.filter((placement) => {
        if (
          placement.familyId !== family.id ||
          placement.endDate ||
          placement.animalId === cat.id
        ) {
          return false;
        }
        return this.dataset.animals.some(
          (animal) => animal.id === placement.animalId && animal.speciesId === cat.speciesId,
        );
      }).length;
      if (speciesOccupancy >= speciesRule.maxCapacity) {
        warnings.push(
          `Capacité de cette espèce atteinte (${speciesOccupancy}/${speciesRule.maxCapacity}).`,
        );
      }
    }
    if (
      this.dataset.fosterFamilyHolidays.some(
        (holiday) =>
          holiday.familyId === family.id &&
          holiday.startDate <= input.startDate &&
          holiday.endDate >= input.startDate,
      )
    ) {
      warnings.push("La famille est indisponible à cette date.");
    }
    return {
      allowed: true,
      warnings,
      currentOccupancy: occupancy,
      maxCapacity: family.maxCapacity,
    };
  }

  startPlacement(input: PlacementInput): Dataset {
    assertIsoDate(input.startDate, "La date de placement");
    const assessment = this.assessPlacement(input);
    if (!assessment.allowed) {
      throw new Error(assessment.warnings.join(" "));
    }
    if (assessment.warnings.length && !input.overrideWarnings) {
      throw new Error(
        `Avertissement : ${assessment.warnings.join(" ")} Confirmez le dépassement pour continuer.`,
      );
    }
    if (assessment.warnings.length && !input.overrideReason?.trim()) {
      throw new Error("Indiquez la raison du dépassement.");
    }
    const previous = activePlacement(this.dataset, input.animalId);
    if (previous) {
      this.endPlacement(previous.id, input.startDate, "Transfert vers une autre famille");
    }
    this.closeRefugeStay(input.animalId, input.startDate, "Départ en famille d'accueil");
    const timestamp = now();
    this.dataset.fosterPlacements.push({
      id: id(),
      animalId: input.animalId,
      familyId: input.familyId,
      startDate: input.startDate,
      endDate: "",
      outcome: "",
      overrideReason: input.overrideReason?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    addEvent(
      this.dataset,
      input.animalId,
      "PLACED_IN_FOSTER",
      input.startDate,
      input.overrideReason,
    );
    touch(this.dataset);
    return this.dataset;
  }

  endPlacement(placementId: string, endDate: string, outcome = ""): Dataset {
    assertIsoDate(endDate, "La date de fin");
    const placement = this.dataset.fosterPlacements.find(
      (candidate) => candidate.id === placementId,
    );
    if (!placement || placement.endDate) {
      throw new Error("Placement actif introuvable.");
    }
    if (endDate < placement.startDate) {
      throw new Error("La fin précède le début du placement.");
    }
    placement.endDate = endDate;
    placement.outcome = outcome.trim();
    placement.updatedAt = now();
    addEvent(this.dataset, placement.animalId, "FOSTER_ENDED", endDate, outcome);
    touch(this.dataset);
    return this.dataset;
  }

  createRefugeZone(name: string, description = "", allowedSpecies?: SpeciesId[] | null): Dataset {
    if (!name.trim()) {
      throw new Error("Le nom de la zone est obligatoire.");
    }
    const timestamp = now();
    this.dataset.refugeZones.push({
      id: id(),
      name: name.trim(),
      description: description.trim(),
      allowedSpecies:
        allowedSpecies === undefined
          ? [...this.dataset.settings.enabledSpecies]
          : allowedSpecies === null
            ? null
            : validateSpeciesList(allowedSpecies),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }

  updateRefugeZone(
    zoneId: string,
    name: string,
    description = "",
    allowedSpecies?: SpeciesId[] | null,
  ): Dataset {
    const zone = this.dataset.refugeZones.find((candidate) => candidate.id === zoneId);
    if (!zone) {
      throw new Error("Zone du refuge introuvable.");
    }
    if (!name.trim()) {
      throw new Error("Le nom de la zone est obligatoire.");
    }
    zone.name = name.trim();
    zone.description = description.trim();
    if (allowedSpecies !== undefined) {
      zone.allowedSpecies = allowedSpecies === null ? null : validateSpeciesList(allowedSpecies);
    }
    zone.updatedAt = now();
    touch(this.dataset);
    return this.dataset;
  }

  deleteRefugeZone(zoneId: string): Dataset {
    const zone = this.dataset.refugeZones.find((candidate) => candidate.id === zoneId);
    if (!zone) {
      throw new Error("Zone du refuge introuvable.");
    }
    if (this.dataset.refugeStays.some((stay) => stay.zoneId === zoneId)) {
      throw new Error(
        "Cette zone appartient à l'historique d'un animal et ne peut pas être supprimée. Renommez-la ou créez une nouvelle zone.",
      );
    }
    if (this.dataset.refugeZones.length === 1) {
      throw new Error("Le refuge doit conserver au moins une zone.");
    }
    this.dataset.refugeZones = this.dataset.refugeZones.filter(
      (candidate) => candidate.id !== zoneId,
    );
    touch(this.dataset);
    return this.dataset;
  }

  sendToRefuge(animalId: string, zoneId: string, date: string, reason = "", notes = ""): Dataset {
    const animal = requireAnimal(this.dataset, animalId);
    assertIsoDate(date, "La date d'entrée au refuge");
    const zone = this.dataset.refugeZones.find((candidate) => candidate.id === zoneId);
    if (!zone) {
      throw new Error("Zone du refuge introuvable.");
    }
    if (zone.allowedSpecies !== null && !zone.allowedSpecies.includes(animal.speciesId)) {
      throw new Error(
        `La zone « ${zone.name} » n'accepte pas les ${getSpeciesDefinition(animal.speciesId).label.plural.toLocaleLowerCase("fr-FR")}.`,
      );
    }
    const adoption = activeAdoption(this.dataset, animalId);
    if (adoption) {
      this.returnAdoption(adoption.id, date, reason || "Retour au refuge");
    }
    const placement = activePlacement(this.dataset, animalId);
    if (placement) {
      this.endPlacement(placement.id, date, reason || "Départ au refuge");
    }
    this.closeRefugeStay(animalId, date, "Changement de zone");
    const timestamp = now();
    this.dataset.refugeStays.push({
      id: id(),
      animalId,
      zoneId,
      startDate: date,
      endDate: "",
      reason: reason.trim(),
      notes: notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    addEvent(this.dataset, animalId, "SENT_TO_REFUGE", date, reason);
    touch(this.dataset);
    return this.dataset;
  }

  createAdoption(input: AdoptionInput): Dataset {
    if (!input.animalIds.length) {
      throw new Error("Choisissez au moins un animal.");
    }
    requireAdopter(this.dataset, input.adopterId);
    assertIsoDate(input.adoptionDate, "La date d'adoption");
    const animals = [...new Set(input.animalIds)].map((animalId) =>
      requireAnimal(this.dataset, animalId),
    );
    for (const cat of animals) {
      const status = getAnimalStatus(this.dataset, cat.id);
      if (["ADOPTED", "LOST", "DECEASED"].includes(status)) {
        throw new Error(`${cat.name} ne peut pas être adopté avec son statut actuel.`);
      }
      if (cat.adoptionEligibility !== "ELIGIBLE" && !input.overrideWarnings) {
        const state =
          cat.adoptionEligibility === "INELIGIBLE" ? "non adoptable" : "en attente d'adoption";
        throw new Error(
          `${cat.name} est déclaré ${state} : ${cat.adoptionBlockedReason || "raison non précisée"}. Confirmez la dérogation pour continuer.`,
        );
      }
      for (const task of this.dataset.tasks) {
        if (task.animalId === cat.id && task.status === "OPEN") {
          task.status = "CANCELLED";
          task.updatedAt = now();
        }
      }
    }
    const groupId = id();
    for (const cat of animals) {
      const placement = activePlacement(this.dataset, cat.id);
      if (placement) {
        this.endPlacement(placement.id, input.adoptionDate, "Adoption");
      }
      this.closeRefugeStay(cat.id, input.adoptionDate, "Adoption");
      const timestamp = now();
      const adoptionId = id();
      this.dataset.adoptions.push({
        id: adoptionId,
        groupId,
        animalId: cat.id,
        adopterId: input.adopterId,
        adoptionDate: input.adoptionDate,
        partner: input.partner?.trim() ?? "",
        adoptionDayId: input.adoptionDayId ?? "",
        status: "ACTIVE",
        endedAt: "",
        notes: input.notes?.trim() ?? "",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const registration = this.dataset.adoptionDayAnimals.find(
        (item) => item.adoptionDayId === input.adoptionDayId && item.animalId === cat.id,
      );
      if (registration) {
        registration.status = "ADOPTED";
        registration.updatedAt = timestamp;
      }
      addEvent(this.dataset, cat.id, "ADOPTED", input.adoptionDate, input.partner);
    }
    touch(this.dataset);
    return this.dataset;
  }

  createAdoptionWithNewFamily(input: AdoptionWithNewFamilyInput): Dataset {
    const existing = new Set(this.dataset.adopters.map((adopter) => adopter.id));
    this.createAdopter(input.family);
    const adopter = this.dataset.adopters.find((candidate) => !existing.has(candidate.id));
    if (!adopter) {
      throw new Error("La création du nouvel adoptant a échoué.");
    }
    return this.createAdoption({ ...input.adoption, adopterId: adopter.id });
  }

  returnAdoption(adoptionId: string, date: string, notes = ""): Dataset {
    assertIsoDate(date, "La date de retour");
    const adoption = this.dataset.adoptions.find(
      (candidate) => candidate.id === adoptionId && candidate.status === "ACTIVE",
    );
    if (!adoption) {
      throw new Error("Adoption active introuvable.");
    }
    if (date < adoption.adoptionDate) {
      throw new Error("Le retour précède l'adoption.");
    }
    adoption.status = "RETURNED";
    adoption.endedAt = date;
    adoption.updatedAt = now();
    // Care reminders belong to the association and resume when an adopted cat returns.
    for (const task of this.dataset.tasks) {
      if (task.animalId === adoption.animalId && task.status === "CANCELLED") {
        task.status = "OPEN";
        task.updatedAt = now();
      }
    }
    addEvent(this.dataset, adoption.animalId, "RETURNED", date, notes);
    touch(this.dataset);
    return this.dataset;
  }

  createAdoptionDay(input: AdoptionDayInput): Dataset {
    if (!input.name.trim()) {
      throw new Error("Le nom de la journée est obligatoire.");
    }
    assertIsoDate(input.startDate, "La date de début");
    assertIsoDate(input.endDate, "La date de fin");
    if (input.endDate < input.startDate) {
      throw new Error("La fin de l'événement précède son début.");
    }
    const timestamp = now();
    this.dataset.adoptionDays.push({
      id: id(),
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      partner: input.partner?.trim() ?? "",
      location: input.location?.trim() ?? "",
      status: "PLANNED",
      notes: input.notes?.trim() ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }

  getAdoptionDaySuggestions(adoptionDayId: string): AdoptionDaySuggestionGroup[] {
    if (!this.dataset.adoptionDays.some((day) => day.id === adoptionDayId)) {
      throw new Error("Journée d'adoption introuvable.");
    }
    const groups = new Map<string, AdoptionDaySuggestionGroup>();
    for (const cat of this.dataset.animals) {
      const view = getAnimalStatus(this.dataset, cat.id);
      if (!["FOSTERED", "AT_REFUGE"].includes(view) || cat.adoptionEligibility !== "ELIGIBLE") {
        continue;
      }
      if (
        this.dataset.adoptionDayAnimals.some(
          (item) =>
            item.adoptionDayId === adoptionDayId &&
            item.animalId === cat.id &&
            item.status !== "WITHDRAWN",
        )
      ) {
        continue;
      }
      const placement = activePlacement(this.dataset, cat.id);
      const stay = activeRefugeStay(this.dataset, cat.id);
      const locationType = placement ? "FAMILY" : "REFUGE";
      const locationId =
        placement?.familyId ?? stay?.zoneId ?? this.dataset.refugeZones[0]?.id ?? "refuge";
      const locationLabel = placement
        ? requireFamily(this.dataset, placement.familyId).label
        : `Le refuge · ${this.dataset.refugeZones.find((zone) => zone.id === (stay?.zoneId ?? this.dataset.refugeZones[0]?.id))?.name ?? "Zone principale"}`;
      const key = `${locationType}:${locationId}`;
      const group = groups.get(key) ?? { locationType, locationId, locationLabel, animals: [] };
      const warnings = animalWarnings(cat);
      group.animals.push({ animalId: cat.id, warnings });
      groups.set(key, group);
    }
    return [...groups.values()].sort(
      (left, right) =>
        right.animals.length - left.animals.length ||
        left.locationLabel.localeCompare(right.locationLabel, "fr"),
    );
  }

  addAnimalsToAdoptionDay(
    adoptionDayId: string,
    animalIds: string[],
    overrideWarnings = false,
    overrideReason = "",
  ): Dataset {
    if (!this.dataset.adoptionDays.some((day) => day.id === adoptionDayId)) {
      throw new Error("Journée d'adoption introuvable.");
    }
    const timestamp = now();
    for (const animalId of [...new Set(animalIds)]) {
      const cat = requireAnimal(this.dataset, animalId);
      const warnings = animalWarnings(cat);
      if (cat.adoptionEligibility === "INELIGIBLE" && !overrideWarnings) {
        throw new Error(`${cat.name} est non adoptable.`);
      }
      if (warnings.length && overrideWarnings && !overrideReason.trim()) {
        throw new Error("Indiquez la raison du dépassement.");
      }
      if (
        this.dataset.adoptionDayAnimals.some(
          (item) =>
            item.adoptionDayId === adoptionDayId &&
            item.animalId === animalId &&
            item.status !== "WITHDRAWN",
        )
      ) {
        continue;
      }
      this.dataset.adoptionDayAnimals.push({
        id: id(),
        adoptionDayId,
        animalId,
        status: "REGISTERED",
        overrideReason: overrideReason.trim(),
        notes: "",
        adopterId: "",
        bookedAt: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    touch(this.dataset);
    return this.dataset;
  }

  withdrawAnimalFromAdoptionDay(registrationId: string): Dataset {
    const registration = this.dataset.adoptionDayAnimals.find(
      (candidate) => candidate.id === registrationId,
    );
    if (!registration || registration.status === "WITHDRAWN") {
      throw new Error("Inscription introuvable.");
    }
    if (registration.status === "ADOPTED") {
      throw new Error("Une adoption validée ne peut pas être retirée de la journée.");
    }
    registration.status = "WITHDRAWN";
    registration.adopterId = "";
    registration.bookedAt = "";
    registration.updatedAt = now();
    touch(this.dataset);
    return this.dataset;
  }

  bookAnimalForAdoption(registrationId: string, adopterId: string, bookedAt: string): Dataset {
    const registration = this.dataset.adoptionDayAnimals.find(
      (candidate) => candidate.id === registrationId && candidate.status !== "WITHDRAWN",
    );
    if (!registration || registration.status === "ADOPTED") {
      throw new Error("Inscription active introuvable.");
    }
    requireAdopter(this.dataset, adopterId);
    assertIsoDate(bookedAt, "La date de réservation");
    registration.adopterId = adopterId;
    registration.bookedAt = bookedAt;
    registration.updatedAt = now();
    touch(this.dataset);
    return this.dataset;
  }

  confirmAdoptionBooking(registrationId: string, adoptionDate: string): Dataset {
    const registration = this.dataset.adoptionDayAnimals.find(
      (candidate) => candidate.id === registrationId && candidate.status !== "WITHDRAWN",
    );
    if (!registration || registration.status === "ADOPTED") {
      throw new Error("Réservation active introuvable.");
    }
    if (!registration.adopterId) {
      throw new Error("Aucune famille n'a réservé cet animal.");
    }
    const day = this.dataset.adoptionDays.find(
      (candidate) => candidate.id === registration.adoptionDayId,
    );
    if (!day) {
      throw new Error("Journée d'adoption introuvable.");
    }
    return this.createAdoption({
      animalIds: [registration.animalId],
      adopterId: registration.adopterId,
      adoptionDate,
      adoptionDayId: day.id,
      partner: day.partner,
      notes: "Réservation confirmée.",
    });
  }

  createPartnerPlace(name: string, address = "", notes = ""): Dataset {
    if (!name.trim()) {
      throw new Error("Le nom du lieu partenaire est obligatoire.");
    }
    if (
      this.dataset.partnerPlaces.some(
        (place) => place.name.localeCompare(name.trim(), "fr", { sensitivity: "accent" }) === 0,
      )
    ) {
      throw new Error("Ce lieu partenaire existe déjà.");
    }
    const timestamp = now();
    this.dataset.partnerPlaces.push({
      id: id(),
      name: name.trim(),
      address: address.trim(),
      notes: notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touch(this.dataset);
    return this.dataset;
  }

  deletePartnerPlace(placeId: string): Dataset {
    if (!this.dataset.partnerPlaces.some((place) => place.id === placeId)) {
      throw new Error("Lieu partenaire introuvable.");
    }
    this.dataset.partnerPlaces = this.dataset.partnerPlaces.filter((place) => place.id !== placeId);
    touch(this.dataset);
    return this.dataset;
  }

  declareSickness(
    animalId: string,
    disease: string,
    declaredAt: string,
    lookbackDays: number,
    notes = "",
  ): { dataset: Dataset; exposures: HealthExposure[] } {
    const cat = requireAnimal(this.dataset, animalId);
    assertIsoDate(declaredAt, "La date de déclaration");
    if (!disease.trim()) {
      throw new Error("La maladie ou le motif est obligatoire.");
    }
    if (!Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > 365) {
      throw new Error("Le délai de recherche doit être compris entre 0 et 365 jours.");
    }
    const timestamp = now();
    const alert: HealthAlert = {
      id: id(),
      animalId,
      disease: disease.trim(),
      declaredAt,
      lookbackDays,
      status: "OPEN",
      resolvedAt: "",
      notes: notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.dataset.healthAlerts.push(alert);
    cat.healthStatus = "SICK";
    cat.updatedAt = timestamp;
    addEvent(this.dataset, animalId, "DECLARED_SICK", declaredAt, disease);
    touch(this.dataset);
    return { dataset: this.dataset, exposures: findHealthExposures(this.dataset, alert) };
  }

  resolveHealthAlert(alertId: string, resolvedAt: string, notes = ""): Dataset {
    const alert = this.dataset.healthAlerts.find(
      (candidate) => candidate.id === alertId && candidate.status === "OPEN",
    );
    if (!alert) {
      throw new Error("Alerte sanitaire active introuvable.");
    }
    assertIsoDate(resolvedAt, "La date de fin");
    if (resolvedAt < alert.declaredAt) {
      throw new Error("La fin de l'alerte précède sa déclaration.");
    }
    alert.status = "RESOLVED";
    alert.resolvedAt = resolvedAt;
    alert.notes = [alert.notes, notes.trim()].filter(Boolean).join(" · ");
    alert.updatedAt = now();
    const cat = requireAnimal(this.dataset, alert.animalId);
    if (
      !this.dataset.healthAlerts.some(
        (candidate) => candidate.animalId === cat.id && candidate.status === "OPEN",
      )
    ) {
      cat.healthStatus = "RECOVERED";
    }
    cat.updatedAt = now();
    addEvent(this.dataset, cat.id, "RECOVERED", resolvedAt, notes);
    touch(this.dataset);
    return this.dataset;
  }

  getHealthExposures(alertId: string): HealthExposure[] {
    const alert = this.dataset.healthAlerts.find((candidate) => candidate.id === alertId);
    if (!alert) {
      throw new Error("Alerte sanitaire introuvable.");
    }
    return findHealthExposures(this.dataset, alert);
  }

  private closeRefugeStay(animalId: string, date: string, reason: string): void {
    const stay = activeRefugeStay(this.dataset, animalId);
    if (!stay) {
      return;
    }
    if (date < stay.startDate) {
      throw new Error("La sortie du refuge précède l'entrée.");
    }
    stay.endDate = date;
    stay.notes = [stay.notes, reason].filter(Boolean).join(" · ");
    stay.updatedAt = now();
    addEvent(this.dataset, animalId, "LEFT_REFUGE", date, reason);
  }
}

function validateCompatibility(
  value: Record<string, boolean | null>,
): Dataset["animals"][number]["compatibilityBySpecies"] {
  const result: Dataset["animals"][number]["compatibilityBySpecies"] = {};
  for (const [species, compatibility] of Object.entries(value)) {
    if (!isSpeciesId(species) || (compatibility !== null && typeof compatibility !== "boolean")) {
      throw new Error("La compatibilité par espèce contient une valeur invalide.");
    }
    result[species as SpeciesId] = compatibility;
  }
  return result;
}

function validateSpeciesList(value: SpeciesId[]): SpeciesId[] {
  const unique = [...new Set(value)];
  if (!unique.length || unique.some((species) => !isSpeciesId(species))) {
    throw new Error("Choisissez au moins une espèce valide pour la zone.");
  }
  return unique;
}

function animalWarnings(animal: Dataset["animals"][number]): string[] {
  const warnings: string[] = [];
  if (
    getSpeciesDefinition(animal.speciesId).careCategories.includes("STERILISATION") &&
    animal.sterilizationStatus !== "DONE"
  ) {
    warnings.push("Stérilisation non confirmée");
  }
  if (animal.healthStatus === "SICK") {
    warnings.push("Alerte sanitaire active");
  }
  if (animal.adoptionEligibility === "ON_HOLD") {
    warnings.push(
      `Adoption en attente${animal.adoptionBlockedReason ? ` : ${animal.adoptionBlockedReason}` : ""}`,
    );
  }
  if (animal.adoptionEligibility === "UNKNOWN") {
    warnings.push("Adoptabilité inconnue");
  }
  return warnings;
}

function assertCareCategorySupported(animal: Dataset["animals"][number], type: string): void {
  const normalized = type.toLocaleUpperCase("fr-FR").replaceAll(/[ -]/g, "_");
  const category =
    normalized.includes("STERIL") || normalized.includes("CASTR") || normalized.includes("SPAY")
      ? "STERILISATION"
      : normalized.includes("VERMIF") || normalized.includes("DEWORM")
        ? "VERMIFUGE"
        : normalized.includes("ANTI_PUCE") ||
            normalized.includes("ANTIPUCE") ||
            normalized.includes("FLEA")
          ? "ANTI_PUCE"
          : normalized.includes("VACCIN")
            ? "VACCIN"
            : undefined;
  if (category && !getSpeciesDefinition(animal.speciesId).careCategories.includes(category)) {
    throw new Error(
      `Le soin « ${type} » n'est pas disponible pour les ${getSpeciesDefinition(animal.speciesId).label.plural.toLocaleLowerCase("fr-FR")}.`,
    );
  }
}
