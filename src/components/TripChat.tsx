"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = { username: string | null; display_name: string | null; avatar_url: string | null };

// Supabase can return profiles as an object, an array, or null, so accept all and normalize.
type RawMessage = {
  id: string;
  text: string;
  created_at: string;
  user_id: string | null;
  // Supabase join can be object or array depending on FK naming
  profiles?: Profile | Profile[] | null;
};

type Message = {
  id: string;
  text: string;
  created_at: string;
  user_id: string | null;
  profiles?: Profile | null;
};

export default function TripChat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Message[]>([]);

  // Normalize profiles: if array, take first; if object, keep; else null
  const normalize = (raw: RawMessage): Message => ({
    ...raw,
    profiles: Array.isArray(raw.profiles)
      ? (raw.profiles[0] ?? null)
      : (raw.profiles ?? null),
  });

  const load = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id,text,created_at,user_id, profiles ( username, display_name, avatar_url )"
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    const list = (data as RawMessage[] | null) ?? [];
    setRows(list.map(normalize));
  };

  // Broadcast channel (works without replication)
  const channel = useMemo(
    () => supabase.channel("room-global", { config: { broadcast: { self: true } } }),
    []
  );

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await load();
    })();

    const sub = channel
      .on("broadcast", { event: "message" }, (payload) => {
        const raw = payload.payload as RawMessage;
        setRows((prev) => [...prev, normalize(raw)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channel]);

  const send = async () => {
    if (!userId) { alert("Please sign in to chat."); return; }
    const t = text.trim();
    if (!t) return;

    // Insert with user_id and return joined profile
    const { data, error } = await supabase
      .from("messages")
      .insert({ text: t, user_id: userId })
      .select("id,text,created_at,user_id, profiles ( username, display_name, avatar_url )")
      .single();

    if (error || !data) {
      console.error(error);
      return;
    }

    // Broadcast inserted row so all clients update instantly
    await channel.send({ type: "broadcast", event: "message", payload: data });
    setText("");
  };

  const nameOf = (p?: Profile | null) => p?.display_name || p?.username || "Someone";

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





