-- Add historical_matches table for pipeline training/backtesting.
-- This is a NEW table — no existing tables are modified.

CREATE TABLE IF NOT EXISTS historical_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statsbomb_match_id VARCHAR(100) UNIQUE,
  competition VARCHAR(100) NOT NULL,
  season VARCHAR(100),
  match_date DATE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  home_xg REAL,
  away_xg REAL,
  referee VARCHAR(255),
  venue VARCHAR(255),
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hm_competition ON historical_matches(competition);
CREATE INDEX IF NOT EXISTS idx_hm_season ON historical_matches(season);
CREATE INDEX IF NOT EXISTS idx_hm_date ON historical_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_hm_home_team ON historical_matches(home_team);
CREATE INDEX IF NOT EXISTS idx_hm_away_team ON historical_matches(away_team);

-- Add unique constraint on track_record for upsert support
-- (prediction_id + match_id should uniquely identify a record)
DO $$ BEGIN
  ALTER TABLE track_record ADD CONSTRAINT uq_track_record_pred_match
    UNIQUE (prediction_id, match_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
