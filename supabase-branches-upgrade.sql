-- =====================================================
-- Branch Table Upgrade: Add branch-specific invoice data
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add new columns to branches table
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS tax_number TEXT,
  ADD COLUMN IF NOT EXISTS commercial_register TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS manager_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_footer TEXT;

-- Add comments for documentation
COMMENT ON COLUMN branches.email IS 'Branch email address for invoices';
COMMENT ON COLUMN branches.tax_number IS 'Branch tax number for invoices';
COMMENT ON COLUMN branches.commercial_register IS 'Branch commercial register number for invoices';
COMMENT ON COLUMN branches.logo_url IS 'Branch logo URL for invoices and receipts';
COMMENT ON COLUMN branches.manager_name IS 'Branch manager name for invoices';
COMMENT ON COLUMN branches.invoice_footer IS 'Custom footer text for branch invoices';

-- Update RLS policy to allow reading branch details for invoice generation
-- (Existing policies should already cover this, but just in case)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'branches'
ORDER BY ordinal_position;
