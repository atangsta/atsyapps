"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthButton from "@/components/AuthButton";
import ProfileForm from "@/components/ProfileForm";
import TripChat from "@/components/TripChat";

type Item = {
  id: string;
  url: string;
  title: string | null;
  image_url: string | null;
  site: string | null;
  type: string | null;
  created_at?: string;
};

export default function Board() {
  const [url, setUrl] = useState("");
  const [type, setType] = useState("restaurant");
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setItems((data as Item[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

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
    });
    if (error) {
      console.error("Insert error:", error);
      return;
    }

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

      {/* Profile editor (username, display name, avatar) */}
      <ProfileForm />

      {/* Saved link cards */}
      <div className="mt-6 space-y-4">
        {items.map((it) => (
          <div key={it.id} className="border rounded-lg overflow-hidden">
            {it.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.image_url}
                alt=""
                className="w-full h-40 object-cover"
              />
            )}
            <div className="p-4">
              <div className="text-xs uppercase text-gray-500">{it.type}</div>
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
              >
                {it.title || it.url}
              </a>
              <div className="text-sm text-gray-500">{it.site}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chat box */}
      <TripChat />
    </div>
  );
}


