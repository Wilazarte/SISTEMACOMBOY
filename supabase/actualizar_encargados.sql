-- Nombres reales y cargos de los encargados (se muestran en el header de cada módulo).
-- Nota: la columna del nombre de usuario en perfiles es "usuario" (no "username").
alter table perfiles add column if not exists cargo text;
alter table perfiles add column if not exists nombre_completo text;

update perfiles set nombre_completo = 'LIZBETH CAHUANA APFATA', cargo = 'Tesorera - Módulo de Compras' where rol ilike '%tesor%' or rol ilike '%compra%' or usuario ilike '%lizbeth%' or usuario ilike '%tesor%';
update perfiles set nombre_completo = 'JOSE MANUEL ORTIZ ARAPA', cargo = 'Jefe de Almacén' where rol ilike '%almacen%' or usuario ilike '%jose%' or usuario ilike '%ortiz%' or usuario ilike '%almacen%';
