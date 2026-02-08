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
  advancedToPhase2: boolean;
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
  "id" | "name" | "role_id" | "slide_order" | "advanced_to_phase2"
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

    const isPhase2 = nextStatus === "phase2_open" || nextStatus === "phase2_closed";
    const isPhase1 = nextStatus === "phase1_open" || nextStatus === "phase1_closed";
    const nextCandidateId = isPhase2 ? null : isPhase1 ? currentCandidateId || null : null;
    const nextViewMode = isPhase2
      ? "phase2_role_select"
      : nextCandidateId
        ? "candidate_focus"
        : "role_list";

    await supabase.from("sync_state").upsert({
      session_id: sessionId,
      current_role_id: selectedRoleId || null,
      current_candidate_id: nextCandidateId,
      view_mode: nextViewMode,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setCurrentCandidateId(nextCandidateId ?? "");
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
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
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

      <Card className="p-4">
        <h3 className="text-xl font-semibold">Sync controls</h3>
        <div className="mt-2 flex flex-wrap gap-2">
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
        <div className="mt-2 flex flex-wrap gap-2">
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
        <div className="mt-3 overflow-hidden rounded-md border">
          <ul className="divide-y text-sm">
            {roleCandidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => updateSync(candidate.id, selectedRoleId)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left font-medium transition ${
                    currentCandidateId === candidate.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  {candidate.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-xl font-semibold">Phase 1 aggregates</h3>
        <Table className="mt-4 text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="py-2">Candidate</TableHead>
              <TableHead className="py-2">Role</TableHead>
              <TableHead className="py-2">Strong Yes</TableHead>
              <TableHead className="py-2">Yes</TableHead>
              <TableHead className="py-2">No</TableHead>
              <TableHead className="py-2">% Yes</TableHead>
              <TableHead className="py-2">Mix</TableHead>
              <TableHead className="py-2">Advance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phase1Rows.map((row) => (
              <TableRow key={row.candidateId}>
                <TableCell className="py-2">{row.candidateName}</TableCell>
                <TableCell className="py-2">{row.roleName}</TableCell>
                <TableCell className="py-2">{row.strongYes}</TableCell>
                <TableCell className="py-2">{row.yes}</TableCell>
                <TableCell className="py-2">{row.no}</TableCell>
                <TableCell className="py-2">{row.percentYes.toFixed(0)}%</TableCell>
                <TableCell className="py-2">
                  {(() => {
                    const total = row.strongYes + row.yes + row.no;
                    if (total === 0) {
                      return (
                        <div
                          className="flex overflow-hidden rounded-full bg-muted/60"
                          style={{ width: 96, height: 8 }}
                        />
                      );
                    }
                    const strongPct = (row.strongYes / total) * 100;
                    const yesPct = (row.yes / total) * 100;
                    const noPct = (row.no / total) * 100;
                    return (
                      <div
                        className="flex overflow-hidden rounded-full bg-muted/60"
                        style={{ width: 96, height: 8 }}
                      >
                        <div className="h-full bg-emerald-700" style={{ width: `${strongPct}%` }} />
                        <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
                        <div className="h-full bg-destructive" style={{ width: `${noPct}%` }} />
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="py-2">
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

      <Card className="p-4">
        <h3 className="text-xl font-semibold">Phase 2 results</h3>
        <div className="mt-4 grid gap-6">
          {roles.map((role) => {
            const results = phase2Results
              .filter((row) => row.roleId === role.id)
              .sort((a, b) => b.inclusionVotes - a.inclusionVotes);
            const maxVotes = Math.max(
              1,
              ...results.map((row) => row.inclusionVotes)
            );
            const submission = submissionCounts.find((row) => row.roleId === role.id);

            return (
              <div key={role.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-lg font-semibold">{role.name}</h4>
                  {submission ? (
                    <Badge variant="secondary">
                      {submission.submittedCount}/{submission.totalCount} submitted
                    </Badge>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {results.map((row, index) => {
                    const ratio = row.inclusionVotes / maxVotes;
                    const hue = 120 * ratio;
                    const fill = `hsl(${hue} 70% 88%)`;
                    const border = `hsl(${hue} 55% 55%)`;
                    const text = `hsl(${hue} 45% 22%)`;
                    return (
                    <div key={row.candidateId} className="flex items-center gap-3">
                      <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
                      <div className="flex-1 rounded-full bg-muted">
                        <div
                          className="rounded-full px-3 py-2 text-xs font-medium"
                          style={{
                            width: `${Math.max(5, (row.inclusionVotes / maxVotes) * 100)}%`,
                            background: fill,
                            border: `1px solid ${border}`,
                            color: text,
                          }}
                        >
                          {row.candidateName}
                        </div>
                      </div>
                      <Badge variant="secondary">{row.inclusionVotes}</Badge>
                    </div>
                  );})}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
