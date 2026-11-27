-- Pause monitoring per device, and a log of status changes (used for availability)
alter table devices add column monitor_paused boolean not null default false;
create table device_status_log (
  id bigserial primary key,
  device_id uuid not null references devices(id) on delete cascade,
  at timestamptz not null default now(),
  status text not null
);
create index device_status_log_device_at on device_status_log (device_id, at);
-- Temperature and SMART rules are live for devices that report them. 60 °C suits drives better than 85.
update alert_rules set threshold = 60 where key = 'temperature' and threshold = 85;
