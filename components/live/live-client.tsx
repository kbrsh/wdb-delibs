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

type Phase2PanelState =
  | { kind: "hidden" }
  | {
      kind: "loaded";
      roles: Array<{
        roleId: string;
        roleName: string;
        quota: number;
        candidates: Phase2Candidate[];
        initialSelectedIds: string[];
        initialSubmitted: boolean;
        initialBallotId: string | null;
      }>;
    };

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
  const [currentStatus, setCurrentStatus] = useState(sessionStatus);
  const [syncState, setSyncState] = useState<SyncState | null>(initialSync);
  const [candidate, setCandidate] = useState<(CandidatePreview & { role_name?: string }) | null>(
    initialCandidate
  );
  const [vote, setVote] = useState<string | null>(null);
  const [loadingVote, setLoadingVote] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [phase2Panel, setPhase2Panel] = useState<Phase2PanelState>(
    sessionStatus === "phase2_open" || sessionStatus === "phase2_closed"
      ? { kind: "loaded", roles: [] }
      : { kind: "hidden" }
  );

  const viewMode = syncState?.view_mode ?? "role_list";

  const ensureRealtimeAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      supabase.realtime.setAuth(token);
    }
  }, [supabase]);

  const loadAllPhase2 = useCallback(async () => {
    setPhase2Panel({ kind: "loaded", roles: [] });

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

    const nextRoles = roles.map((role) => {
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

    setPhase2Panel({ kind: "loaded", roles: nextRoles });
  }, [roles, sessionId, supabase]);

  const applyViewMode = useCallback(
    (nextViewMode?: string | null) => {
      if (nextViewMode === "phase2_role_select") {
        void loadAllPhase2();
        return;
      }
      setPhase2Panel({ kind: "hidden" });
    },
    [loadAllPhase2]
  );

  const phase1Open = currentStatus === "phase1_open";
  const phase1Closed =
    currentStatus === "phase1_closed" ||
    currentStatus === "phase2_open" ||
    currentStatus === "phase2_closed";
  const phase2Active = currentStatus === "phase2_open" || currentStatus === "phase2_closed";
  const effectiveViewMode = phase2Active
    ? "phase2_role_select"
    : viewMode === "phase2_role_select"
      ? "role_list"
      : viewMode;

  const phase2PanelView: Phase2PanelState =
    phase2Active && phase2Panel.kind === "hidden" ? { kind: "loaded", roles: [] } : phase2Panel;

  const loadCurrent = useCallback(async (candidateId?: string | null) => {
    if (!candidateId) {
      setCandidate(null);
      setVote(null);
      return;
    }

    const { data: candidateData } = await supabase
      .from("candidates")
      .select("id, name, role_id")
      .eq("id", candidateId)
      .maybeSingle();

    const { data: roleData } = candidateData
      ? await supabase.from("roles").select("name").eq("id", candidateData.role_id).maybeSingle()
      : { data: null };

    setCandidate(candidateData ? { ...candidateData, role_name: roleData?.name } : null);

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

      setVote(voteData?.vote ?? null);
    } else {
      setVote(null);
    }
  }, [sessionId, supabase]);

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
          setSyncState(nextSync);
          applyViewMode(nextSync.view_mode);
          loadCurrent(nextSync.current_candidate_id);
          if (nextSync.current_candidate_id) {
            setToast("Now viewing a new candidate.");
            setTimeout(() => setToast(null), 2000);
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
            setCurrentStatus(next.status);
            if (next.status === "phase2_open" || next.status === "phase2_closed") {
              void loadAllPhase2();
            } else {
              setPhase2Panel({ kind: "hidden" });
            }
          }
        }
      )
      .subscribe();
  }, [sessionId, supabase, applyViewMode, loadCurrent, ensureRealtimeAuth, loadAllPhase2]);

  const refreshState = useCallback(async () => {
    const { data: nextSync } = await supabase
      .from("sync_state")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (nextSync) {
      setSyncState(nextSync);
      applyViewMode(nextSync.view_mode);
      loadCurrent(nextSync.current_candidate_id);
    }

    const { data: nextSession } = await supabase
      .from("deliberation_sessions")
      .select("status")
      .eq("id", sessionId)
      .maybeSingle();
    if (nextSession?.status) {
      setCurrentStatus(nextSession.status);
      if (nextSession.status === "phase2_open" || nextSession.status === "phase2_closed") {
        void loadAllPhase2();
      } else {
        setPhase2Panel({ kind: "hidden" });
      }
    }
  }, [sessionId, supabase, applyViewMode, loadCurrent, loadAllPhase2]);

  useEffect(() => {
    void subscribeChannels();
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
    if (!candidate) return;
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
      candidate_id: candidate.id,
      user_id: user.id,
      vote: value,
      updated_at: new Date().toISOString(),
    });

    setVote(value);
    setLoadingVote(false);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Live session
            </p>
            <h2 className="text-2xl font-semibold">{sessionName}</h2>
          </div>
          <Badge>{currentStatus.replaceAll("_", " ")}</Badge>
        </div>
        {toast ? <p className="text-sm text-primary">{toast}</p> : null}
      </header>

      {effectiveViewMode === "candidate_focus" && candidate ? (
        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold">{candidate.name}</h3>
              <p className="text-sm text-muted-foreground">{candidate.role_name ?? ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(voteLabels).map(([value, label]) => (
              <Button
                key={value}
                variant={vote === value ? "default" : "secondary"}
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

      {effectiveViewMode === "phase2_role_select" ? (
        phase2PanelView.kind === "loaded" ? (
          <div className="space-y-4">
            {phase2PanelView.roles.map((role) => (
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
                sessionStatus={currentStatus}
                variant="embedded"
              />
            ))}
          </div>
        ) : null
      ) : null}

      {effectiveViewMode === "role_list" ? (
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
    </div>
  );
}
