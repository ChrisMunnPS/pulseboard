import { pool } from './db';
import { DEVICE_COLUMNS, type DeviceRow } from './types';

let rows: DeviceRow[] = [];
export const getFleet = (): DeviceRow[] => rows;
export const findDevice = (id: string): DeviceRow | undefined => rows.find((d) => d.id === id);
export async function loadFleet(): Promise<DeviceRow[]> {
  rows = (await pool.query<DeviceRow>(`select ${DEVICE_COLUMNS} from devices order by name`)).rows;
  return rows;
}
