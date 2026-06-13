// Seed script to populate initial data
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Password hashing using SHA-256 with salt (same legacy salt as auth.ts)
// New passwords will be auto-upgraded to per-user random salt on first login
const LEGACY_SALT = 'alsadeq-system-2026';

function hashPasswordSync(password: string): string {
  return createHash('sha256').update(password + LEGACY_SALT).digest('hex');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  console.log('Seeding database...');

  // Check if admin user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('username', 'admin')
    .single();

  if (!existingUser) {
    const hashedPassword = hashPasswordSync('admin123');
    const { error } = await supabase.from('users').insert({
      username: 'admin',
      password_hash: hashedPassword,
      full_name: 'علي محمد الصادق',
    });
    if (error) {
      console.error('Error creating admin user:', error);
    } else {
      console.log('Created admin user (password hashed)');
    }
  } else {
    console.log('Admin user already exists');
  }

  // Check if settings exist
  const { data: existingSettings } = await supabase
    .from('settings')
    .select('id')
    .limit(1)
    .single();

  if (!existingSettings) {
    const { error } = await supabase.from('settings').insert({
      factory_name: 'مصنع الصادق',
      address: 'القاهرة - المعادي',
      phone: '01012345678',
      tax_number: '123-456-789',
      default_tax_rate: 14,
    });
    if (error) {
      console.error('Error creating settings:', error);
    } else {
      console.log('Created settings');
    }
  } else {
    console.log('Settings already exist');
  }

  // Create sample branches
  const { data: existingBranches } = await supabase
    .from('branches')
    .select('id')
    .limit(1);

  if (!existingBranches || existingBranches.length === 0) {
    const { error } = await supabase.from('branches').insert([
      { name: 'فرع المعادي', address: '15 شارع 9 المعادي', phone: '01012345678', is_active: true },
      { name: 'فرع مصر الجديدة', address: '25 شارع الحجاز', phone: '01098765432', is_active: true },
      { name: 'فرع مدينة نصر', address: '8 شارع عباس العقاد', phone: '01155544433', is_active: true },
      { name: 'فرع الدقي', address: '3 شارع التحرير', phone: '01233344455', is_active: true },
      { name: 'فرع حلوان', address: '20 شارع منصور', phone: '01566677788', is_active: false },
    ]);
    if (error) {
      console.error('Error creating branches:', error);
    } else {
      console.log('Created sample branches');
    }
  } else {
    console.log('Branches already exist');
  }

  console.log('Seed completed!');
}

seed();
