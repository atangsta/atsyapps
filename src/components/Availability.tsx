"use client";
import { useEffect, useState } from "react";

type Props = { url: string; start: string | null; end: string | null; partySize?: number; tz?: string };
type Slot = { iso: string; label: string; bookUrl?: string };

export default function Availability({ url, start, end, partySize = 2, tz = "America/New_York" }: Props) {
  console.log("[Availability v4] mounted", { url, start, end });

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || !start || !end) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSlots([]);

      try {
        const r = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, start, end, partySize, tz }),
        });

        const raw = await r.text();        // <-- read raw first
        console.log("[Availability v4] /api/availability", r.status, raw.slice(0, 200));

        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(`Bad JSON from API (status ${r.status}): ${raw.slice(0, 280)}`);
        }

        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        setSlots(Array.isArray(data.slots) ? data.slots : []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load availability");
      } finally {
        setLoading(false);
      }
    })();
  }, [url, start, end, partySize, tz]);

  if (!start || !end) return null;

  return (
    <div className="mt-3 border rounded p-3">
      <div className="text-sm text-gray-600 mb-2">Availability ({start} → {end})</div>
      {loading && <div className="text-sm">Checking…</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}
      {!loading && !error && slots.length === 0 && <div className="text-sm text-gray-500">No slots found.</div>}
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <a key={s.iso + (s.bookUrl || "")}
             href={s.bookUrl || "#"} target={s.bookUrl ? "_blank" : undefined} rel="noreferrer"
             className="px-3 py-1 rounded border text-sm hover:bg-gray-50">
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}




