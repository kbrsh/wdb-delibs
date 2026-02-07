"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Candidate, Role, SyncState } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Phase1Aggregate {
  candidateId: string;
  candidateName: string;
  roleName: string;
  strongYes: number;
  yes: number;
  no: number;
  percentYes: number;
  netScore: number;
  advancedToPhase2: boolean;
  adminBucket: string | null;
}

interface Phase2Result {
  candidateId: string;
  candidateName: string;
  roleId: string;
  roleName: string;
  inclusionVotes: number;
}

interface SubmissionCount {
  roleId: string;
  roleName: string;
  submittedCount: number;
  totalCount: number;
}

interface ControlPanelProps {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  roles: Role[];
  candidates: ControlCandidate[];
  syncState: SyncState | null;
  phase1Aggregates: Phase1Aggregate[];
  phase2Results: Phase2Result[];
  submissionCounts: SubmissionCount[];
}

type ControlCandidate = Pick<
  Candidate,
  "id" | "name" | "role_id" | "slide_order" | "admin_bucket" | "advanced_to_phase2"
>;

const statusOptions = [
  "setup",
  "phase1_open",
  "phase1_closed",
  "phase2_open",
  "phase2_closed",
  "archived",
];

export function ControlPanel({
  sessionId,
  sessionName,
  sessionStatus,
  roles,
  candidates,
  syncState,
  phase1Aggregates,
  phase2Results,
  submissionCounts,
}: ControlPanelProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [selectedRoleId, setSelectedRoleId] = useState(
    syncState?.current_role_id ?? roles[0]?.id ?? ""
  );
  const [currentCandidateId, setCurrentCandidateId] = useState(
    syncState?.current_candidate_id ?? ""
  );
  const [status, setStatus] = useState(sessionStatus);
  const [loading, setLoading] = useState(false);
  const [phase1Rows, setPhase1Rows] = useState(phase1Aggregates);

  const roleCandidates = candidates
    .filter((candidate) => candidate.role_id === selectedRoleId)
    .sort((a, b) => (a.slide_order ?? 0) - (b.slide_order ?? 0));

  const currentIndex = roleCandidates.findIndex((c) => c.id === currentCandidateId);

  const updateSync = async (candidateId: string | null, roleId: string | null) => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("sync_state").upsert({
      session_id: sessionId,
      current_role_id: roleId,
      current_candidate_id: candidateId,
      view_mode: candidateId ? "candidate_focus" : "role_list",
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });

    setCurrentCandidateId(candidateId ?? "");
    setSelectedRoleId(roleId ?? "");
    setLoading(false);
  };

  const updateStatus = async (nextStatus: string) => {
    setLoading(true);
    await supabase
      .from("deliberation_sessions")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (nextStatus === "phase2_open") {
      await supabase.from("sync_state").upsert({
        session_id: sessionId,
        current_role_id: selectedRoleId || null,
        current_candidate_id: null,
        view_mode: "phase2_role_select",
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
    }

    if (nextStatus === "phase1_open") {
      await supabase.from("sync_state").upsert({
        session_id: sessionId,
        current_role_id: selectedRoleId || null,
        current_candidate_id: null,
        view_mode: "role_list",
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
    }
    setStatus(nextStatus);
    setLoading(false);
  };

  const goNext = () => {
    const nextCandidate = roleCandidates[currentIndex + 1];
    if (nextCandidate) {
      updateSync(nextCandidate.id, selectedRoleId);
    }
  };

  const goPrev = () => {
    const prevCandidate = roleCandidates[currentIndex - 1];
    if (prevCandidate) {
      updateSync(prevCandidate.id, selectedRoleId);
    }
  };

  const setBucket = async (candidateId: string, bucket: string | null) => {
    setLoading(true);
    await supabase
      .from("candidates")
      .update({ admin_bucket: bucket })
      .eq("id", candidateId);
    setPhase1Rows((rows) =>
      rows.map((row) => (row.candidateId === candidateId ? { ...row, adminBucket: bucket } : row))
    );
    setLoading(false);
  };

  const toggleAdvance = async (candidateId: string, next: boolean) => {
    setLoading(true);
    await supabase
      .from("candidates")
      .update({ advanced_to_phase2: next })
      .eq("id", candidateId);
    setPhase1Rows((rows) =>
      rows.map((row) =>
        row.candidateId === candidateId ? { ...row, advancedToPhase2: next } : row
      )
    );
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Control room
            </p>
            <h2 className="text-2xl font-semibold">{sessionName}</h2>
          </div>
          <Badge>{status.replaceAll("_", " ")}</Badge>
        </div>
        <div className="flex flex-wrap gap-3">
          {statusOptions.map((option) => (
            <Button
              key={option}
              variant={status === option ? "default" : "secondary"}
              onClick={() => updateStatus(option)}
              disabled={loading}
            >
              {option.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
      </header>

      <Card className="p-6">
        <h3 className="text-xl font-semibold">Sync controls</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          {roles.map((role) => (
            <Button
              key={role.id}
              variant={selectedRoleId === role.id ? "default" : "secondary"}
              onClick={() => {
                setSelectedRoleId(role.id);
                setCurrentCandidateId("");
                updateSync(null, role.id);
              }}
              disabled={loading}
            >
              {role.name}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={goPrev} disabled={loading || currentIndex <= 0}>
            Previous
          </Button>
          <Button
            variant="secondary"
            onClick={goNext}
            disabled={loading || currentIndex >= roleCandidates.length - 1}
          >
            Next
          </Button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {roleCandidates.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => updateSync(candidate.id, selectedRoleId)}
              className={`rounded-md border border-border p-4 text-left text-sm font-medium transition ${
                currentCandidateId === candidate.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted"
              }`}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold">Phase 1 aggregates</h3>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Strong Yes</TableHead>
              <TableHead>Yes</TableHead>
              <TableHead>No</TableHead>
              <TableHead>% Yes</TableHead>
              <TableHead>Net</TableHead>
              <TableHead>Bucket</TableHead>
              <TableHead>Advance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phase1Rows.map((row) => (
              <TableRow key={row.candidateId}>
                <TableCell>{row.candidateName}</TableCell>
                <TableCell>{row.roleName}</TableCell>
                <TableCell>{row.strongYes}</TableCell>
                <TableCell>{row.yes}</TableCell>
                <TableCell>{row.no}</TableCell>
                <TableCell>{row.percentYes.toFixed(0)}%</TableCell>
                <TableCell>{row.netScore}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {["clear_yes", "borderline", "no", null].map((bucket) => (
                      <button
                        key={bucket ?? "none"}
                        onClick={() => setBucket(row.candidateId, bucket)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          row.adminBucket === bucket
                            ? "bg-accent text-accent-foreground"
                            : "bg-card"
                        }`}
                      >
                        {bucket ?? "unset"}
                      </button>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant={row.advancedToPhase2 ? "default" : "secondary"}
                    size="sm"
                    onClick={() => toggleAdvance(row.candidateId, !row.advancedToPhase2)}
                  >
                    {row.advancedToPhase2 ? "Advanced" : "Hold"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold">Phase 2 results</h3>
        <div className="mt-4 grid gap-6">
          {roles.map((role) => {
            const results = phase2Results
              .filter((row) => row.roleId === role.id)
              .sort((a, b) => b.inclusionVotes - a.inclusionVotes);
            const submission = submissionCounts.find((row) => row.roleId === role.id);

            return (
              <div key={role.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-lg font-semibold">{role.name}</h4>
                  {submission ? (
                    <Badge>
                      {submission.submittedCount}/{submission.totalCount} submitted
                    </Badge>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {results.map((row, index) => (
                    <div key={row.candidateId} className="flex items-center gap-3">
                      <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
                      <div className="flex-1 rounded-full bg-muted">
                        <div
                          className="rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                          style={{ width: `${Math.max(10, row.inclusionVotes * 6)}px` }}
                        >
                          {row.candidateName}
                        </div>
                      </div>
                      <Badge>{row.inclusionVotes}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
