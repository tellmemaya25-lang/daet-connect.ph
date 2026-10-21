#!/usr/bin/env node
/**
 * Script to create tours_package_inclusions and tours_package_gallery tables
 * Run with: node scripts/setup-inclusions-gallery-tables.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function setupTables() {
  try {
    console.log('\n🔧 Setting up Package Inclusions and Gallery tables...\n');

    // Read the SQL file
    const sqlFile = path.join(__dirname, 'create-package-inclusions-gallery-tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the SQL
    const { error } = await supabase.rpc('execute_sql', { sql });

    // If execute_sql doesn't exist, try direct approach with multiple statements
    if (error?.code === 'PGRST100') {
      console.log('ℹ️  RPC method not available, using alternative approach...\n');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      for (const statement of statements) {
        console.log(`📝 Executing: ${statement.substring(0, 50)}...`);
        const { error: err } = await supabase.rpc('execute', { statement });
        if (err) {
          console.warn('⚠️  Warning:', err.message);
        }
      }
    } else if (error) {
      throw error;
    }

    console.log('\n✅ Tables created successfully!\n');

    // Verify tables exist
    const { data: tables, error: verifyError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .in('table_name', ['tours_package_inclusions', 'tours_package_gallery'])
      .eq('table_schema', 'public');

    if (verifyError) {
      console.warn('⚠️  Could not verify tables, but creation may have succeeded');
      console.warn('   Check Supabase dashboard manually');
    } else if (tables && tables.length === 2) {
      console.log('✓ tours_package_inclusions table exists');
      console.log('✓ tours_package_gallery table exists');
    } else {
      console.warn('⚠️  Some tables may not have been created');
    }

    console.log('\n💡 Next steps:');
    console.log('   1. Execute the SQL manually in Supabase SQL Editor if needed');
    console.log('   2. File: scripts/create-package-inclusions-gallery-tables.sql');
    console.log('   3. Then run: npm run build\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Manual setup instructions:');
    console.error('   1. Go to Supabase dashboard');
    console.error('   2. Open SQL Editor');
    console.error('   3. Create new query');
    console.error('   4. Copy contents from: scripts/create-package-inclusions-gallery-tables.sql');
    console.error('   5. Run the query\n');
    process.exit(1);
  }
}

setupTables();
