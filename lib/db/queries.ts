import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentUserProfile() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, name, email, app_role")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export async function getSession(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  return supabase
    .from("deliberation_sessions")
    .select("id, name, status")
    .eq("id", sessionId)
    .single();
}

export async function getRoles(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  return supabase
    .from("roles")
    .select("id, name, quota, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
}

export async function getCandidates(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  return supabase
    .from("candidates")
    .select("*")
    .eq("session_id", sessionId)
    .order("slide_order", { ascending: true });
}

export async function getSyncState(sessionId: string) {
  const supabase = await createServerSupabaseClient();
  return supabase
    .from("sync_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
}
