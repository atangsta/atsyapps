"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = { username: string | null; display_name: string | null; avatar_url: string | null };

type RawMessage = {
  id: string;
  text: string;
  created_at: string;
  user_id: string | null;
  profiles?: Profile | Profile[] | null;
  trip_id?: string | null;
};

type Message = {
  id: string;
  text: string;
  created_at: string;
  user_id: string | null;
  profiles?: Profile | null;
};

export default function TripChat({ tripId }: { tripId: string | null }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Message[]>([]);

  const normalize = (raw: RawMessage): Message => ({
    ...raw,
    profiles: Array.isArray(raw.profiles) ? (raw.profiles[0] ?? null) : (raw.profiles ?? null),
  });

  // Per-trip broadcast channel so trips don't hear each other
  const channel = useMemo(() => {
    if (!tripId) return null;
    return supabase.channel(`room-trip-${tripId}`, { config: { broadcast: { self: true } } });
  }, [tripId]);

  const load = async () => {
    if (!tripId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id,text,created_at,user_id, profiles ( username, display_name, avatar_url ), trip_id")
      .eq("trip_id", tripId) // 🔒 REQUIRED for RLS
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase messages load error:", JSON.stringify(error, null, 2));
      setRows([]);
      return;
    }
    const list = (data as RawMessage[] | null) ?? [];
    setRows(list.map(normalize));
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await load();
    })();

    if (!channel) return;
    const sub = channel
      .on("broadcast", { event: "message" }, (payload) => {
        const raw = payload.payload as RawMessage;
        if ((raw as any)?.trip_id === tripId) {
          setRows((prev) => [...prev, normalize(raw)]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channel, tripId]);

  const send = async () => {
    if (!userId) { alert("Please sign in to chat."); return; }
    if (!tripId) { alert("Select or create a trip first."); return; }

    const t = text.trim();
    if (!t) return;

    const { data, error } = await supabase
      .from("messages")
      .insert({ text: t, user_id: userId, trip_id: tripId }) // 🔒 REQUIRED for RLS
      .select("id,text,created_at,user_id, profiles ( username, display_name, avatar_url ), trip_id")
      .single();

    if (error || !data) {
      console.error("Supabase messages insert error:", JSON.stringify(error, null, 2));
      return;
    }

    await channel?.send({ type: "broadcast", event: "message", payload: data });
    setText("");
  };

  const nameOf = (p?: Profile | null) => p?.display_name || p?.username || "Someone";

  if (!tripId) {
    return (
      <div className="border rounded-lg p-3 mt-8 text-sm text-gray-500">
        Select or create a trip to open chat.
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 mt-8">
      <div className="text-lg font-medium mb-2">Chat</div>
      <div className="max-h-64 overflow-y-auto space-y-2 mb-2">
        {rows.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            {m.profiles?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200" />
            )}
            <div>
              <div className="text-sm font-medium">{nameOf(m.profiles)}</div>
              <div className="text-sm">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={userId ? "Type a message" : "Sign in to chat"}
          className="border rounded px-2 py-1 flex-1"
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={!userId}
        />
        <button onClick={send} className="bg-black text-white rounded px-3" disabled={!userId}>
          Send
        </button>
      </div>
    </div>
  );
}






