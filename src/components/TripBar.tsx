"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Trip = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

export default function TripBar({
  onTripChange,
}: {
  onTripChange: (t: Trip | null) => void;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const loadTrips = async () => {
    const { data } = await supabase
      .from("trips")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as Trip[]) || [];
    setTrips(list);
    if (!selected && list.length) {
      setSelected(list[0].id);
      onTripChange(list[0]);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await loadTrips();
    })();
  }, []);

  const createTrip = async () => {
    if (!userId) { alert("Sign in to create a trip."); return; }
    if (!name) { alert("Trip needs a name."); return; }
    const { data, error } = await supabase
      .from("trips")
      .insert({
        name,
        owner_id: userId,
        start_date: start || null,
        end_date: end || null,
      })
      .select("*")
      .single();
    if (error) { console.error(error); return; }
    setName(""); setStart(""); setEnd("");
    await loadTrips();
    setSelected((data as Trip).id);
    onTripChange(data as Trip);
  };

  const onSelect = (id: string) => {
    setSelected(id);
    const t = trips.find(tr => tr.id === id) || null;
    onTripChange(t);
  };

  return (
    <div className="mt-4 border rounded p-3">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-600">Trip</label>
          <select
            className="border rounded w-full px-3 py-2"
            value={selected ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {trips.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.start_date ? `(${t.start_date} → ${t.end_date || "?"})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="text-xs text-gray-600">New trip name</label>
          <input className="border rounded w-full px-3 py-2" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Japan Spring 2026" />
        </div>
        <div>
          <label className="text-xs text-gray-600">Start</label>
          <input type="date" className="border rounded px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-600">End</label>
          <input type="date" className="border rounded px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} />
        </div>
        <button onClick={createTrip} className="bg-black text-white rounded px-4 py-2">Create trip</button>
      </div>
    </div>
  );
}
