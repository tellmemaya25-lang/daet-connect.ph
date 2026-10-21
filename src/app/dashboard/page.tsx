import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    // Not logged in - redirect to login
    redirect('/login?next=/dashboard');
  }

  // Get user profile to determine role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  // Redirect based on role
  if (role === 'admin') {
    redirect('/tours/admin');
  } else if (role === 'operator' || role === 'guide') {
    // Check if they have operator account
    const { data: operator } = await supabase
      .from('tours_operators')
      .select('id, accreditation_status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (operator) {
      if (operator.accreditation_status === 'approved') {
        redirect('/tours/operator/dashboard');
      } else {
        redirect('/tours/operator/pending');
      }
    }

    // Check if they have guide account
    const { data: guide } = await supabase
      .from('tours_guides')
      .select('id, accreditation_status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (guide) {
      if (guide.accreditation_status === 'approved') {
        redirect('/tours/guide/dashboard');
      } else {
        redirect('/tours/guide/pending');
      }
    }

    // No operator or guide account - redirect to registration choice
    redirect('/');
  } else {
    // Tourist or unknown role - redirect to browse
    redirect('/tours/browse');
  }
}
