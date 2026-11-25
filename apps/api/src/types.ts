import type { DeviceType, Monitor } from '@pulse/shared';

export interface DeviceRow {
  id: string; name: string; os: string; address: string; offline: boolean; mode: string;
  device_type: DeviceType; monitor: Monitor; monitor_config: Record<string, unknown>; monitor_secret_enc: string | null;
}
export const DEVICE_COLUMNS = 'id,name,os,address,offline,mode,device_type,monitor,monitor_config,monitor_secret_enc';
