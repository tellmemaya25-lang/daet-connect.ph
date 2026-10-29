import { LineIcon } from "@/components/ui/icons";
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageFrame } from '@/components/ui/page-frame';
import { Notice } from '@/components/ui/notice';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="info" title="Admin sign-in required">
            <Link href={`/login?next=${encodeURIComponent("/tours/admin")}`} className="font-bold underline underline-offset-4">
              Sign in
            </Link>{" "}
            with a Tourism Office admin account.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'admin') {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="Access denied">
            Only Tourism Office admins can access this dashboard.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  // Get counts of pending items
  const [
    operatorsResult,
    guidesResult,
    pendingPackagesResult,
    publishedPackagesResult,
    bookingsResult,
  ] = await Promise.all([
    supabase.from('tours_operators').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_guides').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('tours_bookings').select('*', { count: 'exact', head: true }),
  ]);

  const pendingOperators = operatorsResult.count || 0;
  const pendingGuides = guidesResult.count || 0;
  const pendingPackages = pendingPackagesResult.count || 0;
  const publishedPackages = publishedPackagesResult.count || 0;
  const totalBookings = bookingsResult.count || 0;

  // Get recent admin activities
  const { data: recentActivities } = await supabase
    .from('tours_admin_audit_log')
    .select('*, profiles!inner(full_name)')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <PageFrame adminNav>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="display-2 text-daet-ink">Tourism Office</h1>
            <p className="mt-2 text-lg text-daet-ink">
              Welcome back, {profile.full_name || 'Admin'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Pending Operators */}
        <Link
          href="/tours/admin/operators"
          className="block rounded-2xl bg-white p-6 transition hover:bg-blue-50 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-daet-ink">Pending Operators</p>
              <p className="mt-2 text-4xl font-bold text-daet-ink">{pendingOperators || 0}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-yellow-50 text-2xl">
              <LineIcon name="building" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </div>
          </div>
          <p className="mt-4 text-slate-600">Applications awaiting review</p>
        </Link>

        {/* Pending Guides */}
        <Link
          href="/tours/admin/guides"
          className="block rounded-2xl bg-white p-6 transition hover:bg-blue-50 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-daet-ink">Pending Guides</p>
              <p className="mt-2 text-4xl font-bold text-daet-ink">{pendingGuides || 0}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-yellow-50 text-2xl">
              <LineIcon name="user" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </div>
          </div>
          <p className="mt-4 text-slate-600">Guide applications to verify</p>
        </Link>

        {/* Pending Packages */}
        <Link
          href="/tours/admin/packages"
          className="block rounded-2xl bg-white p-6 transition hover:bg-blue-50 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-daet-ink">Pending Packages</p>
              <p className="mt-2 text-4xl font-bold text-daet-ink">{pendingPackages || 0}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-yellow-50 text-2xl">
              <LineIcon name="box" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </div>
          </div>
          <p className="mt-4 text-slate-600">Tour packages awaiting approval</p>
        </Link>

        {/* Published Packages */}
        <div className="rounded-2xl bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-daet-ink">Published Packages</p>
              <p className="mt-2 text-4xl font-bold text-daet-ink">{publishedPackages || 0}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-50 text-2xl">
              ✓
            </div>
          </div>
          <p className="mt-4 text-slate-600">Active tour offerings</p>
        </div>

        {/* Total Bookings */}
        <div className="rounded-2xl bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-daet-ink">Total Bookings</p>
              <p className="mt-2 text-4xl font-bold text-daet-ink">{totalBookings || 0}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-2xl">
              <LineIcon name="calendar" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </div>
          </div>
          <p className="mt-4 text-slate-600">All-time reservations</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-white p-6 mb-8">
        <h2 className="text-xl font-bold text-daet-ink mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/tours/admin/analytics"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-ink px-6 text-sm font-bold text-white hover:bg-daet-forest transition"
          >
            <LineIcon name="chart" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Tourism Analytics
          </Link>
          <Link
            href="/tours/admin/operators"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            Review Operators
          </Link>
          <Link
            href="/tours/admin/guides"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            Review Guides
          </Link>
          <Link
            href="/tours/admin/packages"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-blue-700 transition"
          >
            Review Packages
          </Link>
          <Link
            href="/tours/admin/events"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-leaf hover:bg-daet-forest/5 transition"
          >
            Manage Events Calendar
          </Link>
          <Link
            href="/tours/admin/attractions"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-leaf hover:bg-daet-forest/5 transition"
          >
            Manage Attractions
          </Link>
          <Link
            href="/tours/admin/reviews"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-leaf hover:bg-daet-forest/5 transition"
          >
            Moderate Reviews
          </Link>
          <Link
            href="/tours/messages"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-forest hover:bg-daet-forest/5 transition"
          >
            Operator Messages
          </Link>
          <Link
            href="/tours/admin/merch"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-leaf hover:bg-daet-forest/5 transition"
          >
            Manage Merchandise
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="rounded-2xl bg-white p-6">
          <h2 className="text-xl font-bold text-daet-ink mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivities.map((activity: any) => (
              <div key={activity.id} className="flex items-start gap-3 text-sm">
                <div className="h-8 w-8 rounded-full bg-daet-sand flex items-center justify-center flex-shrink-0">
                  {getActivityIcon(activity.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-daet-ink font-medium">
                    {activity.profiles.full_name || 'Admin'}{' '}
                    <span className="text-daet-ink/70 font-normal">
                      {getActivityDescription(activity)}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                  {activity.notes && (
                    <p className="text-sm text-slate-600 mt-1 italic">"{activity.notes}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function getActivityIcon(action: string): string {
  switch (action) {
    case 'approve_operator':
    case 'approve_guide':
      return '✓';
    case 'reject_operator':
    case 'reject_guide':
      return '✗';
    case 'update_package_status':
      return '•';
    case 'delete_package':
      return '−';
    case 'ban_user':
      return '×';
    case 'unban_user':
      return '✓';
    default:
      return '•';
  }
}

function getActivityDescription(activity: any): string {
  switch (activity.action) {
    case 'approve_operator':
      return 'approved an operator application';
    case 'reject_operator':
      return 'rejected an operator application';
    case 'approve_guide':
      return 'approved a guide application';
    case 'reject_guide':
      return 'rejected a guide application';
    case 'update_package_status':
      return `changed package status to ${activity.new_value}`;
    case 'delete_package':
      return 'deleted a package';
    case 'ban_user':
      return 'banned a user';
    case 'unban_user':
      return 'unbanned a user';
    default:
      return 'performed an action';
  }
}
