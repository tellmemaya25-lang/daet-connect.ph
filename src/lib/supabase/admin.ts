import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, supabaseSecretKey } from "@/lib/supabase/env";

/** Server-only admin client (secret key). Never import this module in a Client Component. */
export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicConfig();
  const secretKey = supabaseSecretKey();

  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not configured.");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
