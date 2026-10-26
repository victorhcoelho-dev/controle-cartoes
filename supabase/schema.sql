-- Controle de Cartões — schema do Supabase
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem problema.

-- ============ CARTÕES ============
create table if not exists public.cartoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 60),
  final       text not null default '' check (final = '' or final ~ '^[0-9]{4}$'),  -- só os 4 últimos dígitos
  modalidade  text not null default 'credito' check (modalidade in ('credito','debito')),
  cor         text not null default 'petroleo',
  limite      numeric(12,2) not null default 0 check (limite >= 0),
  fechamento  smallint not null default 0 check (fechamento between 0 and 31),
  vencimento  smallint not null default 0 check (vencimento between 0 and 31),
  created_at  timestamptz not null default now()
);
create index if not exists cartoes_user_idx on public.cartoes (user_id);

-- ============ LANÇAMENTOS (despesas e receitas) ============
create table if not exists public.lancamentos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('despesa','receita')),
  descricao   text not null check (char_length(descricao) between 1 and 120),
  valor       numeric(12,2) not null check (valor > 0),
  data        date not null default current_date,
  categoria   text not null default 'Outros',
  pagamento   text,                 -- id do cartão, ou 'pix' | 'dinheiro' | 'boleto' (nulo em receitas)
  parcelas    smallint not null default 1 check (parcelas between 1 and 48),
  obs         text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists lancamentos_user_data_idx on public.lancamentos (user_id, data);

-- ============ PREFERÊNCIAS (categorias) ============
create table if not exists public.preferencias (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  cat_despesa  text[] not null default array['Mercado','Alimentação','Moradia','Contas da casa','Transporte','Assinaturas','Saúde','Lazer','Compras','Educação','Outros'],
  cat_receita  text[] not null default array['Salário','Freelance','Rendimentos','Reembolso','Vendas','Outros'],
  updated_at   timestamptz not null default now()
);

-- ============ SEGURANÇA: cada usuário só vê e altera o que é dele ============
alter table public.cartoes      enable row level security;
alter table public.lancamentos  enable row level security;
alter table public.preferencias enable row level security;

drop policy if exists "cartoes do dono" on public.cartoes;
create policy "cartoes do dono" on public.cartoes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "lancamentos do dono" on public.lancamentos;
create policy "lancamentos do dono" on public.lancamentos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "preferencias do dono" on public.preferencias;
create policy "preferencias do dono" on public.preferencias
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
