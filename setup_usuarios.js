require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const usuarios = [
  { email: 'creador@comboyvid.local', password: 'Comboy2024*', rol: 'creador', nombre: 'Creador Sistema' },
  { email: 'tesoreria@comboyvid.local', password: 'Comboy2024*', rol: 'tesoreria', nombre: 'Tesoreria' },
  { email: 'almacen@comboyvid.local', password: 'Comboy2024*', rol: 'almacen', nombre: 'Almacen' },
  { email: 'planilla@comboyvid.local', password: 'Comboy2024*', rol: 'planilla', nombre: 'Planilla' },
  { email: 'gerencia@comboyvid.local', password: 'Comboy2024*', rol: 'gerencia', nombre: 'Gerencia' },
];
(async () => {
  for (const u of usuarios) {
    console.log(`Creando ${u.email}...`);
    const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { rol: u.rol } });
    if (error && !error.message.includes('already registered')) console.error(error.message);
    else console.log(`OK ${u.email}`);
  }
  console.log('Listo');
})();