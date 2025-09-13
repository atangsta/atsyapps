"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function ProfileForm() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const p = data as Profile | null;
      setProfile(p);
      setUsername(p?.username ?? "");
      setDisplayName(p?.display_name ?? "");
    })();
  }, []);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      username: username || null,
      display_name: displayName || null,
      avatar_url: profile?.avatar_url ?? null,
    });
    if (error) setError(error.message);
    else {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      setProfile(data as Profile);
    }
    setSaving(false);
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = pub.publicUrl;
    const { error: profErr } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
    if (profErr) setError(profErr.message);
    else setProfile((p) => p ? { ...p, avatar_url: avatarUrl } : p);
  };

    if (!userId) {
    return <div className="text-sm text-gray-600">Sign in to edit your profile.</div>;
  }

  return (
    <div className="border rounded-lg p-4 mt-6">
      <div className="text-lg font-medium mb-3">Your Profile</div>

      <div className="flex items-center gap-4 mb-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-200" />
        )}
        <input type="file" accept="image/*" onChange={onAvatarChange} />
      </div>

      <div className="flex flex-col gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username (unique)"
          className="border rounded px-3 py-2"
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          className="border rounded px-3 py-2"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white rounded px-4 py-2"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
