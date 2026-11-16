/**
 * Apply database migrations to Supabase
 * Run with: node scripts/apply-migrations.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function _applyMigration(migrationPath) {
  console.log(`\n📄 Applying migration: ${path.basename(migrationPath)}`);
  
  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the SQL
    const { data: _data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
      // If exec_sql doesn't exist, try direct execution (for simple queries)
      // Split by semicolon and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const _statement of statements) {
        const _result = await supabase.from('_migrations_temp').select('*').limit(0); // Dummy query to test connection
        // Since we can't execute raw SQL directly, we need to use Supabase SQL editor
        console.log('⚠️  Cannot execute SQL directly via API.');
        console.log('📋 Please copy and paste this SQL into Supabase SQL Editor:');
        console.log('\n' + '='.repeat(80));
        console.log(sql);
        console.log('='.repeat(80) + '\n');
        return;
      }
    });

    if (error) {
      console.error(`❌ Error applying migration: ${error.message}`);
      return false;
    }

    console.log(`✅ Migration applied successfully`);
    return true;
  } catch (err) {
    console.error(`❌ Error reading or applying migration: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting database migrations...\n');
  
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found');
    process.exit(1);
  }

  const migrationFile = path.join(migrationsDir, 'create_package_functions.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error('❌ Migration file not found');
    process.exit(1);
  }

  // Read and display the SQL
  const sql = fs.readFileSync(migrationFile, 'utf8');
  
  console.log('📋 Please apply this SQL in Supabase SQL Editor:');
  console.log('   1. Go to: https://supabase.com/dashboard/project/ipglyuksxlshwsmxdxyl/sql/new');
  console.log('   2. Copy and paste the SQL below');
  console.log('   3. Click "Run" button\n');
  console.log('='.repeat(80));
  console.log(sql);
  console.log('='.repeat(80) + '\n');
  
  console.log('✅ After running the SQL, your package creation will work!\n');
}

main();
