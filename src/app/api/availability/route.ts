import { NextResponse } from "next/server";
import { daysBetween, parseProvider, openTableLink, resyLink } from "@/lib/reservations/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Slot = { iso: string; label: string; bookUrl?: string };

const USE_SCRAPER = process.env.USE_SCRAPER === "1";
const MAX_DAYS = 5;
const CACHE_TTL_MS = 10 * 60 * 1000;
const mem = new Map<string, { expires: number; slots: Slot[] }>();

function toLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

async function tryScrapeOpenTableDay(args: { url: string; date: string; partySize: number }) {
  try {
    const mod = await import("@/lib/reservations/opentable_scrape");
    return (await mod.scrapeOpenTableDay(args)) as Slot[];
  } catch { return []; }
}
async function tryScrapeResyDay(args: { url: string; date: string; partySize: number }) {
  try {
    const mod = await import("@/lib/reservations/resy_scrape");
    return (await mod.scrapeResyDay(args)) as Slot[];
  } catch { return []; }
}

export async function POST(req: Request) {
  try {
    let body: any = null;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { url, start, end, partySize: rawPartySize = 2, tz = "America/New_York" } = body ?? {};
    if (!url || !start || !end) return NextResponse.json({ error: "Missing url/start/end" }, { status: 400 });

    const partySize = Number(rawPartySize || 2) || 2;
    const provider = parseProvider(url);
    const days = daysBetween(start, end, tz).slice(0, MAX_DAYS);
    if (days.length === 0) return NextResponse.json({ slots: [] });

    const key = `${provider}|${url}|${partySize}|${days.join(",")}`;
    const cached = mem.get(key);
    if (cached && cached.expires > Date.now()) return NextResponse.json({ slots: cached.slots, _cache: "hit" });

    let slots: Slot[] = [];
    if (USE_SCRAPER) {
      for (const d of days) {
        if (provider === "opentable") slots.push(...(await tryScrapeOpenTableDay({ url, date: d, partySize })));
        else if (provider === "resy") slots.push(...(await tryScrapeResyDay({ url, date: d, partySize })));
      }
    }

    if (slots.length === 0) {
      const mk = provider === "opentable" ? openTableLink : resyLink;
      for (const d of days) {
        for (const hh of [17, 18, 19]) {
          const hhmm = `${String(hh).padStart(2, "0")}:00`;
          slots.push({ iso: `${d}T${hhmm}:00`, label: toLabel(hhmm), bookUrl: mk(url, d, partySize, hhmm) });
        }
      }
    }

    mem.set(key, { expires: Date.now() + CACHE_TTL_MS, slots });
    return NextResponse.json({ slots, _cache: "miss" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

