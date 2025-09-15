"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthButton from "@/components/AuthButton";
import ProfileForm from "@/components/ProfileForm";
import TripChat from "@/components/TripChat";
import TripBar from "@/components/TripBar";
import Availability from "@/components/Availability";

type Item = {
  id: string;
  url: string;
  title: string | null;
  image_url: string | null;
  site: string | null;
  type: string | null;
  created_at?: string;
  trip_id?: string | null;
};

type Trip = { id: string; name: string; start_date: string | null; end_date: string | null };

export default function Board() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("restaurant");
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    if (!trip) { setItems([]); return; }
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false });
    if (!error) setItems((data as Item[]) || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  const add = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trip) { alert("Pick or create a trip first."); return; }

    // Unfurl page metadata
    const r = await fetch("/api/unfurl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });
    const meta = await r.json();

    // Save to Supabase
    const { error } = await supabase.from("items").insert({
      url: trimmed,
      type,
      title: meta.title ?? null,
      image_url: meta.image ?? null,
      site: meta.site ?? null,
      trip_id: trip.id,
    });
    if (error) { console.error("Insert error:", error); return; }

    setUrl("");
    load();
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header with title + auth */}
      <h1 className="text-2xl font-semibold flex items-center justify-between">
        <span>Trip Board</span>
        <AuthButton />
      </h1>

      {/* Trip selector / creator */}
      <TripBar onTripChange={setTrip} />

      {/* Link input row */}
      <div className="mt-4 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link"
          className="border rounded px-3 py-2 flex-1"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option>restaurant</option>
          <option>hotel</option>
          <option>activity</option>
          <option>flight</option>
        </select>
        <button onClick={add} className="bg-black text-white rounded px-4">
          Add
        </button>
      </div>

      {/* Profile editor */}
      <ProfileForm />

      {/* Saved link cards */}
      <div className="mt-6 space-y-4">
        {items.map((it) => (
          <div key={it.id} className="border rounded-lg overflow-hidden">
            {it.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="" className="w-full h-40 object-cover" />
            )}
            <div className="p-4">
              <div className="text-xs uppercase text-gray-500">{it.type}</div>
              <a href={it.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {it.title || it.url}
              </a>
              <div className="text-sm text-gray-500">{it.site}</div>

              {/* Availability widget only for restaurants */}
              {it.type === "restaurant" && trip && (
                <Availability url={it.url} start={trip.start_date} end={trip.end_date} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chat box — pass the selected trip's id */}
      <TripChat tripId={trip?.id ?? null} />
    </div>
  );
}





