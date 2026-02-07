"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type CandidateBallot = Pick<Candidate, "id" | "name" | "airtable_url" | "photo_url">;

interface Phase2BallotProps {
  sessionId: string;
  roleId: string;
  roleName: string;
  quota: number;
  candidates: CandidateBallot[];
  initialSelectedIds: string[];
  initialSubmitted: boolean;
  initialBallotId: string | null;
  sessionStatus: string;
}

export function Phase2Ballot({
  sessionId,
  roleId,
  roleName,
  quota,
  candidates,
  initialSelectedIds,
  initialSubmitted,
  initialBallotId,
  sessionStatus,
}: Phase2BallotProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [ballotId, setBallotId] = useState<string | null>(initialBallotId);
  const [saving, setSaving] = useState(false);

  const phase2Open = sessionStatus === "phase2_open";

  const ensureBallot = async () => {
    if (ballotId) return ballotId;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("phase2_ballots")
      .upsert({
        session_id: sessionId,
        role_id: roleId,
        user_id: user.id,
        submitted: false,
        updated_at: new Date().toISOString(),
      })
      .select("id, submitted")
      .single();

    if (data) {
      setBallotId(data.id);
      setSubmitted(Boolean(data.submitted));
    }

    return data?.id ?? null;
  };

  const toggleCandidate = async (candidateId: string) => {
    if (!phase2Open) return;
    const currentlySelected = selectedIds.includes(candidateId);

    if (!currentlySelected && selectedIds.length >= quota) {
      return;
    }

    setSaving(true);
    const currentBallotId = await ensureBallot();
    if (!currentBallotId) {
      setSaving(false);
      return;
    }

    if (currentlySelected) {
      await supabase
        .from("phase2_selections")
        .delete()
        .eq("ballot_id", currentBallotId)
        .eq("candidate_id", candidateId);
      setSelectedIds((prev) => prev.filter((id) => id !== candidateId));
    } else {
      await supabase.from("phase2_selections").insert({
        ballot_id: currentBallotId,
        candidate_id: candidateId,
      });
      setSelectedIds((prev) => [...prev, candidateId]);
    }

    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!phase2Open) return;
    const currentBallotId = await ensureBallot();
    if (!currentBallotId) return;

    const nextSubmitted = !submitted;
    setSaving(true);
    await supabase
      .from("phase2_ballots")
      .update({ submitted: nextSubmitted, updated_at: new Date().toISOString() })
      .eq("id", currentBallotId);
    setSubmitted(nextSubmitted);
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-lg border bg-card p-6">
        <Link className="text-xs uppercase tracking-[0.2em] text-muted-foreground" href={`/session/${sessionId}/live`}>
          Back to live
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{roleName} ballot</h2>
            <p className="text-sm text-muted-foreground">Select up to {quota} candidates.</p>
          </div>
          <Badge>{selectedIds.length} selected</Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {candidates.map((candidate) => {
          const checked = selectedIds.includes(candidate.id);
          const disabled = !checked && selectedIds.length >= quota;
          return (
            <Card key={candidate.id} className={disabled ? "opacity-70" : ""}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{candidate.name}</h3>
                  <a
                    className="text-xs text-muted-foreground underline"
                    href={candidate.airtable_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Airtable
                  </a>
                </div>
                <Checkbox
                  checked={checked}
                  disabled={disabled || saving}
                  onChange={() => toggleCandidate(candidate.id)}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSubmit} disabled={saving || !phase2Open}>
          {submitted ? "Unsubmit" : "Submit ballot"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {submitted ? "Submitted" : "Not submitted"}
        </p>
      </div>
    </div>
  );
}
