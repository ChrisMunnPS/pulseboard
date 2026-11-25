
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('owner','admin','operator','viewer','auditor')),
  created_at timestamptz not null default now()
);
create table devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  name text not null,
  os text not null,
  address text not null,
  mode text not null default 'agent',
  offline boolean not null default false,
  created_at timestamptz not null default now()
);
create table alerts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete cascade,
  severity text not null check (severity in ('critical','warning','info')),
  title text not null,
  detail text not null,
  state text not null default 'open' check (state in ('open','acked','resolved')),
  opened_at timestamptz not null default now(),
  acked_by uuid references users(id)
);
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target text,
  result text not null default 'ok',
  detail jsonb
);
-- Time-series store (filled by the agent in a later phase)
create table metrics (
  time timestamptz not null,
  device_id uuid not null,
  metric text not null,
  value double precision not null
);
select create_hypertable('metrics', 'time');
create index on metrics (device_id, metric, time desc);
