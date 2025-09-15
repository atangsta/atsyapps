"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Trip = { id: string; name: string; start_date: string | null; end_date: string | null };

export default function TripBar({
  onTripChange,
  trip,
}: {
  onTripChange: (t: Trip | null) => void;
  trip?: Trip | null;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(trip?.id ?? null);

  const [newName, setNewName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  // Load trips visible to the current user (owner or member via RLS)
  const loadTrips = async () => {
    const { data, error } = await supabase
      .from("trips")
      .select("id,name,start_date,end_date")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadTrips error:", JSON.stringify(error, null, 2));
      setTrips([]);
      return;
    }
    setTrips((data as Trip[]) ?? []);
  };

  useEffect(() => {
    loadTrips();
  }, []);

  useEffect(() => {
    if (!selectedTripId) {
      onTripChange(null);
      return;
    }
    const t = trips.find((x) => x.id === selectedTripId) ?? null;
    onTripChange(t ?? null);
  }, [selectedTripId, trips, onTripChange]);

  const createTrip = async () => {
  const name = newName.trim();
  if (!name) return;

  setBusy(true);
  try {
    // ensure we have a session; otherwise auth.uid() in the RPC will be null
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      alert("Please sign in first.");
      return;
    }

    // Call the RPC instead of raw insert
    const { data, error } = await supabase.rpc("create_trip", {
      p_name: name,
      p_start: start || null,
      p_end: end || null,
    });

    if (error) {
      console.error("create_trip RPC error:", JSON.stringify(error, null, 2));
      return;
    }

    // data is the inserted trip row
    setTrips((prev) => [data as Trip, ...prev]);
    setSelectedTripId((data as Trip).id);
    setNewName(""); setStart(""); setEnd("");
  } finally {
    setBusy(false);
  }
};


  return (
    <div className="mt-4 rounded border p-4 space-y-4">
      {/* Trip selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Trip</label>
        <select
          className="border rounded px-3 py-2"
          value={selectedTripId ?? ""}
          onChange={(e) => setSelectedTripId(e.target.value || null)}
        >
          {trips.length === 0 && <option value="">No trips</option>}
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* New trip creator */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border rounded px-3 py-2 min-w-[14rem] flex-1"
          placeholder="New trip name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <button
          onClick={createTrip}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-white"
        >
          {busy ? "Creating…" : "Create trip"}
        </button>
      </div>
    </div>
  );
}


