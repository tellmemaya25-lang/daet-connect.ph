# Admin Approval Workflow - Testing Guide

## Prerequisites
1. ✅ Database migration applied (`APPLY_THIS_FIRST_admin_workflow.sql`)
2. ✅ Dev server running (`npm run dev`)
3. ✅ Admin account: `admin.test@gmail.com` / `test123`

## Test Steps

### 1. Apply Database Migration
```sql
-- Copy and paste supabase/migrations/APPLY_THIS_FIRST_admin_workflow.sql
-- Into Supabase SQL Editor and click "Run"
```

Expected result: "Success. No rows returned"

### 2. Login as Admin
1. Go to `http://localhost:3000/login`
2. Email: `admin.test@gmail.com`
3. Password: `test123`
4. Click "Sign in"

Expected: Redirected to home page

### 3. Access Admin Dashboard
1. Go to `http://localhost:3000/tours/admin`

Expected to see:
- ✅ Welcome message with admin name
- ✅ Stats cards showing:
  - Pending Operators (0 or more)
  - Pending Guides (0 or more)
  - Pending Packages (3 if you haven't deleted duplicates)
  - Published Packages (0 or updated count)
  - Total Bookings (0)
- ✅ Quick Actions buttons
- ✅ Navigation bar with: Admin Dashboard, Operators, Guides, Packages

### 4. View Package Management Page
1. Click "Review Packages" or go to `/tours/admin/packages`

Expected to see:
- ✅ "Pending Approval" section with package cards
- ✅ Each card shows:
  - Package name (e.g., "Bagasbas Beach Surfing Experience")
  - Operator: Surf Daet Adventures
  - Contact: Test Guide 2
  - Base Price: ₱850
  - Submitted date
  - Status badge (yellow "pending")
  - "Review" button

### 5. Review a Package
1. Click "Review" on any pending package

Expected to see:
- ✅ Package title and description
- ✅ Status badge (yellow "pending")
- ✅ Basic Information section (location, duration, description)
- ✅ Operator Information section
- ✅ Pricing variants section
- ✅ Inclusions section (with checkmarks)
- ✅ Itinerary stops section (numbered timeline)
- ✅ Review form at bottom with:
  - Status dropdown
  - Admin notes textarea
  - "Update Status" button
  - "Quick Approve" button (green)

### 6. Test Quick Approve
1. Click "Quick Approve" button
2. Wait for success message

Expected:
- ✅ Green success message: "Package status updated successfully!"
- ✅ Status badge changes to green "Published"
- ✅ Form resets

### 7. Verify Status Change
1. Go back to `/tours/admin/packages`

Expected:
- ✅ Package moved from "Pending Approval" to "Published" section
- ✅ Pending count decreased
- ✅ Published count increased

### 8. Test Rejection
1. Click "Review" on another pending package
2. Change status to "Archived" or keep as "Pending"
3. Add notes: "Need better photos and more detailed itinerary"
4. Click "Update Status"

Expected:
- ✅ Success message appears
- ✅ Status updates immediately

### 9. Check Activity Log
1. Go to `/tours/admin`
2. Scroll to "Recent Activity" section

Expected:
- ✅ Your actions appear in the list
- ✅ Shows: Admin name, action description, timestamp
- ✅ Shows notes if added

### 10. Test Browse Page (Tourist View)
1. Go to `/tours/browse`

Expected:
- ✅ Only "Published" packages appear
- ✅ Packages with status "pending" or "archived" are hidden

## Common Issues & Fixes

### Issue: "column rejection_reason does not exist"
**Fix:** Apply the migration SQL first

### Issue: "Could not load package" or 500 error
**Fix:** Check terminal for detailed error, verify all migrations applied

### Issue: Admin dashboard shows 0 for everything
**Fix:** This is normal if:
- No pending operator/guide applications exist
- All packages are published
- No bookings yet (not implemented)

### Issue: Can't see "Admin Dashboard" link in navigation
**Fix:** Ensure you're logged in as admin role

### Issue: Audit log shows "Recent Activity" but empty
**Fix:** Normal on first load - perform some actions first

## Manual Status Change (via SQL)

If you need to manually set package status for testing:

```sql
-- Set package to pending
UPDATE tours_packages 
SET status = 'pending', rejection_reason = NULL
WHERE id = 'YOUR-PACKAGE-ID';

-- Set package to published
UPDATE tours_packages 
SET status = 'published', rejection_reason = NULL
WHERE id = 'YOUR-PACKAGE-ID';

-- Set package to archived with reason
UPDATE tours_packages 
SET status = 'archived', rejection_reason = 'Outdated information'
WHERE id = 'YOUR-PACKAGE-ID';
```

## Success Criteria

✅ **Admin Workflow Complete** when:
1. Admin can access dashboard with stats
2. Admin can view all packages grouped by status
3. Admin can review individual package details
4. Admin can approve packages (pending → published)
5. Admin can archive packages
6. Admin can add rejection notes
7. All actions logged in audit table
8. Activity log displays recent actions
9. Tourist browse page only shows published packages
10. Navigation works across all admin pages

## Next Features to Build
After confirming admin workflow works:
1. 📸 **Image Upload** - File upload for package photos
2. 📅 **Booking System** - Tourist reservations
3. 💰 **Payment Integration** - GCash/PayMaya
4. 👤 **Guide Features** - QR codes, availability
5. ⭐ **Reviews & Ratings** - Tourist feedback
6. 💬 **Chat System** - Tourist-operator messaging
7. 🤖 **AI Itinerary** - Smart suggestions
8. 🎁 **Rewards System** - Points and badges
9. 🔔 **Notifications** - Real-time alerts
10. 📱 **PWA** - Offline support
