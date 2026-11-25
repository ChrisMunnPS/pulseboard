-- Device types and real monitoring. Existing devices keep 'simulated' until you edit them.
alter table devices add column device_type text not null default 'server'
  check (device_type in ('computer','server','router','switch','firewall','access-point','nas','other'));
alter table devices add column monitor text not null default 'simulated'
  check (monitor in ('simulated','ping','tcp','snmp'));
alter table devices add column monitor_config jsonb not null default '{}';
-- SNMP community or v3 keys, sealed with AES-256-GCM; never returned by the API
alter table devices add column monitor_secret_enc text;
alter table devices add column last_seen timestamptz;
