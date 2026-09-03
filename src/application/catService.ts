import {
  activeAdoption, activePlacement, activeRefugeStay, assertIsoDate, getCatStatus,
  normalizeIdentification, requireAdopter, requireCat, requireFamily
} from "../domain/dataset";
import { findHealthExposures } from "../domain/healthTracing";
import type {
  AdopterInput, AdoptionDayInput, AdoptionDaySuggestionGroup, AdoptionInput,
  AdoptionWithNewFamilyInput, CatEventType, CatInput, CatUpdateInput, Dataset,
  FamilyInput, HealthExposure, PlacementAssessment, PlacementInput
} from "../shared/types";

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const id = () => crypto.randomUUID();
const touch = (dataset: Dataset) => { dataset.updatedAt = now(); };

function addEvent(dataset: Dataset, catId: string, type: CatEventType, date: string, notes = ""): void {
  dataset.catEvents.push({ id: id(), catId, type, date, notes, createdAt: now() });
}

export class CatService {
  constructor(private readonly dataset: Dataset) {}

  createCat(input: CatInput): Dataset {
    const name = input.name.trim();
    if (!name) throw new Error("Le nom du chat est obligatoire.");
    const identificationNumber = normalizeIdentification(input.identificationNumber ?? "");
    if (identificationNumber && this.dataset.cats.some((cat) => cat.identificationNumber === identificationNumber)) {
      throw new Error("Ce numéro d'identification est déjà utilisé.");
    }
    if (input.birthDate) assertIsoDate(input.birthDate, "La date de naissance");
    const intakeDate = input.intakeDate || today();
    assertIsoDate(intakeDate, "La date d'arrivée");
    const timestamp = now();
    const catId = id();
    this.dataset.cats.push({
      id: catId, name, identificationNumber, birthDate: input.birthDate ?? "", sex: input.sex ?? "UNKNOWN",
      profile: input.profile ?? "ADULT", sterilizationStatus: input.sterilizationStatus ?? "UNKNOWN",
      adoptionEligibility: input.adoptionEligibility ?? "ELIGIBLE", adoptionBlockedReason: input.adoptionBlockedReason?.trim() ?? "",
      healthStatus: input.healthStatus ?? "HEALTHY", intakeDate, notes: input.notes?.trim() ?? "",
      createdAt: timestamp, updatedAt: timestamp
    });
    addEvent(this.dataset, catId, "REGISTERED", intakeDate);
    touch(this.dataset);
    return this.dataset;
  }

  updateCat(input: CatUpdateInput): Dataset {
    const cat = requireCat(this.dataset, input.id);
    if (input.name !== undefined && !input.name.trim()) throw new Error("Le nom du chat est obligatoire.");
    if (input.identificationNumber !== undefined) {
      const number = normalizeIdentification(input.identificationNumber);
      if (number && this.dataset.cats.some((candidate) => candidate.id !== cat.id && candidate.identificationNumber === number)) throw new Error("Ce numéro d'identification est déjà utilisé.");
      cat.identificationNumber = number;
    }
    const fields: Array<keyof CatInput> = ["name", "birthDate", "sex", "profile", "sterilizationStatus", "adoptionEligibility", "adoptionBlockedReason", "healthStatus", "intakeDate", "notes"];
    for (const field of fields) if (input[field] !== undefined) (cat as unknown as Record<string, unknown>)[field] = typeof input[field] === "string" ? input[field].trim() : input[field];
    cat.updatedAt = now();
    touch(this.dataset);
    return this.dataset;
  }

  createFamily(input: FamilyInput): Dataset {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName && !lastName && !input.label?.trim()) throw new Error("Le nom de la famille d'accueil est obligatoire.");
    if (input.email && !EMAIL_PATTERN.test(input.email.trim())) throw new Error("L'adresse e-mail n'est pas valide.");
    if (!Number.isInteger(input.maxCapacity) || input.maxCapacity < 1) throw new Error("La capacité doit être au moins de 1.");
    if (input.acceptedProfiles.length === 0) throw new Error("Choisissez au moins un type de chat accepté.");
    const timestamp = now();
    this.dataset.families.push({
      id: id(), label: input.label?.trim() || `${firstName} ${lastName}`.trim(), courtesyTitle: input.courtesyTitle?.trim() ?? "",
      firstName, lastName, email: input.email?.trim() ?? "", phone: input.phone?.trim() ?? "", address: input.address?.trim() ?? "",
      maxCapacity: input.maxCapacity, acceptedProfiles: [...new Set(input.acceptedProfiles)], notes: input.notes?.trim() ?? "",
      createdAt: timestamp, updatedAt: timestamp
    });
    touch(this.dataset);
    return this.dataset;
  }

  createAdopter(input: AdopterInput): Dataset {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName && !lastName) throw new Error("Le nom de l'adoptant est obligatoire.");
    if (input.email && !EMAIL_PATTERN.test(input.email.trim())) throw new Error("L'adresse e-mail n'est pas valide.");
    const timestamp = now();
    this.dataset.adopters.push({
      id: id(), label: input.label?.trim() || `${firstName} ${lastName}`.trim(), courtesyTitle: input.courtesyTitle?.trim() ?? "",
      firstName, lastName, email: input.email?.trim() ?? "", phone: input.phone?.trim() ?? "", address: input.address?.trim() ?? "",
      notes: input.notes?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp
    });
    touch(this.dataset);
    return this.dataset;
  }

  addFamilyHoliday(familyId: string, startDate: string, endDate: string, notes = ""): Dataset {
    requireFamily(this.dataset, familyId);
    assertIsoDate(startDate, "La date de début"); assertIsoDate(endDate, "La date de fin");
    if (endDate < startDate) throw new Error("La fin des vacances précède leur début.");
    this.dataset.fosterFamilyHolidays.push({ id: id(), familyId, startDate, endDate, notes: notes.trim(), createdAt: now() });
    touch(this.dataset); return this.dataset;
  }

  assessPlacement(input: PlacementInput): PlacementAssessment {
    const cat = requireCat(this.dataset, input.catId);
    const family = requireFamily(this.dataset, input.familyId);
    const status = getCatStatus(this.dataset, cat.id);
    const occupancy = this.dataset.fosterPlacements.filter((placement) => placement.familyId === family.id && !placement.endDate && placement.catId !== cat.id).length;
    const warnings: string[] = [];
    if (["ADOPTED", "LOST", "DECEASED"].includes(status)) return { allowed: false, warnings: ["Le statut actuel du chat interdit ce placement."], currentOccupancy: occupancy, maxCapacity: family.maxCapacity };
    if (activePlacement(this.dataset, cat.id)?.familyId === family.id) return { allowed: false, warnings: ["Ce chat est déjà dans cette famille."], currentOccupancy: occupancy, maxCapacity: family.maxCapacity };
    if (occupancy >= family.maxCapacity) warnings.push(`Capacité atteinte (${occupancy}/${family.maxCapacity}).`);
    if (!family.acceptedProfiles.includes(cat.profile)) warnings.push(`La famille n'accepte pas le profil ${profileLabel(cat.profile)}.`);
    if (this.dataset.fosterFamilyHolidays.some((holiday) => holiday.familyId === family.id && holiday.startDate <= input.startDate && holiday.endDate >= input.startDate)) warnings.push("La famille est indisponible à cette date.");
    return { allowed: true, warnings, currentOccupancy: occupancy, maxCapacity: family.maxCapacity };
  }

  startPlacement(input: PlacementInput): Dataset {
    assertIsoDate(input.startDate, "La date de placement");
    const assessment = this.assessPlacement(input);
    if (!assessment.allowed) throw new Error(assessment.warnings.join(" "));
    if (assessment.warnings.length && !input.overrideWarnings) throw new Error(`Avertissement : ${assessment.warnings.join(" ")} Confirmez le dépassement pour continuer.`);
    if (assessment.warnings.length && !input.overrideReason?.trim()) throw new Error("Indiquez la raison du dépassement.");
    const previous = activePlacement(this.dataset, input.catId);
    if (previous) this.endPlacement(previous.id, input.startDate, "Transfert vers une autre famille");
    this.closeRefugeStay(input.catId, input.startDate, "Départ en famille d'accueil");
    const timestamp = now();
    this.dataset.fosterPlacements.push({
      id: id(), catId: input.catId, familyId: input.familyId, startDate: input.startDate, endDate: "", outcome: "",
      overrideReason: input.overrideReason?.trim() ?? "", notes: input.notes?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp
    });
    addEvent(this.dataset, input.catId, "PLACED_IN_FOSTER", input.startDate, input.overrideReason);
    touch(this.dataset); return this.dataset;
  }

  endPlacement(placementId: string, endDate: string, outcome = ""): Dataset {
    assertIsoDate(endDate, "La date de fin");
    const placement = this.dataset.fosterPlacements.find((candidate) => candidate.id === placementId);
    if (!placement || placement.endDate) throw new Error("Placement actif introuvable.");
    if (endDate < placement.startDate) throw new Error("La fin précède le début du placement.");
    placement.endDate = endDate; placement.outcome = outcome.trim(); placement.updatedAt = now();
    addEvent(this.dataset, placement.catId, "FOSTER_ENDED", endDate, outcome); touch(this.dataset); return this.dataset;
  }

  createRefugeZone(name: string, description = ""): Dataset {
    if (!name.trim()) throw new Error("Le nom de la zone est obligatoire.");
    const timestamp = now();
    this.dataset.refugeZones.push({ id: id(), name: name.trim(), description: description.trim(), createdAt: timestamp, updatedAt: timestamp });
    touch(this.dataset); return this.dataset;
  }

  updateRefugeZone(zoneId: string, name: string, description = ""): Dataset {
    const zone = this.dataset.refugeZones.find((candidate) => candidate.id === zoneId);
    if (!zone) throw new Error("Zone du refuge introuvable.");
    if (!name.trim()) throw new Error("Le nom de la zone est obligatoire.");
    zone.name = name.trim(); zone.description = description.trim(); zone.updatedAt = now();
    touch(this.dataset); return this.dataset;
  }

  deleteRefugeZone(zoneId: string): Dataset {
    const zone = this.dataset.refugeZones.find((candidate) => candidate.id === zoneId);
    if (!zone) throw new Error("Zone du refuge introuvable.");
    if (this.dataset.refugeStays.some((stay) => stay.zoneId === zoneId)) throw new Error("Cette zone appartient à l'historique d'un chat et ne peut pas être supprimée. Renommez-la ou créez une nouvelle zone.");
    if (this.dataset.refugeZones.length === 1) throw new Error("Le refuge doit conserver au moins une zone.");
    this.dataset.refugeZones = this.dataset.refugeZones.filter((candidate) => candidate.id !== zoneId);
    touch(this.dataset); return this.dataset;
  }

  sendToRefuge(catId: string, zoneId: string, date: string, reason = "", notes = ""): Dataset {
    requireCat(this.dataset, catId); assertIsoDate(date, "La date d'entrée au refuge");
    if (!this.dataset.refugeZones.some((zone) => zone.id === zoneId)) throw new Error("Zone du refuge introuvable.");
    const adoption = activeAdoption(this.dataset, catId);
    if (adoption) this.returnAdoption(adoption.id, date, reason || "Retour au refuge");
    const placement = activePlacement(this.dataset, catId);
    if (placement) this.endPlacement(placement.id, date, reason || "Départ au refuge");
    this.closeRefugeStay(catId, date, "Changement de zone");
    const timestamp = now();
    this.dataset.refugeStays.push({ id: id(), catId, zoneId, startDate: date, endDate: "", reason: reason.trim(), notes: notes.trim(), createdAt: timestamp, updatedAt: timestamp });
    addEvent(this.dataset, catId, "SENT_TO_REFUGE", date, reason); touch(this.dataset); return this.dataset;
  }

  createAdoption(input: AdoptionInput): Dataset {
    if (!input.catIds.length) throw new Error("Choisissez au moins un chat.");
    requireAdopter(this.dataset, input.adopterId); assertIsoDate(input.adoptionDate, "La date d'adoption");
    const cats = [...new Set(input.catIds)].map((catId) => requireCat(this.dataset, catId));
    for (const cat of cats) {
      const status = getCatStatus(this.dataset, cat.id);
      if (["ADOPTED", "LOST", "DECEASED"].includes(status)) throw new Error(`${cat.name} ne peut pas être adopté avec son statut actuel.`);
      if (cat.adoptionEligibility !== "ELIGIBLE" && !input.overrideWarnings) {
        const state = cat.adoptionEligibility === "INELIGIBLE" ? "non adoptable" : "en attente d'adoption";
        throw new Error(`${cat.name} est déclaré ${state} : ${cat.adoptionBlockedReason || "raison non précisée"}. Confirmez la dérogation pour continuer.`);
      }
    }
    const groupId = id();
    for (const cat of cats) {
      const placement = activePlacement(this.dataset, cat.id); if (placement) this.endPlacement(placement.id, input.adoptionDate, "Adoption");
      this.closeRefugeStay(cat.id, input.adoptionDate, "Adoption");
      const timestamp = now();
      const adoptionId = id();
      this.dataset.adoptions.push({
        id: adoptionId, groupId, catId: cat.id, adopterId: input.adopterId, adoptionDate: input.adoptionDate,
        partner: input.partner?.trim() ?? "", adoptionDayId: input.adoptionDayId ?? "", status: "ACTIVE", endedAt: "",
        notes: input.notes?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp
      });
      const registration = this.dataset.adoptionDayCats.find((item) => item.adoptionDayId === input.adoptionDayId && item.catId === cat.id);
      if (registration) { registration.status = "ADOPTED"; registration.updatedAt = timestamp; }
      addEvent(this.dataset, cat.id, "ADOPTED", input.adoptionDate, input.partner);
    }
    touch(this.dataset); return this.dataset;
  }

  createAdoptionWithNewFamily(input: AdoptionWithNewFamilyInput): Dataset {
    const existing = new Set(this.dataset.adopters.map((adopter) => adopter.id));
    this.createAdopter(input.family);
    const adopter = this.dataset.adopters.find((candidate) => !existing.has(candidate.id));
    if (!adopter) throw new Error("La création du nouvel adoptant a échoué.");
    return this.createAdoption({ ...input.adoption, adopterId: adopter.id });
  }

  returnAdoption(adoptionId: string, date: string, notes = ""): Dataset {
    assertIsoDate(date, "La date de retour");
    const adoption = this.dataset.adoptions.find((candidate) => candidate.id === adoptionId && candidate.status === "ACTIVE");
    if (!adoption) throw new Error("Adoption active introuvable.");
    if (date < adoption.adoptionDate) throw new Error("Le retour précède l'adoption.");
    adoption.status = "RETURNED"; adoption.endedAt = date; adoption.updatedAt = now();
    addEvent(this.dataset, adoption.catId, "RETURNED", date, notes); touch(this.dataset); return this.dataset;
  }

  createAdoptionDay(input: AdoptionDayInput): Dataset {
    if (!input.name.trim()) throw new Error("Le nom de la journée est obligatoire.");
    assertIsoDate(input.startDate, "La date de début"); assertIsoDate(input.endDate, "La date de fin");
    if (input.endDate < input.startDate) throw new Error("La fin de l'événement précède son début.");
    const timestamp = now();
    this.dataset.adoptionDays.push({ id: id(), name: input.name.trim(), startDate: input.startDate, endDate: input.endDate,
      partner: input.partner?.trim() ?? "", location: input.location?.trim() ?? "", status: "PLANNED", notes: input.notes?.trim() ?? "", createdAt: timestamp, updatedAt: timestamp });
    touch(this.dataset); return this.dataset;
  }

  getAdoptionDaySuggestions(adoptionDayId: string): AdoptionDaySuggestionGroup[] {
    if (!this.dataset.adoptionDays.some((day) => day.id === adoptionDayId)) throw new Error("Journée d'adoption introuvable.");
    const groups = new Map<string, AdoptionDaySuggestionGroup>();
    for (const cat of this.dataset.cats) {
      const view = getCatStatus(this.dataset, cat.id);
      if (!["FOSTERED", "AT_REFUGE"].includes(view) || cat.adoptionEligibility !== "ELIGIBLE") continue;
      if (this.dataset.adoptionDayCats.some((item) => item.adoptionDayId === adoptionDayId && item.catId === cat.id && item.status !== "WITHDRAWN")) continue;
      const placement = activePlacement(this.dataset, cat.id);
      const stay = activeRefugeStay(this.dataset, cat.id);
      const locationType = placement ? "FAMILY" as const : "REFUGE" as const;
      const locationId = placement?.familyId ?? stay?.zoneId ?? this.dataset.refugeZones[0]?.id ?? "refuge";
      const locationLabel = placement
        ? requireFamily(this.dataset, placement.familyId).label
        : `Le refuge · ${this.dataset.refugeZones.find((zone) => zone.id === (stay?.zoneId ?? this.dataset.refugeZones[0]?.id))?.name ?? "Zone principale"}`;
      const key = `${locationType}:${locationId}`;
      const group = groups.get(key) ?? { locationType, locationId, locationLabel, cats: [] };
      const warnings = catWarnings(cat);
      group.cats.push({ catId: cat.id, warnings }); groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => right.cats.length - left.cats.length || left.locationLabel.localeCompare(right.locationLabel, "fr"));
  }

  addCatsToAdoptionDay(adoptionDayId: string, catIds: string[], overrideWarnings = false, overrideReason = ""): Dataset {
    if (!this.dataset.adoptionDays.some((day) => day.id === adoptionDayId)) throw new Error("Journée d'adoption introuvable.");
    const timestamp = now();
    for (const catId of [...new Set(catIds)]) {
      const cat = requireCat(this.dataset, catId);
      const warnings = catWarnings(cat);
      if (cat.adoptionEligibility === "INELIGIBLE" && !overrideWarnings) throw new Error(`${cat.name} est non adoptable.`);
      if (warnings.length && overrideWarnings && !overrideReason.trim()) throw new Error("Indiquez la raison du dépassement.");
      if (this.dataset.adoptionDayCats.some((item) => item.adoptionDayId === adoptionDayId && item.catId === catId && item.status !== "WITHDRAWN")) continue;
      this.dataset.adoptionDayCats.push({ id: id(), adoptionDayId, catId, status: "REGISTERED", overrideReason: overrideReason.trim(), notes: "", adopterId: "", bookedAt: "", createdAt: timestamp, updatedAt: timestamp });
    }
    touch(this.dataset); return this.dataset;
  }

  withdrawCatFromAdoptionDay(registrationId: string): Dataset {
    const registration = this.dataset.adoptionDayCats.find((candidate) => candidate.id === registrationId);
    if (!registration || registration.status === "WITHDRAWN") throw new Error("Inscription introuvable.");
    if (registration.status === "ADOPTED") throw new Error("Une adoption validée ne peut pas être retirée de la journée.");
    registration.status = "WITHDRAWN"; registration.adopterId = ""; registration.bookedAt = ""; registration.updatedAt = now();
    touch(this.dataset); return this.dataset;
  }

  bookCatForAdoption(registrationId: string, adopterId: string, bookedAt: string): Dataset {
    const registration = this.dataset.adoptionDayCats.find((candidate) => candidate.id === registrationId && candidate.status !== "WITHDRAWN");
    if (!registration || registration.status === "ADOPTED") throw new Error("Inscription active introuvable.");
    requireAdopter(this.dataset, adopterId); assertIsoDate(bookedAt, "La date de réservation");
    registration.adopterId = adopterId; registration.bookedAt = bookedAt; registration.updatedAt = now();
    touch(this.dataset); return this.dataset;
  }

  confirmAdoptionBooking(registrationId: string, adoptionDate: string): Dataset {
    const registration = this.dataset.adoptionDayCats.find((candidate) => candidate.id === registrationId && candidate.status !== "WITHDRAWN");
    if (!registration || registration.status === "ADOPTED") throw new Error("Réservation active introuvable.");
    if (!registration.adopterId) throw new Error("Aucune famille n'a réservé ce chat.");
    const day = this.dataset.adoptionDays.find((candidate) => candidate.id === registration.adoptionDayId);
    if (!day) throw new Error("Journée d'adoption introuvable.");
    return this.createAdoption({ catIds: [registration.catId], adopterId: registration.adopterId, adoptionDate, adoptionDayId: day.id, partner: day.partner, notes: "Réservation confirmée." });
  }

  createPartnerPlace(name: string, address = "", notes = ""): Dataset {
    if (!name.trim()) throw new Error("Le nom du lieu partenaire est obligatoire.");
    if (this.dataset.partnerPlaces.some((place) => place.name.localeCompare(name.trim(), "fr", { sensitivity: "accent" }) === 0)) throw new Error("Ce lieu partenaire existe déjà.");
    const timestamp = now();
    this.dataset.partnerPlaces.push({ id: id(), name: name.trim(), address: address.trim(), notes: notes.trim(), createdAt: timestamp, updatedAt: timestamp });
    touch(this.dataset); return this.dataset;
  }

  deletePartnerPlace(placeId: string): Dataset {
    if (!this.dataset.partnerPlaces.some((place) => place.id === placeId)) throw new Error("Lieu partenaire introuvable.");
    this.dataset.partnerPlaces = this.dataset.partnerPlaces.filter((place) => place.id !== placeId);
    touch(this.dataset); return this.dataset;
  }

  declareSickness(catId: string, disease: string, declaredAt: string, lookbackDays: number, notes = ""): { dataset: Dataset; exposures: HealthExposure[] } {
    const cat = requireCat(this.dataset, catId); assertIsoDate(declaredAt, "La date de déclaration");
    if (!disease.trim()) throw new Error("La maladie ou le motif est obligatoire.");
    if (!Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > 365) throw new Error("Le délai de recherche doit être compris entre 0 et 365 jours.");
    const timestamp = now();
    const alert = { id: id(), catId, disease: disease.trim(), declaredAt, lookbackDays, status: "OPEN" as const, resolvedAt: "", notes: notes.trim(), createdAt: timestamp, updatedAt: timestamp };
    this.dataset.healthAlerts.push(alert); cat.healthStatus = "SICK"; cat.updatedAt = timestamp;
    addEvent(this.dataset, catId, "DECLARED_SICK", declaredAt, disease); touch(this.dataset);
    return { dataset: this.dataset, exposures: findHealthExposures(this.dataset, alert) };
  }

  resolveHealthAlert(alertId: string, resolvedAt: string, notes = ""): Dataset {
    const alert = this.dataset.healthAlerts.find((candidate) => candidate.id === alertId && candidate.status === "OPEN");
    if (!alert) throw new Error("Alerte sanitaire active introuvable.");
    assertIsoDate(resolvedAt, "La date de fin");
    if (resolvedAt < alert.declaredAt) throw new Error("La fin de l'alerte précède sa déclaration.");
    alert.status = "RESOLVED"; alert.resolvedAt = resolvedAt; alert.notes = [alert.notes, notes.trim()].filter(Boolean).join(" · "); alert.updatedAt = now();
    const cat = requireCat(this.dataset, alert.catId);
    if (!this.dataset.healthAlerts.some((candidate) => candidate.catId === cat.id && candidate.status === "OPEN")) cat.healthStatus = "RECOVERED";
    cat.updatedAt = now(); addEvent(this.dataset, cat.id, "RECOVERED", resolvedAt, notes); touch(this.dataset);
    return this.dataset;
  }

  getHealthExposures(alertId: string): HealthExposure[] {
    const alert = this.dataset.healthAlerts.find((candidate) => candidate.id === alertId);
    if (!alert) throw new Error("Alerte sanitaire introuvable.");
    return findHealthExposures(this.dataset, alert);
  }

  private closeRefugeStay(catId: string, date: string, reason: string): void {
    const stay = activeRefugeStay(this.dataset, catId);
    if (!stay) return;
    if (date < stay.startDate) throw new Error("La sortie du refuge précède l'entrée.");
    stay.endDate = date; stay.notes = [stay.notes, reason].filter(Boolean).join(" · "); stay.updatedAt = now();
    addEvent(this.dataset, catId, "LEFT_REFUGE", date, reason);
  }
}

function profileLabel(profile: string): string {
  return ({ BOTTLE_KITTEN: "chaton à biberonner", KITTEN: "chaton", ADULT: "adulte", SENIOR: "senior", SPECIAL_NEEDS: "besoins particuliers" } as Record<string, string>)[profile] ?? profile;
}

function catWarnings(cat: Dataset["cats"][number]): string[] {
  const warnings: string[] = [];
  if (cat.sterilizationStatus !== "DONE") warnings.push("Stérilisation non confirmée");
  if (cat.healthStatus === "SICK") warnings.push("Alerte sanitaire active");
  if (cat.adoptionEligibility === "ON_HOLD") warnings.push(`Adoption en attente${cat.adoptionBlockedReason ? ` : ${cat.adoptionBlockedReason}` : ""}`);
  return warnings;
}
