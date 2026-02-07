export type SessionStatus =
  | "setup"
  | "phase1_open"
  | "phase1_closed"
  | "phase2_open"
  | "phase2_closed"
  | "archived";

export type AppRole = "admin" | "facilitator" | "voter";

export type Phase1Vote = "strong_yes" | "yes" | "no";

export type ViewMode = "role_list" | "candidate_focus" | "phase2_role_select";

export interface DeliberationSession {
  id: string;
  name: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  session_id: string;
  name: string;
  quota: number;
  sort_order: number;
}

export interface Candidate {
  id: string;
  session_id: string;
  role_id: string;
  name: string;
  slide_order: number;
  is_active: boolean;
  advanced_to_phase2: boolean;
  notes: string | null;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  app_role: AppRole;
}

export interface SyncState {
  session_id: string;
  current_role_id: string | null;
  current_candidate_id: string | null;
  view_mode: ViewMode | null;
  updated_by: string | null;
  updated_at: string | null;
}
