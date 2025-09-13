"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthButton() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .single();
        setAvatarUrl((data as any)?.avatar_url ?? null);
      }
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // 👇 return to the board page after Google completes
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/board`
          : undefined,
    },
  });
};

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!userEmail) {
    return (
      <button
        onClick={signInGoogle}
        className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
      >
        Log in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gray-300" />
      )}
      <span className="text-sm text-gray-700">{userEmail}</span>
      <button
        onClick={signOut}
        className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  );
}
