/** Frozen file names and headers from release v0.1.0 (schema 3) and the
 * development schema-7 format present when the v1 migration was planned. */
export type LegacySchema = 3 | 7;

export interface LegacyTableSpec {
  key: string;
  file: string;
  headers: readonly string[];
}
export type LegacyTables = Map<string, Array<Record<string, string>>>;

const s3 = (key: string, file: string, headers: string): LegacyTableSpec => ({
  key,
  file,
  headers: headers.split(" "),
});

export const SCHEMA_3_TABLES: readonly LegacyTableSpec[] = [
  s3(
    "cats",
    "cats.csv",
    "id name identificationNumber birthDate sex profile sterilizationStatus adoptionEligibility adoptionBlockedReason healthStatus intakeDate notes createdAt updatedAt",
  ),
  s3(
    "families",
    "families.csv",
    "id label courtesyTitle firstName lastName email phone address maxCapacity acceptedProfiles notes createdAt updatedAt",
  ),
  s3(
    "adopters",
    "adopters.csv",
    "id label courtesyTitle firstName lastName email phone address notes createdAt updatedAt",
  ),
  s3(
    "fosterFamilyHolidays",
    "foster_family_holidays.csv",
    "id familyId startDate endDate notes createdAt",
  ),
  s3(
    "fosterPlacements",
    "foster_placements.csv",
    "id catId familyId startDate endDate outcome overrideReason notes createdAt updatedAt",
  ),
  s3("refugeZones", "refuge_zones.csv", "id name description createdAt updatedAt"),
  s3(
    "refugeStays",
    "refuge_stays.csv",
    "id catId zoneId startDate endDate reason notes createdAt updatedAt",
  ),
  s3(
    "adoptions",
    "adoptions.csv",
    "id groupId catId adopterId adoptionDate partner adoptionDayId status endedAt notes createdAt updatedAt",
  ),
  s3(
    "adoptionDays",
    "adoption_days.csv",
    "id name startDate endDate partner location status notes createdAt updatedAt",
  ),
  s3(
    "adoptionDayCats",
    "adoption_day_cats.csv",
    "id adoptionDayId catId status overrideReason notes adopterId bookedAt createdAt updatedAt",
  ),
  s3("partnerPlaces", "partner_places.csv", "id name address notes createdAt updatedAt"),
  s3(
    "healthAlerts",
    "health_alerts.csv",
    "id catId disease declaredAt lookbackDays status resolvedAt notes createdAt updatedAt",
  ),
  s3("catEvents", "cat_events.csv", "id catId type date notes createdAt"),
  s3("tasks", "tasks.csv", "id catId type status dueDate completedAt notes createdAt updatedAt"),
  s3(
    "followUps",
    "follow_ups.csv",
    "id catId adoptionId requestedAt response lastNewsAt createdAt updatedAt",
  ),
];

// Schema 7 adds the fields and table introduced after v0.1.0. Keep this list
// local to the adapter so changes to the current TABLES cannot redefine it.
export const SCHEMA_7_TABLES: readonly LegacyTableSpec[] = [
  s3(
    "cats",
    "cats.csv",
    "id name identificationNumber birthDate sex profile sterilizationStatus adoptionEligibility adoptionBlockedReason healthStatus intakeDate notes description photo okWithCats okWithDogs okWithChildren medications medicationSchedule medicationEndDate vaccines deworming antiFlea createdAt updatedAt",
  ),
  s3(
    "families",
    "families.csv",
    "id label courtesyTitle firstName lastName email phone address maxCapacity acceptedProfiles notes createdAt updatedAt",
  ),
  s3(
    "adopters",
    "adopters.csv",
    "id label courtesyTitle firstName lastName email phone address notes createdAt updatedAt",
  ),
  s3(
    "fosterFamilyHolidays",
    "foster_family_holidays.csv",
    "id familyId startDate endDate notes createdAt",
  ),
  s3(
    "fosterPlacements",
    "foster_placements.csv",
    "id catId familyId startDate endDate outcome overrideReason notes createdAt updatedAt",
  ),
  s3("refugeZones", "refuge_zones.csv", "id name description createdAt updatedAt"),
  s3(
    "refugeStays",
    "refuge_stays.csv",
    "id catId zoneId startDate endDate reason notes createdAt updatedAt",
  ),
  s3(
    "adoptions",
    "adoptions.csv",
    "id groupId catId adopterId adoptionDate partner adoptionDayId status endedAt notes createdAt updatedAt",
  ),
  s3(
    "adoptionDays",
    "adoption_days.csv",
    "id name startDate endDate partner location status notes createdAt updatedAt",
  ),
  s3(
    "adoptionDayCats",
    "adoption_day_cats.csv",
    "id adoptionDayId catId status overrideReason notes adopterId bookedAt createdAt updatedAt",
  ),
  s3("partnerPlaces", "partner_places.csv", "id name address notes createdAt updatedAt"),
  s3(
    "healthAlerts",
    "health_alerts.csv",
    "id catId disease declaredAt lookbackDays status resolvedAt notes createdAt updatedAt",
  ),
  s3("catEvents", "cat_events.csv", "id catId type date label notes createdAt"),
  s3("tasks", "tasks.csv", "id catId type status dueDate completedAt notes createdAt updatedAt"),
  s3(
    "followUps",
    "follow_ups.csv",
    "id catId adoptionId requestedAt response lastNewsAt createdAt updatedAt",
  ),
  s3(
    "sponsorships",
    "sponsorships.csv",
    "id catId firstName lastName email monthlyAmount startDate endDate paymentNotes notes createdAt updatedAt",
  ),
];

export function tablesForSchema(schemaVersion: number): readonly LegacyTableSpec[] | undefined {
  if (schemaVersion === 3) {
    return SCHEMA_3_TABLES;
  }
  if (schemaVersion === 7) {
    return SCHEMA_7_TABLES;
  }
  return undefined;
}
