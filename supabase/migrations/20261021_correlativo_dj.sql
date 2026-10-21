-- Numeración automática de declaraciones juradas de gasto: DJ-0001, DJ-0002…
-- Aplicada en Supabase el 2026-10-21. El ERP la usa en registrarGastoCompleto (lib/storage.ts, siguienteDJ).
-- Arranca en 4 porque ya existían DJ-001, DJ-002, DJ-003 y "DJ_ 004" escritas a mano: la primera automática es DJ-0005.

create table if not exists public.correlativos (
  tipo text primary key,
  ultimo_numero int not null default 0
);
-- Solo se toca desde next_correlativo (security definer): sin acceso directo para nadie
alter table public.correlativos enable row level security;
revoke all on public.correlativos from anon, authenticated;
insert into public.correlativos (tipo, ultimo_numero) values ('DJ', 4) on conflict (tipo) do nothing;

create or replace function public.next_correlativo(t text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.mi_rol() not in ('creador', 'tesoreria') then
    raise exception 'Su usuario no puede emitir declaraciones juradas' using errcode = '42501';
  end if;
  update public.correlativos set ultimo_numero = ultimo_numero + 1 where tipo = t returning ultimo_numero into n;
  if n is null then
    raise exception 'Serie % no existe en correlativos', t using errcode = '22023';
  end if;
  return lpad(n::text, 4, '0');
end $$;
revoke execute on function public.next_correlativo(text) from public, anon;
grant execute on function public.next_correlativo(text) to authenticated;
