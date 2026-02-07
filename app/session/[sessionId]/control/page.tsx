import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ControlPanel } from "@/components/control/control-panel";

interface ControlPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function ControlPage({ params }: ControlPageProps) {
  const { sessionId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("app_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.app_role === "voter") {
    redirect(`/session/${sessionId}/live`);
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

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, name, role_id, slide_order, advanced_to_phase2")
    .eq("session_id", sessionId);

  const { data: syncState } = await supabase
    .from("sync_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: votes } = await supabase
    .from("phase1_votes")
    .select("candidate_id, vote")
    .eq("session_id", sessionId);

  const voteCounts = new Map<string, { strong_yes: number; yes: number; no: number }>();
  (votes ?? []).forEach((vote) => {
    const current = voteCounts.get(vote.candidate_id) ?? { strong_yes: 0, yes: 0, no: 0 };
    if (vote.vote === "strong_yes") current.strong_yes += 1;
    if (vote.vote === "yes") current.yes += 1;
    if (vote.vote === "no") current.no += 1;
    voteCounts.set(vote.candidate_id, current);
  });

  const roleNameById = new Map((roles ?? []).map((role) => [role.id, role.name]));

  const phase1Aggregates = (candidates ?? []).map((candidate) => {
    const counts = voteCounts.get(candidate.id) ?? { strong_yes: 0, yes: 0, no: 0 };
    const total = counts.strong_yes + counts.yes + counts.no || 1;
    const percentYes = ((counts.strong_yes + counts.yes) / total) * 100;
    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      roleName: roleNameById.get(candidate.role_id) ?? "",
      strongYes: counts.strong_yes,
      yes: counts.yes,
      no: counts.no,
      percentYes,
      advancedToPhase2: candidate.advanced_to_phase2,
    };
  });

  const { data: ballots } = await supabase
    .from("phase2_ballots")
    .select("id, role_id, submitted")
    .eq("session_id", sessionId);

  const ballotIds = (ballots ?? []).map((ballot) => ballot.id);
  const { data: selections } = ballotIds.length
    ? await supabase
        .from("phase2_selections")
        .select("ballot_id, candidate_id")
        .in("ballot_id", ballotIds)
    : { data: [] };

  const inclusionCounts = new Map<string, number>();
  (selections ?? []).forEach((selection) => {
    inclusionCounts.set(selection.candidate_id, (inclusionCounts.get(selection.candidate_id) ?? 0) + 1);
  });

  const phase2Results = (candidates ?? []).map((candidate) => ({
    candidateId: candidate.id,
    candidateName: candidate.name,
    roleId: candidate.role_id,
    roleName: roleNameById.get(candidate.role_id) ?? "",
    inclusionVotes: inclusionCounts.get(candidate.id) ?? 0,
  }));

  const submissionCounts = (roles ?? []).map((role) => {
    const totalCount = (ballots ?? []).filter((ballot) => ballot.role_id === role.id).length;
    const submittedCount = (ballots ?? []).filter(
      (ballot) => ballot.role_id === role.id && ballot.submitted
    ).length;
    return {
      roleId: role.id,
      roleName: role.name,
      submittedCount,
      totalCount,
    };
  });

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <ControlPanel
          sessionId={sessionId}
          sessionName={session.name}
          sessionStatus={session.status}
          roles={roles ?? []}
          candidates={candidates ?? []}
          syncState={syncState}
          phase1Aggregates={phase1Aggregates}
          phase2Results={phase2Results}
          submissionCounts={submissionCounts}
        />
      </div>
    </main>
  );
}
