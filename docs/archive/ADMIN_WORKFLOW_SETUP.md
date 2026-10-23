# Admin Approval Workflow - Setup Guide

## Overview
Complete admin approval system for tour operators, guides, and packages with audit logging.

## Files Created

### Admin Pages
- `/tours/admin/page.tsx` - Main admin dashboard with stats overview
- `/tours/admin/packages/page.tsx` - List all packages by status (pending/published/archived)
- `/tours/admin/packages/[id]/page.tsx` - Detailed package review page
- `/tours/admin/packages/[id]/package-review-form.tsx` - Status update form component
- `/tours/admin/packages/[id]/actions.ts` - Server actions for package approval/rejection

### Database Migrations
1. `supabase/migrations/add_rejection_reason_and_fix_stops_display.sql` - Adds rejection_reason column
2. `supabase/migrations/create_admin_audit_log.sql` - Creates audit log table with RLS

### Updated Files
- `src/components/ui/site-header.tsx` - Added admin navigation links

## Database Setup

### Step 1: Add rejection_reason column
Run in Supabase SQL Editor:

```sql
-- Add rejection_reason column to tours_packages table
ALTER TABLE tours_packages 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN tours_packages.rejection_reason IS 'Reason for rejection when status is rejected';
```

### Step 2: Create audit log table
Run in Supabase SQL Editor:

```sql
-- Create admin audit log table
CREATE TABLE IF NOT EXISTS tours_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_value TEXT,
  new_value TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_action CHECK (action IN (
    'approve_operator',
    'reject_operator',
    'approve_guide',
    'reject_guide',
    'update_package_status',
    'delete_package',
    'ban_user',
    'unban_user'
  )),
  
  CONSTRAINT valid_entity_type CHECK (entity_type IN (
    'operator',
    'guide',
    'package',
    'user',
    'booking'
  ))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON tours_admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON tours_admin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON tours_admin_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE tours_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all audit logs"
  ON tours_admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert audit logs"
  ON tours_admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
    AND admin_id = auth.uid()
  );

-- Add comments
COMMENT ON TABLE tours_admin_audit_log IS 'Tracks all admin actions for accountability';
```

## Features

### Admin Dashboard (`/tours/admin`)
- **Overview Stats**
  - Pending operators count
  - Pending guides count
  - Pending packages count
  - Published packages count
  - Total bookings (placeholder for future)
- **Quick Actions** - Direct links to review queues
- **Recent Activity Log** - Last 5 admin actions with notes

### Package Management (`/tours/admin/packages`)
- **Three Status Sections**
  - Pending Approval - New submissions
  - Published - Active packages
  - Archived - Hidden packages
- **Package Cards** show:
  - Package name
  - Operator business name
  - Contact person
  - Base price
  - Submission date
  - Current status badge

### Package Review (`/tours/admin/packages/[id]`)
- **Complete Package Details**
  - Basic information (location, duration, description)
  - Operator information (business details, permits, contact)
  - Pricing variants
  - Inclusions (included/excluded items)
  - Itinerary stops
  - Gallery images (if any)
- **Review Form**
  - Status dropdown (pending/published/archived)
  - Optional admin notes
  - "Quick Approve" button
  - Visual feedback on changes

### Audit Logging
All admin actions are logged with:
- Admin ID
- Action type
- Entity type and ID
- Old/new values
- Notes
- Timestamp

## Testing

### Test Admin Account
```
Email: admin.test@gmail.com
Password: test123
```

### Test Workflow
1. Login as admin: `http://localhost:3000/login`
2. Go to admin dashboard: `http://localhost:3000/tours/admin`
3. Click "Review Packages" or go to `/tours/admin/packages`
4. Click "Review" on any pending package
5. Review package details
6. Update status or click "Quick Approve"
7. Check activity log on dashboard

### Available Package Statuses
- `pending` - Awaiting admin review (default for new packages)
- `published` - Approved and visible to tourists
- `archived` - Hidden from public view
- `rejected` - Declined with reason (optional)

## Navigation

### Admin Navigation Links (when logged in as admin)
- **Admin Dashboard** - Overview and stats
- **Operators** - Review operator applications
- **Guides** - Review guide applications
- **Packages** - Manage tour packages

## Next Steps

After testing admin workflow:
1. ✅ **Admin Approval Workflow** - COMPLETE
2. 🔄 **Image Upload** - Next priority
3. ⏳ **Booking System**
4. ⏳ **Payment Integration**
5. ⏳ **Guide Features**
6. ⏳ **Reviews & Ratings**
7. ⏳ **Chat System**
8. ⏳ **AI Itinerary**
9. ⏳ **Rewards & Notifications**
10. ⏳ **PWA**

## Notes

- The existing operator and guide approval pages were already built and remain unchanged
- Audit log captures all admin decisions for accountability
- Package rejection requires adding a reason (stored in `rejection_reason` column)
- Status changes are tracked with old/new values
- Activity log on dashboard shows last 5 actions across all admins
