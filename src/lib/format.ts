import type { Sport } from "./types";

export const TIME_ZONE = "Europe/Brussels";

const SPORT_LABELS: Record<Sport, string> = { tennis: "Tennis", padel: "Padel" };

export function sportLabel(sport: Sport): string {
  return SPORT_LABELS[sport];
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// "4/11 18:29": short enough for a table column.
export function formatShortDateTime(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("nl-BE", { timeZone: TIME_ZONE, day: "numeric", month: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("nl-BE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export function formatDay(iso: string): { day: string; month: string } {
  const date = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("nl-BE", { timeZone: TIME_ZONE, day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat("nl-BE", { timeZone: TIME_ZONE, month: "short" }).format(date),
  };
}

export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export function isPast(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}

export function registrationClosesAt(event: {
  starts_at: string;
  registration_deadline: string | null;
}): Date {
  return new Date(event.registration_deadline ?? event.starts_at);
}

export function isRegistrationOpen(event: {
  starts_at: string;
  registration_deadline: string | null;
}): boolean {
  return Date.now() < registrationClosesAt(event).getTime();
}

// Minutes the Brussels clock is ahead of UTC at the given instant.
function brusselsOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

// "2026-10-12T14:00" as typed in a datetime-local field (Brussels time) to ISO.
export function brusselsInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const wallClock = Date.UTC(y, m - 1, d, h, min);
  let instant = wallClock - brusselsOffsetMinutes(new Date(wallClock)) * 60000;
  // A second pass corrects the offset around daylight saving changes.
  instant = wallClock - brusselsOffsetMinutes(new Date(instant)) * 60000;
  return new Date(instant).toISOString();
}

// ISO timestamp to the "YYYY-MM-DDTHH:mm" value of a datetime-local field.
export function isoToBrusselsInput(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
