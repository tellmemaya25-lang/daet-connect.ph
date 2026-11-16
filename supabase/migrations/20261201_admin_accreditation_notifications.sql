-- Tell Tourism Office admins about applications awaiting accreditation.
-- Existing pending applications are not backfilled; they remain in the queues.
-- Notifications use the existing in-app and optional push infrastructure.

CREATE OR REPLACE FUNCTION public.tours_notify_admin_operator_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_admin uuid;
BEGIN
  IF NEW.accreditation_status::text IS DISTINCT FROM 'pending' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.accreditation_status IS NOT DISTINCT FROM NEW.accreditation_status THEN
    RETURN NULL;
  END IF;
  FOR v_admin IN SELECT id FROM public.profiles WHERE role::text = 'admin' LOOP
    PERFORM public.tours_notify(v_admin, 'operator_application_submitted',
      'Operator application awaiting review',
      'A new or resubmitted operator application is ready for review.',
      '/tours/admin/operators');
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_admin_operator_application
AFTER INSERT OR UPDATE OF accreditation_status ON public.tours_operators
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_admin_operator_application();

-- Guide registration first saves a pending public row, then saves the private
-- identity record in a separate request. Notify only after the private write
-- succeeds; otherwise failed submissions would leave misleading notifications.
-- Each submission uploads a new private document path, including resubmissions.
-- Do not include names, ID details, or document paths in notification content.
CREATE OR REPLACE FUNCTION public.tours_notify_admin_guide_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_admin uuid;
BEGIN
  IF NEW.id_document_path IS NULL OR btrim(NEW.id_document_path) = '' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.id_document_path IS NOT DISTINCT FROM OLD.id_document_path THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tours_guides
    WHERE id = NEW.guide_id AND accreditation_status::text = 'pending'
  ) THEN
    RETURN NULL;
  END IF;
  FOR v_admin IN SELECT id FROM public.profiles WHERE role::text = 'admin' LOOP
    PERFORM public.tours_notify(v_admin, 'guide_application_submitted',
      'Guide application awaiting review',
      'A new or resubmitted guide application is ready for review.',
      '/tours/admin/guides');
  END LOOP;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_admin_guide_application
AFTER INSERT OR UPDATE OF id_document_path ON public.tours_guide_sensitive_info
FOR EACH ROW EXECUTE FUNCTION public.tours_notify_admin_guide_application();

REVOKE ALL ON FUNCTION public.tours_notify_admin_operator_application() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_notify_admin_guide_application() FROM PUBLIC, anon, authenticated;
