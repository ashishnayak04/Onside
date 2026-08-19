export type UserRole = "super_admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string | null;
  is_secret: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  short_name: string | null;
  country: string | null;
  logo_url: string | null;
}

export interface Player {
  id: string;
  name: string;
  team_id: string | null;
  position: string | null;
  nationality: string | null;
  photo_url: string | null;
  team_name?: string;
}

export interface Match {
  id: string;
  external_id: string | null;
  competition: string;
  season: string | null;
  match_date: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name?: string;
  away_team_name?: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  venue: string | null;
}

export interface Prediction {
  id: string;
  match_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  predicted_outcome: string;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  confidence: number;
  feature_snapshot: Record<string, unknown> | null;
  model_version: string | null;
  created_at: string;
}

export interface PlayerPrediction {
  id: string;
  prediction_id: string;
  player_id: string;
  player_name?: string;
  team_name?: string;
  position?: string;
  goal_prob: number;
  assist_prob: number;
  shots_on_target_prob: number;
}

export interface TrackRecord {
  id: string;
  prediction_id: string;
  match_id: string;
  predicted_outcome: string;
  actual_outcome: string | null;
  was_correct: boolean | null;
  home_team_name?: string;
  away_team_name?: string;
  predicted_home_score?: number;
  predicted_away_score?: number;
  actual_home_score: number | null;
  actual_away_score: number | null;
  match_date?: string;
}
