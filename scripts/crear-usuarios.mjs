import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const usuarios = [
  { email: 'creador@comboyvid.local', password: '123456' },
  { email: 'tesoreria@comboyvid.local', password: '123456' },
  { email: 'almacen@comboyvid.local', password: '123456' },
  { email: 'planilla@comboyvid.local', password: '123456' },
  { email: 'gerencia@comboyvid.local', password: '123456' },
]
for (const u of usuarios) {
  const { data: existing } = await supabase.auth.admin.listUsers()
  const found = existing?.users?.find(x => x.email?.toLowerCase() === u.email.toLowerCase())
  if (found) { await supabase.auth.admin.deleteUser(found.id); console.log(`Borrado ${u.email}`) }
  const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: {} })
  if (error) console.error(`Error ${u.email}:`, error.message)
  else console.log(`Creado ${u.email} -> ${data.user.id}`)
}
