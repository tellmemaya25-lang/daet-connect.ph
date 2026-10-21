-- Fix the mismatched profile_id for testguide2@gmail.com operator
-- Current (wrong): fec490c3-cea5-4481-af5b-d7b1347e5a9
-- Should be:       fec490c3-cea5-4481-af5b-d7fb1347e5a9

UPDATE tours_operators
SET profile_id = 'fec490c3-cea5-4481-af5b-d7fb1347e5a9'
WHERE id = '5a589767-cf37-454b-9fc8-c5e494ca646f';

-- Verify the fix
SELECT 
  o.id,
  o.profile_id,
  u.id as user_id,
  u.email,
  o.business_name,
  o.accreditation_status,
  CASE 
    WHEN o.profile_id = u.id THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END as id_match
FROM tours_operators o
JOIN auth.users u ON u.email = 'testguide2@gmail.com';
