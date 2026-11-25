'use client';
import { DEVICE_TYPES, OS_CHOICES, type DeviceDetail, type DeviceType, type SnmpLevel } from '@pulse/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

const STEPS = ['Device', 'Address', 'Monitoring', 'Review'];
const TYPE_LABEL: Record<DeviceType, string> = { computer: 'Computer', server: 'Server', router: 'Router', switch: 'Switch', firewall: 'Firewall', 'access-point': 'Access point', nas: 'NAS', other: 'Other' };
const field = 'mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-ink';
const note = 'rounded-lg bg-raised p-3 text-sm text-muted';

interface F {
  name: string; type: DeviceType; address: string; os: string; monitor: 'ping' | 'tcp' | 'snmp'; port: string;
  version: 'v2c' | 'v3'; snmpPort: string; community: string; username: string; level: SnmpLevel;
  authProtocol: 'sha' | 'sha256' | 'sha512'; authKey: string; privProtocol: 'aes' | 'aes256b'; privKey: string;
}
const blank: F = { name: '', type: 'server', address: '', os: 'Linux', monitor: 'ping', port: '443', version: 'v3', snmpPort: '161', community: '', username: '', level: 'authPriv', authProtocol: 'sha256', authKey: '', privProtocol: 'aes', privKey: '' };

export default function DeviceForm({ id }: { id?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<F>(blank);
  const [hasSecret, setHasSecret] = useState(false);
  const [wasSimulated, setWasSimulated] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!id) return;
    api<DeviceDetail>(`/api/v1/devices/${id}`).then((d) => {
      const m = d.monitorInfo;
      setWasSimulated(d.monitor === 'simulated');
      setHasSecret(m.hasSecret);
      setF({ ...blank, name: d.name, type: d.type, address: d.address, os: d.os, monitor: d.monitor === 'simulated' ? 'ping' : d.monitor, port: String(m.port ?? 443),
        version: m.snmpVersion ?? 'v3', snmpPort: String(m.snmpVersion ? m.port ?? 161 : 161), username: m.username ?? '', level: m.securityLevel ?? 'authPriv',
        authProtocol: (m.authProtocol as F['authProtocol']) ?? 'sha256', privProtocol: (m.privProtocol as F['privProtocol']) ?? 'aes' });
    }).catch((e: Error) => setError(e.message));
  }, [id]);

  // Blank secrets are left out, which tells the server to keep the saved ones.
  const body = () => ({
    name: f.name, type: f.type, address: f.address, os: f.os, monitor: f.monitor,
    ...(f.monitor === 'tcp' ? { port: Number(f.port) } : {}),
    ...(f.monitor === 'snmp' ? { snmp: { version: f.version, port: Number(f.snmpPort),
      ...(f.version === 'v2c' ? { ...(f.community ? { community: f.community } : {}) } : {
        username: f.username, securityLevel: f.level,
        ...(f.level !== 'noAuthNoPriv' ? { authProtocol: f.authProtocol, ...(f.authKey ? { authKey: f.authKey } : {}) } : {}),
        ...(f.level === 'authPriv' ? { privProtocol: f.privProtocol, ...(f.privKey ? { privKey: f.privKey } : {}) } : {}) }) } } : {}),
  });

  const check = (): string => {
    if (step === 0 && !f.name.trim()) return 'Enter a name for the device.';
    if (step === 1 && !/^[A-Za-z0-9._:-]+$/.test(f.address.trim())) return 'Enter an IP address or hostname, for example 10.0.0.1 or router.lan.';
    return '';
  };
  const next = () => { const e = check(); setError(e); if (!e) setStep(step + 1); };

  async function test() {
    setBusy('test'); setResult(null);
    try { const r = await api<{ message: string }>('/api/v1/devices/test', { method: 'POST', body: JSON.stringify({ ...body(), ...(id ? { deviceId: id } : {}) }) }); setResult({ ok: true, text: r.message }); }
    catch (e) { setResult({ ok: false, text: (e as Error).message }); } finally { setBusy(''); }
  }
  async function save() {
    setBusy('save'); setError('');
    try {
      const d = await api<{ id: string }>(id ? `/api/v1/devices/${id}` : '/api/v1/devices', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body()) });
      router.push(`/devices/${d.id}`);
    } catch (e) { setError((e as Error).message); setBusy(''); }
  }

  const radio = (name: string, checked: boolean, on: () => void, title: string, help?: string) => (
    <label className="flex items-start gap-2 py-1.5"><input type="radio" name={name} checked={checked} onChange={on} className="mt-1" /><span>{title}{help && <span className="block text-sm text-muted">{help}</span>}</span></label>
  );
  const secretHint = hasSecret ? 'Leave blank to keep the saved one' : '';

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">{id ? `Edit ${f.name || 'device'}` : 'Add device'}</h1>
      <div className="max-w-2xl rounded-xl border border-line bg-surface p-5">
        <ol className="mb-5 flex flex-wrap gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={`rounded-full border px-3 py-1 text-sm ${i === step ? 'border-accent bg-accent text-on-accent' : i < step ? 'border-ok text-ok' : 'border-line text-muted'}`}>{i < step ? '✔ ' : ''}{i + 1}. {s}</li>
          ))}
        </ol>
        {wasSimulated && <p className={`${note} mb-4`}>◌ This device currently shows simulated data. Saving real monitoring settings replaces it with live readings.</p>}
        <form onSubmit={(e) => { e.preventDefault(); step < 3 ? next() : save(); }} noValidate>
          {step === 0 && (
            <div className="space-y-3">
              <label className="block text-sm text-muted">Device name<input autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} className={field} placeholder="e.g. core-switch-01" /></label>
              <label className="block text-sm text-muted">Type<select value={f.type} onChange={(e) => set('type', e.target.value as DeviceType)} className={field}>{DEVICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
            </div>)}
          {step === 1 && (
            <div className="space-y-3">
              <label className="block text-sm text-muted">IP address or hostname<input autoFocus value={f.address} onChange={(e) => set('address', e.target.value)} className={field} placeholder="10.0.0.1 or router.lan" /></label>
              <label className="block text-sm text-muted">Operating system<select value={f.os} onChange={(e) => set('os', e.target.value)} className={field}>{OS_CHOICES.map((o) => <option key={o}>{o}</option>)}</select></label>
              <p className={note}>ℹ Pulseboard runs in Docker, so <b>localhost</b> means the Pulseboard container itself. To monitor the PC that runs Docker, use <b>host.docker.internal</b>.</p>
            </div>)}
          {step === 2 && (
            <fieldset className="space-y-2"><legend className="mb-1 text-sm text-muted">How should Pulseboard check this device?</legend>
              {radio('mon', f.monitor === 'ping', () => set('monitor', 'ping'), 'Ping', 'Up or down, latency and packet loss. Works on anything that answers ping. No credentials.')}
              {radio('mon', f.monitor === 'tcp', () => set('monitor', 'tcp'), 'TCP port', 'For devices that ignore ping, such as Windows PCs. Checks that a port answers (for example 443 or 445).')}
              {radio('mon', f.monitor === 'snmp', () => set('monitor', 'snmp'), 'SNMP', 'Real CPU, memory, disks, network ports, processes and hardware details, where the device reports them. Routers, switches, NAS and Linux hosts.')}
              {f.monitor === 'tcp' && <label className="block text-sm text-muted">Port<input type="number" min={1} max={65535} value={f.port} onChange={(e) => set('port', e.target.value)} className={`${field} w-32`} /></label>}
              {f.monitor === 'snmp' && (
                <div className="space-y-3 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap gap-4">
                    {radio('ver', f.version === 'v3', () => set('version', 'v3'), 'SNMP v3 (recommended)', 'Encrypted and authenticated.')}
                    {radio('ver', f.version === 'v2c', () => set('version', 'v2c'), 'SNMP v2c', 'Community string, sent unencrypted.')}
                  </div>
                  <label className="block text-sm text-muted">UDP port<input type="number" value={f.snmpPort} onChange={(e) => set('snmpPort', e.target.value)} className={`${field} w-32`} /></label>
                  {f.version === 'v2c' ? (
                    <>
                      <label className="block text-sm text-muted">Community string<input type="password" autoComplete="off" value={f.community} onChange={(e) => set('community', e.target.value)} className={field} placeholder={secretHint} /></label>
                      <p className={note}>⚠ v2c sends the community string in plain text, so anyone on the network path can read it. Use a read-only community, restrict it to this server on the device, and prefer v3 when the device supports it.{f.community.toLowerCase() === 'public' && <b> “public” is the default everyone tries. Choose something else.</b>}</p>
                    </>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-sm text-muted">Username<input autoComplete="off" value={f.username} onChange={(e) => set('username', e.target.value)} className={field} /></label>
                      <label className="block text-sm text-muted">Security level<select value={f.level} onChange={(e) => set('level', e.target.value as SnmpLevel)} className={field}><option value="authPriv">Authenticated and encrypted (best)</option><option value="authNoPriv">Authenticated only</option><option value="noAuthNoPriv">None (not recommended)</option></select></label>
                      {f.level !== 'noAuthNoPriv' && <>
                        <label className="block text-sm text-muted">Authentication<select value={f.authProtocol} onChange={(e) => set('authProtocol', e.target.value as F['authProtocol'])} className={field}><option value="sha256">SHA-256</option><option value="sha512">SHA-512</option><option value="sha">SHA-1</option></select></label>
                        <label className="block text-sm text-muted">Authentication key (8+ characters)<input type="password" autoComplete="new-password" value={f.authKey} onChange={(e) => set('authKey', e.target.value)} className={field} placeholder={secretHint} /></label></>}
                      {f.level === 'authPriv' && <>
                        <label className="block text-sm text-muted">Encryption<select value={f.privProtocol} onChange={(e) => set('privProtocol', e.target.value as F['privProtocol'])} className={field}><option value="aes">AES-128</option><option value="aes256b">AES-256</option></select></label>
                        <label className="block text-sm text-muted">Encryption key (8+ characters)<input type="password" autoComplete="new-password" value={f.privKey} onChange={(e) => set('privKey', e.target.value)} className={field} placeholder={secretHint} /></label></>}
                    </div>)}
                  <p className="text-xs text-muted">Keys and community strings are encrypted before they are stored and are never shown again. Use a read-only SNMP account.</p>
                </div>)}
            </fieldset>)}
          {step === 3 && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                <dt className="text-muted">Name</dt><dd>{f.name}</dd><dt className="text-muted">Type</dt><dd>{TYPE_LABEL[f.type]}</dd>
                <dt className="text-muted">Address</dt><dd>{f.address}</dd><dt className="text-muted">Operating system</dt><dd>{f.os}</dd>
                <dt className="text-muted">Monitoring</dt><dd>{f.monitor === 'snmp' ? `SNMP ${f.version}, port ${f.snmpPort}` : f.monitor === 'tcp' ? `TCP port ${f.port}` : 'Ping'}</dd>
              </dl>
              <button type="button" onClick={test} disabled={!!busy} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50">{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
              {result && <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-ok' : 'text-crit'}`}>{result.ok ? '✔' : '✖'} {result.text}</p>}
            </div>)}
          {error && <p role="alert" className="mt-3 text-sm text-crit">✖ {error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" disabled={step === 0 || !!busy} onClick={() => { setError(''); setStep(step - 1); }} className="rounded-lg border border-line bg-raised px-3 py-1.5 disabled:opacity-40">Back</button>
            <button type="submit" disabled={!!busy} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent disabled:opacity-60">{step === 3 ? (busy === 'save' ? 'Saving…' : 'Save device') : 'Next'}</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
