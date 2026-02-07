"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate, Role, SyncState } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type CandidatePreview = Pick<
  Candidate,
  "id" | "name" | "photo_url" | "airtable_url" | "role_id" | "admin_bucket" | "advanced_to_phase2"
>;

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
  const [currentStatus, setCurrentStatus] = useState(sessionStatus);
  const [syncState, setSyncState] = useState<SyncState | null>(initialSync);
  const [candidate, setCandidate] = useState<(CandidatePreview & { role_name?: string }) | null>(
    initialCandidate
  );
  const [vote, setVote] = useState<string | null>(null);
  const [loadingVote, setLoadingVote] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => {
    loadCurrent(syncState?.current_candidate_id);
  }, [syncState?.current_candidate_id, loadCurrent]);

  useEffect(() => {
    const channel = supabase
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
          setSyncState(payload.new as SyncState);
          if ((payload.new as SyncState).current_candidate_id) {
            setToast("Now viewing a new candidate.");
            setTimeout(() => setToast(null), 2000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, supabase]);

  useEffect(() => {
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, supabase]);

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

  const viewMode = syncState?.view_mode ?? "role_list";

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
        <Card className="space-y-6">
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
            <img
              src={candidate.photo_url}
              alt={candidate.name}
              className="h-48 w-48 rounded-3xl object-cover"
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            {Object.entries(voteLabels).map(([value, label]) => (
              <Button
                key={value}
                variant={vote === value ? "primary" : "secondary"}
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
        <Card>
          <h3 className="text-xl font-semibold">Phase 2 ballots</h3>
          <p className="text-sm text-muted-foreground">Select a role to cast your inclusion votes.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <Link
                key={role.id}
                href={`/session/${sessionId}/phase2/${role.id}`}
                className="rounded-md border border-border bg-card p-4 text-sm font-medium hover:bg-muted"
              >
                {role.name}
                <span className="block text-xs text-muted-foreground">Quota: {role.quota}</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {viewMode === "role_list" ? (
        <Card>
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
