-- NocturPod production hotfix: devices.light_mode
-- Safe to run more than once. Adds one nullable-free column with a stable default.
ALTER TABLE public.devices
    ADD COLUMN IF NOT EXISTS light_mode TEXT NOT NULL DEFAULT 'WHITE';

-- Refresh PostgREST's schema cache so the backend sees the new column immediately.
NOTIFY pgrst, 'reload schema';
