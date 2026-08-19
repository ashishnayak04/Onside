-- Onside SaaS Database Schema
-- Run: psql -U postgres -d onside -f scripts/migrate.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for user roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System config table (admin-managed key-value store)
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(10),
  country VARCHAR(100),
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  position VARCHAR(50),
  nationality VARCHAR(100),
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100),
  competition VARCHAR(100) NOT NULL,
  season VARCHAR(20),
  match_date TIMESTAMPTZ NOT NULL,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  venue VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_home_score DECIMAL(4,2),
  predicted_away_score DECIMAL(4,2),
  predicted_outcome VARCHAR(20) NOT NULL,
  home_win_prob DECIMAL(5,4) NOT NULL,
  draw_prob DECIMAL(5,4) NOT NULL,
  away_win_prob DECIMAL(5,4) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL,
  feature_snapshot JSONB,
  model_version VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player predictions table
CREATE TABLE IF NOT EXISTS player_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  goal_prob DECIMAL(5,4) NOT NULL DEFAULT 0,
  assist_prob DECIMAL(5,4) NOT NULL DEFAULT 0,
  shots_on_target_prob DECIMAL(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ID mapping table
CREATE TABLE IF NOT EXISTS id_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('team', 'player')),
  internal_id UUID NOT NULL,
  statsbomb_id VARCHAR(100),
  api_football_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track record table
CREATE TABLE IF NOT EXISTS track_record (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  predicted_outcome VARCHAR(20) NOT NULL,
  actual_outcome VARCHAR(20),
  was_correct BOOLEAN,
  actual_home_score INTEGER,
  actual_away_score INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_player_predictions_prediction ON player_predictions(prediction_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_track_record_match ON track_record(match_id);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Insert default super admin (password: admin123)
-- bcrypt hash of 'admin123'
INSERT INTO users (email, password_hash, name, role) VALUES
  ('admin@onside.io', '$2a$10$rQEY7zQG1rPvYBx8QxqPZeGZJ3f3G5J6J7J8J9J0J1J2J3J4J5J6', 'Super Admin', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- Insert default system config
INSERT INTO system_config (key, value, category, description, is_secret) VALUES
  ('api_football_key', '', 'api_keys', 'API-Football API key for live data', true),
  ('api_football_base_url', 'https://v3.football.api-sports.io', 'api_keys', 'API-Football base URL', false),
  ('statsbomb_data_path', '/data/statsbomb', 'data', 'Path to StatsBomb open data', false),
  ('active_competitions', '["La Liga", "UEFA Champions League"]', 'competitions', 'Comma-separated list of active competitions', false),
  ('prediction_model', 'xgboost', 'model', 'Active prediction model (poisson, dixon_coles, xgboost)', false),
  ('model_confidence_threshold', '0.6', 'model', 'Minimum confidence threshold to show predictions', false),
  ('pipeline_schedule_cron', '0 6 * * *', 'pipeline', 'Cron schedule for prediction pipeline (UTC)', false),
  ('maintenance_mode', 'false', 'system', 'Enable maintenance mode', false)
ON CONFLICT (key) DO NOTHING;
