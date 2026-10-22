import type { Dataset, HealthAlert, HealthExposure } from "../core/types";

interface LocationInterval {
  animalId: string;
  locationType: "FAMILY" | "REFUGE_ZONE";
  locationId: string;
  locationLabel: string;
  start: string;
  end: string;
}

export function findHealthExposures(dataset: Dataset, alert: HealthAlert): HealthExposure[] {
  const windowEnd = alert.declaredAt;
  const date = new Date(`${alert.declaredAt}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - alert.lookbackDays);
  const windowStart = date.toISOString().slice(0, 10);
  const intervals = buildIntervals(dataset, windowEnd);
  const sickIntervals = intervals.filter(
    (interval) =>
      interval.animalId === alert.animalId &&
      overlaps(interval.start, interval.end, windowStart, windowEnd),
  );
  const seen = new Set<string>();
  const exposures: HealthExposure[] = [];

  for (const sick of sickIntervals) {
    for (const candidate of intervals) {
      if (
        candidate.animalId === alert.animalId ||
        candidate.locationType !== sick.locationType ||
        candidate.locationId !== sick.locationId
      ) {
        continue;
      }
      const overlapStart = maxDate(sick.start, candidate.start, windowStart);
      const overlapEnd = minDate(sick.end, candidate.end, windowEnd);
      if (overlapStart > overlapEnd) {
        continue;
      }
      const key = `${candidate.animalId}:${candidate.locationType}:${candidate.locationId}:${overlapStart}:${overlapEnd}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      exposures.push({
        animalId: candidate.animalId,
        locationType: candidate.locationType,
        locationId: candidate.locationId,
        locationLabel: candidate.locationLabel,
        overlapStart,
        overlapEnd,
      });
    }
  }
  return exposures.sort((left, right) => left.overlapStart.localeCompare(right.overlapStart));
}

function buildIntervals(dataset: Dataset, activeEnd: string): LocationInterval[] {
  const intervals: LocationInterval[] = [
    ...dataset.fosterPlacements.map(
      (placement): LocationInterval => ({
        animalId: placement.animalId,
        locationType: "FAMILY",
        locationId: placement.familyId,
        locationLabel:
          dataset.families.find((family) => family.id === placement.familyId)?.label ??
          "Famille inconnue",
        start: placement.startDate,
        end: placement.endDate || activeEnd,
      }),
    ),
    ...dataset.refugeStays.map(
      (stay): LocationInterval => ({
        animalId: stay.animalId,
        locationType: "REFUGE_ZONE",
        locationId: stay.zoneId,
        locationLabel: `Le refuge · ${dataset.refugeZones.find((zone) => zone.id === stay.zoneId)?.name ?? "Zone inconnue"}`,
        start: stay.startDate,
        end: stay.endDate || activeEnd,
      }),
    ),
  ];
  return intervals;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return maxDate(aStart, bStart) <= minDate(aEnd, bEnd);
}
function maxDate(...values: string[]): string {
  return values.sort().at(-1) ?? "";
}
function minDate(...values: string[]): string {
  return values.sort()[0];
}
