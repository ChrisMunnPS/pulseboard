-- Users: disable accounts, and revoke old sessions when a password changes
alter table users add column disabled boolean not null default false;
alter table users add column pw_changed_at timestamptz not null default now();

-- Alerts raised by rules (one open alert per device and rule)
alter table alerts add column rule_key text;
alter table alerts add column resolved_at timestamptz;
create unique index alerts_one_open_per_rule on alerts (device_id, rule_key)
  where state <> 'resolved' and rule_key is not null;

create table alert_rules (
  key text primary key,
  threshold double precision not null,
  duration_s integer not null check (duration_s between 0 and 86400),
  severity text not null check (severity in ('critical','warning','info')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into alert_rules (key, threshold, duration_s, severity) values
  ('cpu', 85, 300, 'warning'), ('memory', 90, 300, 'warning'), ('disk', 90, 0, 'critical'),
  ('offline', 0, 300, 'critical'), ('service', 1, 60, 'critical'),
  ('temperature', 85, 300, 'warning'), ('smart', 1, 0, 'critical');

-- Secrets (webhook URLs, SMTP password) are stored encrypted in secret_enc, never in config
create table notification_channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('email','teams','slack','discord','webhook')),
  name text not null,
  enabled boolean not null default true,
  min_severity text not null default 'warning' check (min_severity in ('critical','warning','info')),
  config jsonb not null default '{}',
  secret_enc text,
  created_at timestamptz not null default now()
);
