-- Create operator record for testguide2@gmail.com
-- Run this if you want to skip the registration form

DO $$
DECLARE
  v_user_id UUID;
  v_operator_id UUID;
BEGIN
  -- Get user ID for testguide2@gmail.com
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'testguide2@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User testguide2@gmail.com not found';
  END IF;

  -- Check if operator already exists
  SELECT id INTO v_operator_id
  FROM tours_operators
  WHERE profile_id = v_user_id;

  IF v_operator_id IS NOT NULL THEN
    RAISE NOTICE 'Operator already exists with ID: %', v_operator_id;
  ELSE
    -- Create approved operator record
    INSERT INTO tours_operators (
      profile_id,
      business_name,
      contact_person,
      contact_email,
      contact_phone,
      business_address,
      accreditation_status,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      'Daet Tours & Travel',
      'Test Guide 2',
      'testguide2@gmail.com',
      '09171234567',
      'Daet, Camarines Norte',
      'approved',
      NOW(),
      NOW()
    ) RETURNING id INTO v_operator_id;

    RAISE NOTICE 'Created operator with ID: %', v_operator_id;
  END IF;
END $$;

-- Verify the operator was created
SELECT 
  o.id,
  o.profile_id,
  u.email,
  o.business_name,
  o.accreditation_status
FROM tours_operators o
JOIN auth.users u ON u.id = o.profile_id
WHERE u.email = 'testguide2@gmail.com';
