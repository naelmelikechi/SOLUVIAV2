-- Avatar seed: NULL = daily random, non-NULL = locked avatar
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT DEFAULT NULL;
-- Track last regen date to limit to 1 per day
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_regen_date DATE DEFAULT NULL;
