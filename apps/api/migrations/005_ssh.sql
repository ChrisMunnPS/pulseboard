-- Allow SSH as a monitoring method (read-only collector script, key authentication)
alter table devices drop constraint devices_monitor_check;
alter table devices add constraint devices_monitor_check check (monitor in ('simulated','ping','tcp','snmp','ssh'));
