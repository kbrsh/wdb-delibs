import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Phase2Ballot } from "@/components/phase2/phase2-ballot";

interface Phase2PageProps {
  params: Promise<{ sessionId: string; roleId: string }>;
}

export default async function Phase2Page({ params }: Phase2PageProps) {
  const { sessionId, roleId } = await params;
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

  const { data: role } = await supabase
    .from("roles")
    .select("id, name, quota")
    .eq("id", roleId)
    .maybeSingle();

  if (!role) {
    redirect(`/session/${sessionId}/live`);
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, name, airtable_url, photo_url")
    .eq("role_id", roleId)
    .eq("advanced_to_phase2", true)
    .order("name", { ascending: true });

  const { data: ballot } = await supabase
    .from("phase2_ballots")
    .select("id, submitted")
    .eq("session_id", sessionId)
    .eq("role_id", roleId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: selections } = ballot
    ? await supabase
        .from("phase2_selections")
        .select("candidate_id")
        .eq("ballot_id", ballot.id)
    : { data: [] };

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <Phase2Ballot
          sessionId={sessionId}
          roleId={roleId}
          roleName={role.name}
          quota={role.quota}
          candidates={candidates ?? []}
          initialSelectedIds={(selections ?? []).map((selection) => selection.candidate_id)}
          initialSubmitted={Boolean(ballot?.submitted)}
          initialBallotId={ballot?.id ?? null}
          sessionStatus={session.status}
        />
      </div>
    </main>
  );
}
