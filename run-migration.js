// Quick script to run the SQL migration
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://oqzhxfggzveuhaldjuay.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xemh4ZmdnenZldWhhbGRqdWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNzY1MzksImV4cCI6MjA3NjY1MjUzOX0.htarTP53BwpXn4cBam_CMoRo3q1Rr7TQcK1XbU43ZqE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Adding group column to customers table...');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS "group" TEXT;`
  });
  
  if (error) {
    console.error('Error:', error);
    console.log('\n⚠️  Please run this SQL manually in Supabase dashboard:');
    console.log('ALTER TABLE customers ADD COLUMN IF NOT EXISTS "group" TEXT;');
  } else {
    console.log('✅ Migration successful!');
  }
}

runMigration();
