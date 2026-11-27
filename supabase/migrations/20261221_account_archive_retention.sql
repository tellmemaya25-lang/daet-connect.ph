-- Daily retention cleanup for archived accounts. Each account is deleted in its
-- own subtransaction, so a foreign-key/storage failure does not orphan a login
-- or prevent other accounts from being processed. Failed accounts are retried.
CREATE TABLE IF NOT EXISTS public.tours_archive_cleanup_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('deleted', 'failed')),
  error_code text
);
ALTER TABLE public.tours_archive_cleanup_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tours_archive_cleanup_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.tours_archive_cleanup_log_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tours_cleanup_expired_archives()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  account record;
  failure_code text;
BEGIN
  FOR account IN
    SELECT p.id FROM public.profiles p
    WHERE p.archived_at IS NOT NULL AND p.archived_at <= now() - interval '90 days'
    ORDER BY p.archived_at, p.id
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = account.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Auth account not found' USING ERRCODE = 'P0002';
      END IF;
      DELETE FROM public.profiles WHERE id = account.id;
      INSERT INTO public.tours_archive_cleanup_log (account_id, outcome) VALUES (account.id, 'deleted');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS failure_code = RETURNED_SQLSTATE;
      INSERT INTO public.tours_archive_cleanup_log (account_id, outcome, error_code)
      VALUES (account.id, 'failed', failure_code);
      RAISE WARNING 'Archive cleanup failed for account %, SQLSTATE %', account.id, failure_code;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_cleanup_expired_archives() FROM PUBLIC, anon, authenticated;

-- pg_cron uses UTC by default. Named scheduling replaces an existing job of the
-- same name, so reapplying the migration does not create duplicates.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('tours-archive-retention', '0 19 * * *', 'SELECT public.tours_cleanup_expired_archives()');
