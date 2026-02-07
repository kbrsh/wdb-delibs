"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate, Role, SyncState } from "@/lib/db/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Phase2Ballot } from "@/components/phase2/phase2-ballot";

type CandidatePreview = Pick<
  Candidate,
  "id" | "name" | "photo_url" | "airtable_url" | "role_id" | "admin_bucket" | "advanced_to_phase2"
>;

type Phase2Candidate = Pick<Candidate, "id" | "name" | "airtable_url" | "photo_url">;

type Phase2PanelState =
  | { kind: "hidden" }
  | { kind: "role_list" }
  | { kind: "loading"; roleId: string }
  | {
      kind: "loaded";
      roleId: string;
      roleName: string;
      quota: number;
      candidates: Phase2Candidate[];
      initialSelectedIds: string[];
      initialSubmitted: boolean;
      initialBallotId: string | null;
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
    initialSync?.view_mode === "phase2_role_select" ? { kind: "role_list" } : { kind: "hidden" }
  );

  const viewMode = syncState?.view_mode ?? "role_list";

  const ensureRealtimeAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      supabase.realtime.setAuth(token);
    }
  }, [supabase]);

  const applyViewMode = useCallback((nextViewMode?: string | null) => {
    if (nextViewMode === "phase2_role_select") {
      setPhase2Panel((prev) => (prev.kind === "hidden" ? { kind: "role_list" } : prev));
      return;
    }
    setPhase2Panel({ kind: "hidden" });
  }, []);

  const phase1Open = currentStatus === "phase1_open";
  const phase1Closed =
    currentStatus === "phase1_closed" ||
    currentStatus === "phase2_open" ||
    currentStatus === "phase2_closed";

  const loadCurrent = useCallback(async (candidateId?: string | null) => {
    if (!candidateId) {
      setCandidate(null);
      setVote(null);
      return;
    }

    const { data: candidateData } = await supabase
      .from("candidates")
      .select("id, name, photo_url, airtable_url, role_id, admin_bucket, advanced_to_phase2")
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
          }
        }
      )
      .subscribe();
  }, [sessionId, supabase, applyViewMode, loadCurrent, ensureRealtimeAuth]);

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
    }
  }, [sessionId, supabase, applyViewMode, loadCurrent]);

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

  const loadPhase2 = useCallback(
    async (roleId: string) => {
      setPhase2Panel({ kind: "loading", roleId });
      const { data: role } = await supabase
        .from("roles")
        .select("id, name, quota")
        .eq("id", roleId)
        .maybeSingle();

      if (!role) {
        setPhase2Panel({ kind: "role_list" });
        return;
      }

      const { data: candidates } = await supabase
        .from("candidates")
        .select("id, name, airtable_url, photo_url")
        .eq("role_id", roleId)
        .eq("advanced_to_phase2", true)
        .order("name", { ascending: true });

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: ballot } = user
        ? await supabase
            .from("phase2_ballots")
            .select("id, submitted")
            .eq("session_id", sessionId)
            .eq("role_id", roleId)
            .eq("user_id", user.id)
            .maybeSingle()
        : { data: null };

      const { data: selections } = ballot
        ? await supabase
            .from("phase2_selections")
            .select("candidate_id")
            .eq("ballot_id", ballot.id)
        : { data: [] };

      setPhase2Panel({
        kind: "loaded",
        roleId,
        roleName: role.name,
        quota: role.quota,
        candidates: candidates ?? [],
        initialSelectedIds: (selections ?? []).map((selection) => selection.candidate_id),
        initialSubmitted: Boolean(ballot?.submitted),
        initialBallotId: ballot?.id ?? null,
      });
    },
    [sessionId, supabase]
  );

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
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm">
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

      {viewMode === "candidate_focus" && candidate ? (
        <Card className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-3xl font-semibold">{candidate.name}</h3>
              <p className="text-sm text-muted-foreground">{candidate.role_name ?? ""}</p>
            </div>
            <div className="flex gap-3">
              <a
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
                href={candidate.airtable_url}
                target="_blank"
                rel="noreferrer"
              >
                Open Airtable
              </a>
              {vote ? <Badge>Voted: {voteLabels[vote as keyof typeof voteLabels]}</Badge> : null}
            </div>
          </div>
          {candidate.photo_url ? (
          <Image
            src={candidate.photo_url}
            alt={candidate.name}
            width={192}
            height={192}
            className="h-48 w-48 rounded-3xl object-cover"
            unoptimized
          />
          ) : null}
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

      {viewMode === "phase2_role_select" ? (
        phase2Panel.kind === "loaded" ? (
          <Phase2Ballot
            key={phase2Panel.roleId}
            sessionId={sessionId}
            roleId={phase2Panel.roleId}
            roleName={phase2Panel.roleName}
            quota={phase2Panel.quota}
            candidates={phase2Panel.candidates}
            initialSelectedIds={phase2Panel.initialSelectedIds}
            initialSubmitted={phase2Panel.initialSubmitted}
            initialBallotId={phase2Panel.initialBallotId}
            sessionStatus={currentStatus}
            onBack={() => setPhase2Panel({ kind: "role_list" })}
          />
        ) : (
          <Card className="p-6">
            <h3 className="text-xl font-semibold">Phase 2 ballots</h3>
            <p className="text-sm text-muted-foreground">
              Select a role to cast your inclusion votes.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => loadPhase2(role.id)}
                  className="rounded-md border border-border bg-card p-4 text-left text-sm font-medium hover:bg-muted"
                  disabled={phase2Panel.kind === "loading"}
                >
                  {role.name}
                  <span className="block text-xs text-muted-foreground">Quota: {role.quota}</span>
                </button>
              ))}
            </div>
            {phase2Panel.kind === "loading" ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading ballot...</p>
            ) : null}
          </Card>
        )
      ) : null}

      {viewMode === "role_list" ? (
        <Card className="p-6">
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
