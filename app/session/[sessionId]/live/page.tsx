import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveClient } from "@/components/live/live-client";

interface LivePageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function LivePage({ params }: LivePageProps) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: session } = await supabase
    .from("deliberation_sessions")
    .select("id, name, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    redirect("/");
  }

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, quota, sort_order, session_id")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });

  const { data: syncState } = await supabase
    .from("sync_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  let candidate = null;
  if (syncState?.current_candidate_id) {
    const { data } = await supabase
      .from("candidates")
      .select("id, name, role_id")
      .eq("id", syncState.current_candidate_id)
      .maybeSingle();

    if (data) {
      const { data: roleData } = await supabase
        .from("roles")
        .select("name")
        .eq("id", data.role_id)
        .maybeSingle();
      candidate = { ...data, role_name: roleData?.name };
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <LiveClient
          sessionId={sessionId}
          sessionName={session.name}
          sessionStatus={session.status}
          roles={roles ?? []}
          initialSync={syncState}
          initialCandidate={candidate}
        />
      </div>
    </main>
  );
}
