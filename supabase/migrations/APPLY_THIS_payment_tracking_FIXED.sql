-- =====================================================
-- SPRINT 5: PAYMENT TRACKING SYSTEM (FIXED)
-- =====================================================
-- Creates payment records and tracking for tour bookings
-- Operators can record payments, tourists can view payment history
-- =====================================================

BEGIN;

-- Create tours_payments table
CREATE TABLE IF NOT EXISTS tours_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES tours_bookings(id) ON DELETE CASCADE,
  
  -- Payment details
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN (
    'cash',
    'gcash',
    'bank_transfer',
    'credit_card',
    'debit_card',
    'paypal',
    'other'
  )),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending',
    'completed',
    'failed',
    'refunded'
  )),
  
  -- Transaction info
  reference_number VARCHAR(100),
  payment_date TIMESTAMPTZ,
  notes TEXT,
  
  -- Receipt/proof
  receipt_image_url TEXT,
  
  -- Metadata
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add payment summary columns to tours_bookings
ALTER TABLE tours_bookings 
  ADD COLUMN IF NOT EXISTS total_paid DECIMAL(10,2) DEFAULT 0 CHECK (total_paid >= 0),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN (
    'unpaid',
    'partial',
    'paid',
    'refunded'
  ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON tours_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON tours_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON tours_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON tours_bookings(payment_status);

-- Function to update booking payment status
CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_booking_id UUID;
  v_total_amount DECIMAL(10,2);
  v_total_paid DECIMAL(10,2);
  v_new_status VARCHAR(20);
BEGIN
  -- Get booking_id from the payment record
  IF TG_OP = 'DELETE' THEN
    v_booking_id := OLD.booking_id;
  ELSE
    v_booking_id := NEW.booking_id;
  END IF;

  -- Calculate total paid (only completed payments)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM tours_payments
  WHERE booking_id = v_booking_id
    AND payment_status = 'completed';

  -- Get booking total amount
  SELECT total_amount
  INTO v_total_amount
  FROM tours_bookings
  WHERE id = v_booking_id;

  -- Determine payment status
  IF v_total_paid = 0 THEN
    v_new_status := 'unpaid';
  ELSIF v_total_paid >= v_total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Check if there are any refunded payments
  IF EXISTS (
    SELECT 1 FROM tours_payments 
    WHERE booking_id = v_booking_id 
      AND payment_status = 'refunded'
  ) THEN
    v_new_status := 'refunded';
  END IF;

  -- Update booking
  UPDATE tours_bookings
  SET 
    total_paid = v_total_paid,
    payment_status = v_new_status,
    updated_at = NOW()
  WHERE id = v_booking_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic payment status updates
DROP TRIGGER IF EXISTS trg_update_payment_status ON tours_payments;
CREATE TRIGGER trg_update_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON tours_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_payment_status();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on payments
DROP TRIGGER IF EXISTS trg_payments_updated_at ON tours_payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON tours_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE tours_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Auth users read completed payments" ON tours_payments;
DROP POLICY IF EXISTS "Operators insert payments" ON tours_payments;
DROP POLICY IF EXISTS "Operators update own payments" ON tours_payments;
DROP POLICY IF EXISTS "Operators delete own payments" ON tours_payments;

-- Policy: Authenticated users can read all completed payments
CREATE POLICY "Auth users read completed payments"
  ON tours_payments
  FOR SELECT
  TO authenticated
  USING (payment_status = 'completed' OR recorded_by = auth.uid());

-- Policy: Operators can insert payments for their packages
CREATE POLICY "Operators insert payments"
  ON tours_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tours_bookings b
      JOIN tours_packages p ON p.id = b.package_id
      JOIN tours_operators o ON o.id = p.operator_id
      WHERE b.id = booking_id
        AND o.profile_id = auth.uid()
    )
  );

-- Policy: Operators can update their own payments
CREATE POLICY "Operators update own payments"
  ON tours_payments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_bookings b
      JOIN tours_packages p ON p.id = b.package_id
      JOIN tours_operators o ON o.id = p.operator_id
      WHERE b.id = booking_id
        AND o.profile_id = auth.uid()
    )
  );

-- Policy: Operators can delete their own payments
CREATE POLICY "Operators delete own payments"
  ON tours_payments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_bookings b
      JOIN tours_packages p ON p.id = b.package_id
      JOIN tours_operators o ON o.id = p.operator_id
      WHERE b.id = booking_id
        AND o.profile_id = auth.uid()
    )
  );

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Show table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_payments'
ORDER BY ordinal_position;

-- Show payment status on existing bookings
SELECT 
  booking_reference,
  status,
  total_amount,
  COALESCE(total_paid, 0) as total_paid,
  COALESCE(payment_status, 'unpaid') as payment_status
FROM tours_bookings
ORDER BY created_at DESC
LIMIT 5;
