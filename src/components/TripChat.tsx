"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TripChat() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    // load existing messages
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });
      setRows(data || []);
    })();

    // subscribe to realtime inserts
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => setRows((prev) => [...prev, payload.new as any])
      )
      .subscribe();

    // ✅ cleanup must not return a Promise
    return () => {
      // fire-and-forget; ignore the Promise
      supabase.removeChannel(channel);
    };
  }, []);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await supabase.from("messages").insert({ text: t });
    setText("");
  };

  return (
    <div className="border rounded-lg p-3 mt-8">
      <div className="text-lg font-medium mb-2">Chat</div>
      <div className="max-h-64 overflow-y-auto space-y-1 mb-2">
        {rows.map((m) => (
          <div key={m.id} className="text-sm">
            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          className="border rounded px-2 py-1 flex-1"
        />
        <button onClick={send} className="bg-black text-white rounded px-3">
          Send
        </button>
      </div>
    </div>
  );
}


