-- Create tours_package_inclusions table
-- Task 1.1: Package Inclusions Table Schema
-- This table stores inclusion/exclusion items for tour packages

CREATE TABLE IF NOT EXISTS tours_package_inclusions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint on (package_id, display_order) to ensure no duplicate ordering within a package
  UNIQUE(package_id, display_order)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_package_inclusions_package_id 
  ON tours_package_inclusions(package_id);

CREATE INDEX IF NOT EXISTS idx_package_inclusions_order 
  ON tours_package_inclusions(package_id, display_order);

-- Grant permissions to authenticated users
GRANT ALL ON tours_package_inclusions TO authenticated;

-- Create tours_package_gallery table
-- Task 1.2: Package Gallery Table Schema
-- This table stores gallery images associated with tour packages

CREATE TABLE IF NOT EXISTS tours_package_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint on (package_id, display_order) to ensure no duplicate ordering within a package
  UNIQUE(package_id, display_order),
  
  -- Check constraint to enforce max 20 images per package
  CONSTRAINT max_images_per_package CHECK (
    (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = tours_package_gallery.package_id) <= 20
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_package_gallery_package_id 
  ON tours_package_gallery(package_id);

CREATE INDEX IF NOT EXISTS idx_package_gallery_order 
  ON tours_package_gallery(package_id, display_order);

-- Grant permissions to authenticated users
GRANT ALL ON tours_package_gallery TO authenticated;
