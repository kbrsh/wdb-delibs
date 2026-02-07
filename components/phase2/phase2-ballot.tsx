"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type CandidateBallot = Pick<Candidate, "id" | "name">;

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
  onBack?: () => void;
  variant?: "standalone" | "embedded";
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
  onBack,
  variant = "standalone",
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

  const showStandaloneHeader = variant === "standalone";
  const showBackLink = showStandaloneHeader && onBack;
  const backHref = `/session/${sessionId}/live`;

  return (
    <div className={variant === "standalone" ? "space-y-4" : "space-y-3"}>
      {showStandaloneHeader ? (
        <header className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          {showBackLink ? (
            <button
              type="button"
              onClick={onBack}
              className="text-left text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              Back to roles
            </button>
          ) : (
            <Link
              className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
              href={backHref}
            >
              Back to live
            </Link>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{roleName} ballot</h2>
              <p className="text-sm text-muted-foreground">Select up to {quota} candidates.</p>
            </div>
            <Badge>{selectedIds.length} selected</Badge>
          </div>
        </header>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold">{roleName}</h3>
              <p className="text-xs text-muted-foreground">Quota: {quota}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">
                {selectedIds.length} selected
              </Badge>
              <Button size="sm" onClick={handleSubmit} disabled={saving || !phase2Open}>
                {submitted ? "Unsubmit" : "Submit"}
              </Button>
            </div>
          </div>
          <ul className="divide-y border-t border-border text-sm">
            {candidates.map((candidate) => {
              const checked = selectedIds.includes(candidate.id);
              const disabled = !checked && selectedIds.length >= quota;
              const rowDisabled = disabled || saving || !phase2Open;
              return (
                <li
                  key={candidate.id}
                  className={`${rowDisabled ? "opacity-70" : "hover:bg-muted"}`}
                >
                  <div
                    role="button"
                    tabIndex={rowDisabled ? -1 : 0}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
                    onClick={() => toggleCandidate(candidate.id)}
                    onKeyDown={(event) => {
                      if (rowDisabled) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleCandidate(candidate.id);
                      }
                    }}
                  >
                    <span className="font-medium">{candidate.name}</span>
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        id={`candidate-${candidate.id}`}
                        checked={checked}
                        disabled={rowDisabled}
                        onCheckedChange={() => toggleCandidate(candidate.id)}
                      />
                      <Label htmlFor={`candidate-${candidate.id}`} className="sr-only">
                        Select {candidate.name}
                      </Label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {variant === "standalone" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSubmit} disabled={saving || !phase2Open}>
            {submitted ? "Unsubmit" : "Submit ballot"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {submitted ? "Submitted" : "Not submitted"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
