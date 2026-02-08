"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate, Role, SyncState } from "@/lib/db/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Phase2Ballot } from "@/components/phase2/phase2-ballot";

type CandidatePreview = Pick<
  Candidate,
  "id" | "name" | "role_id"
>;

type Phase2Candidate = Pick<Candidate, "id" | "name">;

type Phase2RoleBallot = {
  roleId: string;
  roleName: string;
  quota: number;
  candidates: Phase2Candidate[];
  initialSelectedIds: string[];
  initialSubmitted: boolean;
  initialBallotId: string | null;
};

type Phase1State = {
  phase: "phase1";
  status: "phase1_open" | "phase1_closed";
  viewMode: "role_list" | "candidate_focus";
  sync: SyncState | null;
  candidate: (CandidatePreview & { role_name?: string }) | null;
  vote: string | null;
};

type Phase2State = {
  phase: "phase2";
  status: "phase2_open" | "phase2_closed";
  ballots: Phase2RoleBallot[];
};

type IdleState = {
  phase: "setup" | "archived";
  status: "setup" | "archived";
};

type LiveUIState = Phase1State | Phase2State | IdleState;

interface LiveClientProps {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  roles: Role[];
  initialSync: SyncState | null;
  initialCandidate: (CandidatePreview & { role_name?: string }) | null;
}

const voteLabels = {
  strong_yes: "Strong Yes",
  yes: "Yes",
  no: "No",
} as const;

export function LiveClient({
  sessionId,
  sessionName,
  sessionStatus,
  roles,
  initialSync,
  initialCandidate,
}: LiveClientProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const syncChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionChannelRef = useRef<RealtimeChannel | null>(null);
  const [ui, setUi] = useState<LiveUIState>(() => {
    if (sessionStatus === "phase2_open" || sessionStatus === "phase2_closed") {
      return { phase: "phase2", status: sessionStatus, ballots: [] };
    }
    if (sessionStatus === "phase1_open" || sessionStatus === "phase1_closed") {
      const viewMode =
        initialSync?.view_mode === "candidate_focus" && initialCandidate
          ? "candidate_focus"
          : "role_list";
      return {
        phase: "phase1",
        status: sessionStatus,
        viewMode,
        sync: initialSync,
        candidate: viewMode === "candidate_focus" ? initialCandidate : null,
        vote: null,
      };
    }
    const idle = sessionStatus === "archived" ? "archived" : "setup";
    return { phase: idle, status: idle };
  });
  const [loadingVote, setLoadingVote] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  const ensureRealtimeAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      supabase.realtime.setAuth(token);
    }
  }, [supabase]);

  const loadAllPhase2 = useCallback(async () => {
    setUi((prev) => (prev.phase === "phase2" ? { ...prev, ballots: [] } : prev));

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: candidates } = await supabase
      .from("candidates")
      .select("id, name, role_id")
      .eq("session_id", sessionId)
      .eq("advanced_to_phase2", true)
      .order("name", { ascending: true });

    const { data: ballots } = user
      ? await supabase
          .from("phase2_ballots")
          .select("id, role_id, submitted")
          .eq("session_id", sessionId)
          .eq("user_id", user.id)
      : { data: [] };

    const ballotIds = (ballots ?? []).map((ballot) => ballot.id);
    const { data: selections } = ballotIds.length
      ? await supabase
          .from("phase2_selections")
          .select("ballot_id, candidate_id")
          .in("ballot_id", ballotIds)
      : { data: [] };

    const selectionsByBallot = new Map<string, string[]>();
    (selections ?? []).forEach((selection) => {
      const current = selectionsByBallot.get(selection.ballot_id) ?? [];
      current.push(selection.candidate_id);
      selectionsByBallot.set(selection.ballot_id, current);
    });

    const nextRoles: Phase2RoleBallot[] = roles.map((role) => {
      const roleCandidates = (candidates ?? []).filter(
        (candidate) => candidate.role_id === role.id
      );
      const ballot = (ballots ?? []).find((row) => row.role_id === role.id);
      const selectedIds = ballot ? selectionsByBallot.get(ballot.id) ?? [] : [];

      return {
        roleId: role.id,
        roleName: role.name,
        quota: role.quota,
        candidates: roleCandidates,
        initialSelectedIds: selectedIds,
        initialSubmitted: Boolean(ballot?.submitted),
        initialBallotId: ballot?.id ?? null,
      };
    });

    setUi((prev) => (prev.phase === "phase2" ? { ...prev, ballots: nextRoles } : prev));
  }, [roles, sessionId, supabase]);
  const lastCandidateIdRef = useRef<string | null>(initialSync?.current_candidate_id ?? null);

  const loadCurrent = useCallback(
    async (candidateId?: string | null) => {
      if (!candidateId) {
        return { candidate: null, vote: null };
      }

      const { data: candidateData } = await supabase
        .from("candidates")
        .select("id, name, role_id")
        .eq("id", candidateId)
        .maybeSingle();

      const { data: roleData } = candidateData
        ? await supabase.from("roles").select("name").eq("id", candidateData.role_id).maybeSingle()
        : { data: null };

      const candidate = candidateData ? { ...candidateData, role_name: roleData?.name } : null;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && candidateData) {
        const { data: voteData } = await supabase
          .from("phase1_votes")
          .select("vote")
          .eq("candidate_id", candidateData.id)
          .eq("session_id", sessionId)
          .eq("user_id", user.id)
          .maybeSingle();

        return { candidate, vote: voteData?.vote ?? null };
      }

      return { candidate, vote: null };
    },
    [sessionId, supabase]
  );

  const phase1Open = ui.phase === "phase1" && ui.status === "phase1_open";
  const phase1Closed = ui.phase === "phase1" && ui.status === "phase1_closed";

  const refreshState = useCallback(async () => {
    const { data: nextSession } = await supabase
      .from("deliberation_sessions")
      .select("status")
      .eq("id", sessionId)
      .maybeSingle();

    const nextStatus = nextSession?.status;
    if (!nextStatus) return;

    if (nextStatus === "phase2_open" || nextStatus === "phase2_closed") {
      setUi((prev) => ({
        phase: "phase2",
        status: nextStatus,
        ballots: prev.phase === "phase2" ? prev.ballots : [],
      }));
      void loadAllPhase2();
      return;
    }

    if (nextStatus === "phase1_open" || nextStatus === "phase1_closed") {
      const { data: nextSync } = await supabase
        .from("sync_state")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      const viewMode =
        nextSync?.view_mode === "candidate_focus" && nextSync.current_candidate_id
          ? "candidate_focus"
          : "role_list";

      if (viewMode === "candidate_focus" && nextSync?.current_candidate_id) {
        const { candidate, vote } = await loadCurrent(nextSync.current_candidate_id);
        lastCandidateIdRef.current = nextSync.current_candidate_id;
        setUi({
          phase: "phase1",
          status: nextStatus,
          viewMode,
          sync: nextSync,
          candidate,
          vote,
        });
      } else {
        setUi({
          phase: "phase1",
          status: nextStatus,
          viewMode: "role_list",
          sync: nextSync ?? null,
          candidate: null,
          vote: null,
        });
      }
      return;
    }

    const idle = nextStatus === "archived" ? "archived" : "setup";
    setUi({ phase: idle, status: idle });
  }, [sessionId, supabase, loadCurrent, loadAllPhase2]);

  const subscribeChannels = useCallback(async () => {
    await ensureRealtimeAuth();
    if (syncChannelRef.current) {
      supabase.removeChannel(syncChannelRef.current);
    }
    if (sessionChannelRef.current) {
      supabase.removeChannel(sessionChannelRef.current);
    }

    syncChannelRef.current = supabase
      .channel(`sync-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const nextSync = payload.new as SyncState;
          if (uiRef.current.phase !== "phase1") {
            return;
          }
          const nextViewMode =
            nextSync.view_mode === "candidate_focus" ? "candidate_focus" : "role_list";
          if (nextViewMode === "candidate_focus" && nextSync.current_candidate_id) {
            void (async () => {
              const { candidate, vote } = await loadCurrent(nextSync.current_candidate_id);
              setUi((prev) =>
                prev.phase === "phase1"
                  ? {
                      ...prev,
                      viewMode: "candidate_focus",
                      sync: nextSync,
                      candidate,
                      vote,
                    }
                  : prev
              );
              if (
                nextSync.current_candidate_id &&
                nextSync.current_candidate_id !== lastCandidateIdRef.current
              ) {
                setToast("Now viewing a new candidate.");
                setTimeout(() => setToast(null), 2000);
                lastCandidateIdRef.current = nextSync.current_candidate_id;
              }
            })();
          } else {
            setUi((prev) =>
              prev.phase === "phase1"
                ? { ...prev, viewMode: "role_list", sync: nextSync, candidate: null, vote: null }
                : prev
            );
          }
        }
      )
      .subscribe();

    sessionChannelRef.current = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliberation_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string };
          if (next?.status) {
            void refreshState();
          }
        }
      )
      .subscribe();
  }, [sessionId, supabase, loadCurrent, ensureRealtimeAuth, refreshState]);

  useEffect(() => {
    void subscribeChannels();
    if (uiRef.current.phase === "phase2") {
      void loadAllPhase2();
    }
    return () => {
      if (syncChannelRef.current) {
        supabase.removeChannel(syncChannelRef.current);
      }
      if (sessionChannelRef.current) {
        supabase.removeChannel(sessionChannelRef.current);
      }
    };
  }, [subscribeChannels, supabase]);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === "visible") {
        refreshState();
        void subscribeChannels();
      }
    };

    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);

    return () => {
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [refreshState, subscribeChannels]);

  const handleVote = async (value: string) => {
    if (ui.phase !== "phase1" || !ui.candidate) return;
    setLoadingVote(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadingVote(false);
      return;
    }

    await supabase.from("phase1_votes").upsert({
      session_id: sessionId,
      candidate_id: ui.candidate.id,
      user_id: user.id,
      vote: value,
      updated_at: new Date().toISOString(),
    });

    setUi((prev) => (prev.phase === "phase1" ? { ...prev, vote: value } : prev));
    setLoadingVote(false);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{sessionName}</h2>
          </div>
          <Badge>{ui.status.replaceAll("_", " ")}</Badge>
        </div>
      </header>

      {ui.phase === "phase1" && ui.viewMode === "candidate_focus" && ui.candidate ? (
        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold">{ui.candidate.name}</h3>
              <p className="text-sm text-muted-foreground">{ui.candidate.role_name ?? ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(voteLabels).map(([value, label]) => (
              <Button
                key={value}
                variant={ui.vote === value ? "default" : "secondary"}
                onClick={() => handleVote(value)}
                disabled={!phase1Open || loadingVote}
              >
                {label}
              </Button>
            ))}
          </div>
          {phase1Closed ? (
            <p className="text-sm text-muted-foreground">
              Phase 1 is closed. Your last vote is locked.
            </p>
          ) : null}
        </Card>
      ) : null}

      {ui.phase === "phase2" ? (
        <div className="space-y-4">
          {ui.ballots.map((role) => (
              <Phase2Ballot
                key={role.roleId}
                sessionId={sessionId}
                roleId={role.roleId}
                roleName={role.roleName}
                quota={role.quota}
                candidates={role.candidates}
                initialSelectedIds={role.initialSelectedIds}
                initialSubmitted={role.initialSubmitted}
                initialBallotId={role.initialBallotId}
                sessionStatus={ui.status}
                variant="embedded"
              />
            ))}
        </div>
      ) : null}

      {ui.phase === "phase1" && ui.viewMode === "role_list" ? (
        <Card className="p-4">
          <h3 className="text-xl font-semibold">Waiting for facilitator</h3>
          <p className="text-sm text-muted-foreground">
            Stay on this page. The facilitator will advance candidates live.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-md border border-border bg-card p-4"
              >
                <p className="text-sm font-medium">{role.name}</p>
                <p className="text-xs text-muted-foreground">Quota: {role.quota}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {toast ? (
        <div className="fixed right-4 top-4 z-50 rounded-md border bg-card px-3 py-2 text-xs font-medium shadow-sm">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
