import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface DashboardPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
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
    .select("id, name, quota, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, name, role_id, admin_bucket, advanced_to_phase2")
    .eq("session_id", sessionId);

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

  return (
    <main className="min-h-screen bg-background px-8 py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="text-4xl font-semibold">{session.name}</h1>
          <p className="text-sm text-muted-foreground">Status: {session.status}</p>
        </header>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">Phase 1 summary</h2>
          {(roles ?? []).map((role) => {
            const roleCandidates = (candidates ?? []).filter((candidate) => candidate.role_id === role.id);
            return (
              <div key={role.id} className="rounded-lg border bg-card p-6">
                <h3 className="text-xl font-semibold">{role.name}</h3>
                <div className="mt-4 space-y-4">
                  {roleCandidates.map((candidate) => {
                    const counts = voteCounts.get(candidate.id) ?? { strong_yes: 0, yes: 0, no: 0 };
                    const total = counts.strong_yes + counts.yes + counts.no || 1;
                    const strongPct = (counts.strong_yes / total) * 100;
                    const yesPct = (counts.yes / total) * 100;
                    const noPct = (counts.no / total) * 100;

                    return (
                      <div key={candidate.id} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{candidate.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {counts.strong_yes} / {counts.yes} / {counts.no}
                          </span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${strongPct}%` }}
                          />
                          <div className="h-full bg-secondary" style={{ width: `${yesPct}%` }} />
                          <div className="h-full bg-destructive" style={{ width: `${noPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">Phase 2 summary</h2>
          {(roles ?? []).map((role) => {
            const roleCandidates = (candidates ?? []).filter((candidate) => candidate.role_id === role.id);
            const sorted = [...roleCandidates].sort(
              (a, b) => (inclusionCounts.get(b.id) ?? 0) - (inclusionCounts.get(a.id) ?? 0)
            );
            const submittedCount = (ballots ?? []).filter((ballot) => ballot.role_id === role.id && ballot.submitted)
              .length;
            const totalCount = (ballots ?? []).filter((ballot) => ballot.role_id === role.id).length;

            return (
              <div key={role.id} className="rounded-lg border bg-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{role.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {submittedCount}/{totalCount} submitted
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {sorted.map((candidate, index) => {
                    const votesCount = inclusionCounts.get(candidate.id) ?? 0;
                    const width = Math.max(10, votesCount * 8);
                    return (
                      <div key={candidate.id} className="flex items-center gap-3">
                        <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
                        <div className="flex-1 rounded-full bg-muted">
                          <div
                            className="rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                            style={{ width }}
                          >
                            {candidate.name}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{votesCount}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
