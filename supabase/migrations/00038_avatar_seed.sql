-- Avatar seed: NULL = daily random, non-NULL = locked avatar
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT DEFAULT NULL;
