// Crea los usuarios base del ERP en Supabase Auth (solo los que faltan).
// Uso, en la PC del administrador:
//   CLAVE_INICIAL='una-clave-larga' node --env-file=.env.local scripts/crear-usuarios.mjs
// La contraseña no va en el código: se pasa en CLAVE_INICIAL (mínimo 10 caracteres)
// y cada usuario debe cambiarla al entrar. Un usuario que ya existe NO se toca
// (antes se borraba y se volvía a crear, y perdía su perfil).
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const clave = process.env.CLAVE_INICIAL ?? ''
if (!url || !serviceKey) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (clave.length < 10 || /^(\d)\1*$|^123456/.test(clave)) { console.error('Defina CLAVE_INICIAL con al menos 10 caracteres (no 123456...)'); process.exit(1) }
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const correos = ['creador', 'tesoreria', 'almacen', 'planilla', 'gerencia'].map((u) => `${u}@comboyvid.local`)
const { data: existentes, error: eLista } = await supabase.auth.admin.listUsers({ perPage: 1000 })
if (eLista) { console.error('No se pudo listar usuarios:', eLista.message); process.exit(1) }
for (const email of correos) {
  if (existentes.users.some((x) => x.email?.toLowerCase() === email)) { console.log(`Ya existe ${email}: no se modifica`); continue }
  const { data, error } = await supabase.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: {} })
  if (error) console.error(`Error ${email}:`, error.message)
  else console.log(`Creado ${email} -> ${data.user.id}`)
}
