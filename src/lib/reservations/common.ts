// src/lib/reservations/common.ts

/** Parse the provider from a pasted URL */
export function parseProvider(raw: string): "opentable" | "resy" | "unknown" {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.includes("opentable")) return "opentable";
    if (host.includes("resy")) return "resy";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Inclusive list of YYYY-MM-DD strings between start and end (naive, UTC-based) */
export function daysBetween(startISO: string, endISO: string, _tz: string = "UTC"): string[] {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const out: string[] = [];

  // normalize to UTC midnight for each day
  const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const stop = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));

  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Build an OpenTable deep link with date/party/time prefilled */
export function openTableLink(url: string, date: string, party: number, time?: string) {
  const u = new URL(url);
  u.searchParams.set("covers", String(party));
  if (time) u.searchParams.set("dateTime", `${date}T${time}`);
  else u.searchParams.set("date", date);
  return u.toString();
}

/** Build a Resy deep link with date/party/time prefilled */
export function resyLink(url: string, date: string, party: number, time?: string) {
  const u = new URL(url);
  u.searchParams.set("date", date);
  u.searchParams.set("seats", String(party));
  if (time) u.searchParams.set("time", time);
  return u.toString();
}

