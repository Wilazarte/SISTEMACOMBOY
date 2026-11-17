-- =====================================================================
-- CATEGORÍAS DE PRODUCTOS (Almacén, Catálogo, Logística y Secocha)
-- Ejecutar UNA vez en Supabase > SQL Editor. Se puede volver a correr sin riesgo (idempotente).
-- Requiere el catálogo maestro (20261022_unificar_productos.sql), que ya está en producción.
--
-- Qué hace:
--   1. Crea la lista de categorías (tabla productos_categorias), editable desde el ERP por el administrador.
--   2. Carga la lista inicial (repuestos, equipos, herramientas, insumos de soldadura, pernocentro, pintura…).
--   3. Carga inicial: a cada producto SIN categoría le pone la categoría sugerida por su nombre
--      (PERNO… -> Pernocentro, ELECTRODO… -> Insumos de soldadura). Lo que no reconoce queda sin categoría
--      para revisarlo en el ERP (Catálogo de Productos > Categorías).
--   4. Un producto nuevo sin categoría recibe la sugerida automáticamente.
--
-- Qué NO hace: no crea ni borra productos, no cambia nombres, no toca el stock ni el kardex.
-- Un producto que ya tiene categoría no se modifica (solo se corrige la escritura si coincide con la lista:
-- "repuesto", "REPUESTOS" -> "Repuestos").
-- =====================================================================

-- 1. Lista de categorías
create table if not exists public.productos_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  -- Palabras clave (MAYÚSCULAS, sin tildes) para sugerir la categoría por el nombre del producto
  palabras text[] not null default '{}',
  orden integer not null default 500,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists productos_categorias_nombre_uq on public.productos_categorias (lower(btrim(nombre)));
-- Clave fija de las categorías de la lista inicial: si se renombran o se desactivan en el ERP, volver a correr
-- este script no las vuelve a crear
alter table public.productos_categorias add column if not exists clave text;
create unique index if not exists productos_categorias_clave_uq on public.productos_categorias (clave);

-- 2. Lista inicial (una categoría ya creada, renombrada o desactivada no se toca: se respetan los cambios hechos en el ERP)
drop table if exists tmp_categorias_base;
create temp table tmp_categorias_base (nombre text, descripcion text, orden integer, palabras text[]);
insert into tmp_categorias_base (nombre, descripcion, orden, palabras) values
    ('Repuestos', 'Repuestos de equipos y vehículos', 10, array['REPUESTO', 'BUJIA', 'FAJA', 'CORREA', 'EMPAQUE', 'EMPAQUETADURA', 'PASTILLA DE FRENO', 'ZAPATA', 'DISCO DE FRENO', 'AMORTIGUADOR', 'MUELLE', 'RESORTE', 'BOMBA', 'ALTERNADOR', 'ARRANCADOR', 'RADIADOR', 'EMBRAGUE', 'CRUCETA', 'ROTULA', 'CARBURADOR', 'INYECTOR', 'PISTON', 'PINON', 'CATALINA', 'CADENA DE TRANSMISION', 'ESPEJO', 'BOCAMASA', 'TAMBOR', 'CAJA DE CAMBIOS', 'CORONA', 'DIFERENCIAL', 'PALIER', 'TERMINAL DE DIRECCION', 'SOPORTE DE MOTOR', 'KIT DE ARRASTRE', 'KIT DE REPARACION']::text[]),
    ('Equipos', 'Equipos y maquinaria', 20, array['REMOLCADOR', 'ECO MINE', 'LOCOMOTORA', 'WINCHE', 'CARRO MINERO', 'MOTOCARGUERO', 'COMPRESORA', 'COMPRESOR', 'GENERADOR', 'GRUPO ELECTROGENO', 'ELECTROBOMBA', 'MOTOBOMBA', 'MOTOR', 'MAQUINA DE SOLDAR', 'SOLDADORA', 'TORNO', 'EQUIPO']::text[]),
    ('Herramientas', 'Herramientas manuales y eléctricas', 30, array['HERRAMIENTA', 'LLAVE', 'ALICATE', 'DESARMADOR', 'DESTORNILLADOR', 'MARTILLO', 'COMBA', 'TALADRO', 'AMOLADORA', 'ESMERIL', 'BROCA', 'DADO', 'RACHE', 'RATCHET', 'SIERRA', 'ARCO DE SIERRA', 'HOJA DE SIERRA', 'LIMA', 'CINCEL', 'PRENSA', 'TORNILLO DE BANCO', 'GATA', 'TECLE', 'EXTRACTOR', 'MACHO', 'TARRAJA', 'NIVEL', 'ESCUADRA', 'REMACHADORA', 'PISTOLA', 'CIZALLA', 'CARRETILLA', 'PALA', 'PICO', 'BARRETA', 'ESCALERA', 'TIJERA', 'CUTER', 'CUCHILLA', 'ESPATULA', 'PUNZON', 'ENGRASADORA', 'JUEGO DE LLAVES', 'JUEGO DE DADOS']::text[]),
    ('Insumos de soldadura', 'Electrodos, alambres y consumibles de soldar', 40, array['SOLDADURA', 'ELECTRODO', 'ALAMBRE MIG', 'ALAMBRE TUBULAR', 'ALAMBRE DE SOLDAR', 'VARILLA DE APORTE', 'BOQUILLA', 'TOBERA', 'DIFUSOR', 'PUNTA DE CONTACTO', 'TIP DE CONTACTO', 'ANTORCHA', 'PORTAELECTRODO', 'PORTA ELECTRODO', 'PINZA DE TIERRA', 'FUNDENTE', 'CELLOCORD', 'SUPERCITO', 'CHAMFERCORD', 'TUNGSTENO', 'LINER', 'ANTISALPICADURA', 'ANTI SALPICADURA', 'MIG', 'TIG']::text[]),
    ('Pernocentro', 'Pernos, tuercas, arandelas y fijaciones', 50, array['PERNO', 'TUERCA', 'ARANDELA', 'ESPARRAGO', 'TORNILLO', 'AUTOPERFORANTE', 'PRISIONERO', 'ANILLO DE PRESION', 'VOLANDA', 'REMACHE', 'CHAVETA', 'PASADOR', 'TIRAFON', 'HUACHA', 'SEGURO SEEGER', 'STOVE BOLT']::text[]),
    ('Pintura', 'Pinturas, bases, disolventes y accesorios', 60, array['PINTURA', 'ESMALTE', 'THINNER', 'TINER', 'ANTICORROSIVO', 'ANTICORROSIVA', 'BARNIZ', 'LACA', 'MASILLA', 'BROCHA', 'RODILLO', 'SPRAY', 'AEROSOL', 'DILUYENTE', 'TEMPLE', 'IMPRIMANTE', 'SELLADOR', 'EPOXICA', 'EPOXICO', 'CATALIZADOR', 'PRIMER', 'WASH PRIMER', 'CINTA MASKING', 'MASKING', 'ZINCROMATO', 'GLOSS']::text[]),
    ('Combustibles', 'Gasolina, petróleo y otros combustibles', 70, array['COMBUSTIBLE', 'GASOLINA', 'GASOHOL', 'PETROLEO', 'DIESEL', 'DB5', 'GLP', 'KEROSENE']::text[]),
    ('Lubricantes y grasas', 'Aceites, grasas, refrigerantes y aditivos', 80, array['ACEITE', 'GRASA', 'LUBRICANTE', 'REFRIGERANTE', 'LIQUIDO DE FRENO', 'LIQUIDO DE FRENOS', 'HIDROLINA', 'WD40', 'WD 40', 'AFLOJATODO', 'ADITIVO']::text[]),
    ('EPP', 'Equipos de protección personal', 90, array['EPP', 'GUANTE', 'CASCO', 'LENTE', 'RESPIRADOR', 'MASCARILLA', 'BOTA', 'BOTIN', 'ZAPATO', 'CHALECO', 'MAMELUCO', 'OVEROL', 'TAPON', 'TAPON DE OIDO', 'OREJERA', 'ARNES', 'LINEA DE VIDA', 'CARETA', 'MANDIL', 'ESCARPIN', 'MANGA DE CUERO', 'BARBIQUEJO', 'CORTAVIENTO', 'UNIFORME', 'POLO', 'PANTALON', 'CASACA', 'FILTRO PARA RESPIRADOR', 'CARTUCHO PARA RESPIRADOR', 'TRAJE TYVEK', 'RODILLERA']::text[]),
    ('Neumáticos', 'Llantas, cámaras y aros', 100, array['NEUMATICO', 'LLANTA', 'CAMARA', 'ARO', 'PARCHE', 'VALVULA DE LLANTA', 'PITON']::text[]),
    ('Oficina', 'Útiles y equipos de oficina', 110, array['PAPEL', 'PAPEL BOND', 'LAPICERO', 'LAPIZ', 'FOLDER', 'ARCHIVADOR', 'TONER', 'TINTA', 'CUADERNO', 'ENGRAPADOR', 'GRAPA', 'PERFORADOR', 'RESALTADOR', 'PLUMON', 'SOBRE', 'CLIP', 'CORRECTOR', 'TAMPON PARA SELLO', 'SELLO', 'IMPRESORA', 'MOUSE', 'TECLADO', 'USB', 'POST IT', 'BORRADOR', 'TAJADOR', 'FILE', 'MICA']::text[]),
    ('Piezas torneadas', 'Piezas fabricadas en torno o maquinadas', 120, array['TORNEADO', 'TORNEADA', 'BOCINA', 'BUJE', 'BRIDA', 'PIN', 'MAQUINADO', 'MAQUINADA', 'FRESADO', 'FRESADA', 'MECANIZADO', 'MECANIZADA', 'CASQUILLO', 'POLEA']::text[]),
    ('Aceros y perfiles', 'Planchas, tubos, ángulos, platinas y barras', 130, array['PLANCHA', 'TUBO', 'ANGULO', 'PLATINA', 'VIGA', 'CANAL U', 'PERFIL', 'FIERRO', 'BARRA', 'VARILLA', 'ACERO', 'PLATABANDA', 'MALLA', 'LAMINA', 'CALAMINA', 'ALUMINIO', 'BRONCE']::text[]),
    ('Abrasivos y corte', 'Discos, lijas y escobillas', 140, array['ABRASIVO', 'DISCO', 'LIJA', 'PIEDRA DE ESMERIL', 'PIEDRA ESMERIL', 'ESCOBILLA DE ACERO', 'ESCOBILLA CIRCULAR', 'ESCOBILLA DE COPA', 'FLAP', 'GRATA', 'POLIFAN', 'PASTA DE PULIR']::text[]),
    ('Eléctricos y electrónicos', 'Cables, baterías, luces y control', 150, array['CABLE', 'BATERIA', 'FOCO', 'FARO', 'FUSIBLE', 'INTERRUPTOR', 'ENCHUFE', 'TOMACORRIENTE', 'CONTACTOR', 'RELAY', 'RELE', 'TERMINAL', 'CINTA AISLANTE', 'LLAVE TERMICA', 'LLAVE TERMOMAGNETICA', 'TERMOMAGNETICO', 'BREAKER', 'LED', 'LUMINARIA', 'REFLECTOR', 'FLUORESCENTE', 'SENSOR', 'CONTROLADOR', 'CARGADOR', 'INVERSOR', 'PULSADOR', 'BORNE', 'CONECTOR', 'EXTENSION', 'SIRENA', 'CIRCULINA', 'ALARMA', 'CLAXON', 'PILA', 'TABLERO', 'MOTOR ELECTRICO']::text[]),
    ('Hidráulica y neumática', 'Mangueras, válvulas, cilindros y conexiones', 160, array['MANGUERA', 'CILINDRO HIDRAULICO', 'BOMBA HIDRAULICA', 'VALVULA', 'ACOPLE', 'NIPLE', 'RACOR', 'CONEXION', 'UNION', 'CODO', 'ORING', 'O RING', 'FERRUL', 'ADAPTADOR', 'REDUCCION']::text[]),
    ('Rodamientos y retenes', 'Rodajes, retenes y chumaceras', 170, array['RODAMIENTO', 'RODAJE', 'RETEN', 'CHUMACERA', 'COJINETE']::text[]),
    ('Filtros', 'Filtros de aire, aceite, combustible e hidráulicos', 180, array['FILTRO']::text[]),
    ('Ferretería general', 'Materiales varios de ferretería', 190, array['ALAMBRE', 'CLAVO', 'SOGA', 'CADENA', 'CANDADO', 'BISAGRA', 'SILICONA', 'PEGAMENTO', 'TEFLON', 'CINTA TEFLON', 'ABRAZADERA', 'CEMENTO', 'ARENA', 'TARUGO', 'CINTILLO', 'PRECINTO', 'CERRADURA', 'PICAPORTE', 'CINTA', 'PLASTICO', 'MANTA', 'LONA', 'TRIPLAY', 'MADERA', 'CAUCHO', 'JEBE', 'SIKA', 'SOLDIMIX']::text[]),
    ('Limpieza', 'Artículos de limpieza', 200, array['DETERGENTE', 'LEJIA', 'ESCOBA', 'TRAPO', 'TRAPEADOR', 'WAYPE', 'WAIPE', 'JABON', 'DESINFECTANTE', 'DESENGRASANTE', 'RECOGEDOR', 'BOLSA DE BASURA', 'PAPEL HIGIENICO', 'PAPEL TOALLA', 'AMBIENTADOR', 'ESPONJA', 'FRANELA', 'ALCOHOL']::text[]),
    ('Seguridad y señalización', 'Extintores, conos, señales y botiquín', 210, array['EXTINTOR', 'CONO', 'CINTA DE SEGURIDAD', 'CINTA REFLECTIVA', 'CINTA DE SENALIZACION', 'SENAL', 'SENALETICA', 'LETRERO', 'BOTIQUIN', 'MALLA DE SEGURIDAD', 'TRANQUERA', 'CANDADO DE BLOQUEO', 'TARJETA DE BLOQUEO']::text[]),
    ('Gases industriales', 'Oxígeno, argón, CO2 y acetileno', 220, array['OXIGENO', 'ARGON', 'CO2', 'ACETILENO', 'NITROGENO', 'MEZCLA ARGON', 'BALON DE GAS', 'GAS']::text[]),
    ('Instrumentos de medición', 'Vernier, multímetros, manómetros y balanzas', 230, array['VERNIER', 'CALIBRADOR', 'MICROMETRO', 'MULTIMETRO', 'PINZA AMPERIMETRICA', 'TERMOMETRO', 'MANOMETRO', 'FLEXOMETRO', 'WINCHA', 'BALANZA', 'RELOJ COMPARADOR', 'GALGA', 'TORQUIMETRO']::text[]),
    ('Embalaje', 'Material para embalar y despachar', 240, array['STRETCH FILM', 'FILM', 'CARTON', 'CAJA', 'ZUNCHO', 'BOLSA', 'CINTA DE EMBALAJE', 'BURBUPACK', 'PALLET', 'PARIHUELA']::text[]),
    ('Otros', 'Lo que no entra en ninguna otra categoría', 990, array[]::text[])
;
-- Categoría con el mismo nombre creada antes sin clave: se le asigna
update public.productos_categorias c set clave = lower(v.nombre)
  from tmp_categorias_base v
 where c.clave is null and lower(btrim(c.nombre)) = lower(v.nombre)
   and not exists (select 1 from public.productos_categorias o where o.clave = lower(v.nombre));
insert into public.productos_categorias (clave, nombre, descripcion, orden, palabras)
select lower(v.nombre), v.nombre, v.descripcion, v.orden, v.palabras
  from tmp_categorias_base v
 where not exists (select 1 from public.productos_categorias c where c.clave = lower(v.nombre) or lower(btrim(c.nombre)) = lower(btrim(v.nombre)));
drop table tmp_categorias_base;

-- 3. Texto para comparar: MAYÚSCULAS, sin tildes, y todo lo que no es letra o número como espacio
create or replace function public.categoria_texto(p_texto text) returns text
language sql immutable as $$
  select btrim(regexp_replace(translate(upper(coalesce(p_texto, '')), 'ÁÉÍÓÚÜÑÀÈÌÒÙ', 'AEIOUUNAEIOU'), '[^A-Z0-9]+', ' ', 'g'))
$$;

-- Categoría sugerida por el nombre: gana la palabra clave que aparece primero en el nombre
-- ("ACEITE HIDRAULICO" -> Lubricantes, "FILTRO DE ACEITE" -> Filtros); si empatan, la más larga
-- ("DISCO DE FRENO" antes que "DISCO") y luego el orden de la categoría. Palabra entera, también en plural.
-- Misma regla que sugerirCategoria() en lib/categorias-productos.ts.
create or replace function public.categoria_sugerida(p_nombre text) returns text
language sql stable set search_path = public as $$
  select c.nombre
    from public.productos_categorias c
   cross join lateral unnest(c.palabras) as pal(palabra)
   cross join lateral (select public.categoria_texto(pal.palabra) as p, ' ' || public.categoria_texto(p_nombre) || ' ' as n) x
   cross join lateral (select least(nullif(position(' ' || x.p || ' ' in x.n), 0),
                                    nullif(position(' ' || x.p || 'S ' in x.n), 0),
                                    nullif(position(' ' || x.p || 'ES ' in x.n), 0)) as pos) y
   where c.activo and x.p <> '' and y.pos is not null
   order by y.pos, length(x.p) desc, c.orden, c.nombre
   limit 1
$$;

-- 4. Permisos: todos los usuarios con rol leen la lista; solo el administrador la cambia (igual que el catálogo)
alter table public.productos_categorias enable row level security;
drop policy if exists productos_categorias_select on public.productos_categorias;
drop policy if exists productos_categorias_admin on public.productos_categorias;
create policy productos_categorias_select on public.productos_categorias for select to authenticated using (public.mi_rol() <> 'sin_rol');
create policy productos_categorias_admin on public.productos_categorias for all to authenticated using (public.es_admin_productos()) with check (public.es_admin_productos());
grant select, insert, update, delete on public.productos_categorias to authenticated;
grant execute on function public.categoria_texto(text), public.categoria_sugerida(text) to authenticated;

-- 5. Al cambiar el nombre de una categoría, los productos que la tenían pasan al nombre nuevo
create or replace function public.productos_categorias_renombrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nombre := btrim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    update public.productos_maestro set categoria = new.nombre where categoria = old.nombre;
  end if;
  return new;
end $$;
drop trigger if exists trg_productos_categorias_renombrar on public.productos_categorias;
create trigger trg_productos_categorias_renombrar before insert or update on public.productos_categorias
  for each row execute function public.productos_categorias_renombrar();

-- 6. Producto nuevo sin categoría (alta directa o solicitud aprobada): recibe la sugerida por su nombre
create or replace function public.productos_maestro_categoria() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(btrim(new.categoria), '') = '' then
    new.categoria := public.categoria_sugerida(coalesce(new.nombre_normalizado, new.nombre_display));
  end if;
  return new;
end $$;
drop trigger if exists trg_productos_maestro_categoria on public.productos_maestro;
create trigger trg_productos_maestro_categoria before insert on public.productos_maestro
  for each row execute function public.productos_maestro_categoria();

-- 7. Categorías escritas a mano que coinciden con la lista: se corrige solo la escritura ("repuesto" -> "Repuestos")
update public.productos_maestro m
   set categoria = c.nombre
  from public.productos_categorias c
 where coalesce(btrim(m.categoria), '') <> ''
   and m.categoria is distinct from c.nombre
   and public.categoria_texto(m.categoria) in (public.categoria_texto(c.nombre), public.categoria_texto(c.nombre) || 'S', regexp_replace(public.categoria_texto(c.nombre), 'S$', ''));

-- 8. CARGA INICIAL: solo productos sin categoría. Lo que no se reconoce queda vacío para revisarlo en el ERP.
update public.productos_maestro m
   set categoria = s.sugerida
  from (select p.nombre_normalizado, public.categoria_sugerida(p.nombre_normalizado) as sugerida
          from public.productos_maestro p
         where coalesce(btrim(p.categoria), '') = '') s
 where m.nombre_normalizado = s.nombre_normalizado
   and coalesce(btrim(m.categoria), '') = ''
   and s.sugerida is not null;

create index if not exists idx_productos_maestro_categoria on public.productos_maestro (categoria);

-- 9. Tiempo real: un cambio en la lista llega a las otras PCs
do $$
begin
  begin
    alter publication supabase_realtime add table public.productos_categorias;
  exception when duplicate_object or undefined_object then null;
  end;
end $$;
notify pgrst, 'reload schema';

-- 10. RESULTADO: cuántos productos quedaron en cada categoría (la fila "(sin categoría)" es lo que falta revisar)
select categoria, productos
  from (select coalesce(nullif(btrim(m.categoria), ''), '(sin categoría)') as categoria, count(*) as productos
          from public.productos_maestro m
         group by 1) r
 order by (categoria = '(sin categoría)'), productos desc, categoria;
