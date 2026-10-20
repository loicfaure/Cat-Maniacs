import type { CatProfile } from "../shared/types";

/** Returns the age-based profile for a birth date, or undefined when it is unknown/invalid. */
export function profileForBirthDate(birthDate: string, today = new Date()): CatProfile | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) {
    return undefined;
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText),
    month = Number(monthText),
    day = Number(dayText);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day ||
    birth > today
  ) {
    return undefined;
  }
  let months = (today.getFullYear() - year) * 12 + today.getMonth() + 1 - month;
  if (today.getDate() < day) {
    months--;
  }
  if (months < 2) {
    return "BOTTLE_KITTEN";
  }
  if (months < 6) {
    return "KITTEN";
  }
  if (months < 120) {
    return "ADULT";
  }
  return "SENIOR";
}
