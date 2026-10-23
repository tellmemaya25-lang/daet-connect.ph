-- ================================================================
-- F0 / D1: package review can reject packages
-- The admin review action sets tours_packages.status = 'rejected' and the
-- operator edit flow lets rejected packages be fixed and resubmitted, but the
-- enum had no such value, so every rejection failed.
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it.
-- ================================================================

ALTER TYPE public.package_status ADD VALUE IF NOT EXISTS 'rejected' AFTER 'published';
