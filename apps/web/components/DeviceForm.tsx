'use client';
import { DEVICE_TYPES, OS_CHOICES, type DeviceDetail, type DeviceType, type SnmpLevel } from '@pulse/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, download } from '@/lib/api';

const STEPS = ['Device', 'Address', 'Monitoring', 'Review'];
const TYPE_LABEL: Record<DeviceType, string> = { computer: 'Computer', server: 'Server', router: 'Router', switch: 'Switch', firewall: 'Firewall', 'access-point': 'Access point', nas: 'NAS', other: 'Other' };
const field = 'mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-ink';
const note = 'rounded-lg bg-raised p-3 text-sm text-muted';

interface F {
  name: string; type: DeviceType; address: string; os: string; monitor: 'ping' | 'tcp' | 'snmp' | 'ssh'; port: string;
  sshPort: string; sshUser: string; keyId: string; authLine: string; hostKey: string; found: string; trusted: string; verified: boolean;
  version: 'v2c' | 'v3'; snmpPort: string; community: string; username: string; level: SnmpLevel;
  authProtocol: 'sha' | 'sha256' | 'sha512'; authKey: string; privProtocol: 'aes' | 'aes256b'; privKey: string;
}
const blank: F = { name: '', type: 'server', address: '', os: 'Linux', monitor: 'ping', port: '443', version: 'v3', snmpPort: '161', community: '', username: '', level: 'authPriv', authProtocol: 'sha256', authKey: '', privProtocol: 'aes', privKey: '', sshPort: '22', sshUser: '', keyId: '', authLine: '', hostKey: '', found: '', trusted: '', verified: false };

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
        authProtocol: (m.authProtocol as F['authProtocol']) ?? 'sha256', privProtocol: (m.privProtocol as F['privProtocol']) ?? 'aes',
        sshPort: String(d.monitor === 'ssh' ? m.port ?? 22 : 22), sshUser: m.sshUsername ?? '', hostKey: m.hostKey ?? '', trusted: m.hostKey ?? '' });
    }).catch((e: Error) => setError(e.message));
  }, [id]);

  // Blank secrets are left out, which tells the server to keep the saved ones.
  const body = () => ({
    name: f.name, type: f.type, address: f.address, os: f.os, monitor: f.monitor,
    ...(f.monitor === 'tcp' ? { port: Number(f.port) } : {}),
    ...(f.monitor === 'ssh' ? { ssh: { port: Number(f.sshPort), username: f.sshUser, ...(f.keyId ? { keyId: f.keyId } : {}), ...(f.hostKey ? { hostKey: f.hostKey } : {}) } } : {}),
    ...(f.monitor === 'snmp' ? { snmp: { version: f.version, port: Number(f.snmpPort),
      ...(f.version === 'v2c' ? { ...(f.community ? { community: f.community } : {}) } : {
        username: f.username, securityLevel: f.level,
        ...(f.level !== 'noAuthNoPriv' ? { authProtocol: f.authProtocol, ...(f.authKey ? { authKey: f.authKey } : {}) } : {}),
        ...(f.level === 'authPriv' ? { privProtocol: f.privProtocol, ...(f.privKey ? { privKey: f.privKey } : {}) } : {}) }) } } : {}),
  });

  const check = (): string => {
    if (step === 0 && !f.name.trim()) return 'Enter a name for the device.';
    if (step === 2 && f.monitor === 'ssh' && !f.sshUser.trim()) return 'Enter the username on the device.';
    if (step === 2 && f.monitor === 'ssh' && !f.keyId && !id) return 'Generate a key first, and add it to the device (step 2 of the setup box).';
    if (step === 1 && !/^[A-Za-z0-9._:-]+$/.test(f.address.trim())) return 'Enter an IP address or hostname, for example 10.0.0.1 or router.lan.';
    return '';
  };
  const next = () => { const e = check(); setError(e); if (!e) setStep(step + 1); };

  async function test() {
    setBusy('test'); setResult(null);
    try {
      // Testing never sends a pinned host key: it asks the device what key it has, so you can compare and confirm it
      const b = body(); if (b.ssh) delete (b.ssh as { hostKey?: string }).hostKey;
      const r = await api<{ message: string; hostKey?: string }>('/api/v1/devices/test', { method: 'POST', body: JSON.stringify({ ...b, ...(id ? { deviceId: id } : {}) }) });
      setResult({ ok: true, text: r.message });
      if (r.hostKey) setF((x) => ({ ...x, found: r.hostKey as string, verified: r.hostKey === x.trusted, hostKey: r.hostKey === x.trusted ? x.trusted : '' }));
    }
    catch (e) { setResult({ ok: false, text: (e as Error).message }); } finally { setBusy(''); }
  }
  const isWin = /^windows/i.test(f.os);
  async function genKey() {
    setBusy('key'); setError('');
    try {
      const r = await api<{ keyId: string; authorizedLine: string }>('/api/v1/ssh/keypair', { method: 'POST', body: JSON.stringify({ os: isWin ? 'windows' : 'linux', name: f.name || 'device' }) });
      setF((x) => ({ ...x, keyId: r.keyId, authLine: r.authorizedLine }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function showLine() {
    try { const r = await api<{ authorizedLine: string }>(`/api/v1/devices/${id}/ssh-setup`); setF((x) => ({ ...x, authLine: r.authorizedLine })); } catch (e) { setError((e as Error).message); }
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
              {radio('mon', f.monitor === 'ssh', () => set('monitor', 'ssh'), 'SSH (computers)', 'Windows and Linux computers: hardware details (RAM modules and speed, BIOS, serials), services and per-process CPU. Uses a read-only script and a key, never a password.')}
              {radio('mon', f.monitor === 'snmp', () => set('monitor', 'snmp'), 'SNMP', 'Real CPU, memory, disks, network ports, processes and hardware details, where the device reports them. Routers, switches, NAS and Linux hosts.')}
                            {f.monitor === 'ssh' && (
                <div className="space-y-3 rounded-lg border border-line p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm text-muted">Username on the device<input autoComplete="off" value={f.sshUser} onChange={(e) => set('sshUser', e.target.value)} className={field} placeholder={isWin ? 'a standard (non-administrator) user' : 'a normal user'} /></label>
                    <label className="block text-sm text-muted">SSH port<input type="number" value={f.sshPort} onChange={(e) => set('sshPort', e.target.value)} className={field} /></label>
                  </div>
                  <ol className="list-decimal space-y-2 pl-5 text-sm">
                    <li>Download the read-only collector script: <button type="button" className="rounded border border-line bg-raised px-2 py-1 hover:border-accent" onClick={() => download(`/api/v1/ssh/collector?os=${isWin ? 'windows' : 'linux'}`, isWin ? 'collect.ps1' : 'pulseboard-collect').catch((e: Error) => setError(e.message))}>Download {isWin ? 'collect.ps1' : 'pulseboard-collect'}</button></li>
                    <li>Create this device&apos;s own key: <button type="button" disabled={busy === 'key'} className="rounded border border-line bg-raised px-2 py-1 hover:border-accent disabled:opacity-50" onClick={genKey}>{f.keyId ? 'Generate a new key' : 'Generate key'}</button>
                      {id && !f.authLine && <> or <button type="button" className="rounded border border-line bg-raised px-2 py-1 hover:border-accent" onClick={showLine}>show the current setup line</button></>}</li>
                  </ol>
                  {f.authLine && (
                    <div className="space-y-2">
                      <label className="block text-sm text-muted">3. Add this line to the user&apos;s authorized_keys on the device
                        <textarea readOnly rows={4} value={f.authLine} onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono text-xs`} /></label>
                      <button type="button" className="rounded border border-line bg-raised px-2 py-1 text-sm hover:border-accent" onClick={() => navigator.clipboard?.writeText(f.authLine)}>Copy line</button>
                      <details className="rounded-lg bg-raised p-3 text-sm text-muted"><summary className="cursor-pointer text-ink">Setup steps for {isWin ? 'Windows' : 'Linux'}</summary>
                        {isWin ? (
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            <li>In PowerShell as administrator: <code>Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0</code>, then <code>Start-Service sshd; Set-Service sshd -StartupType Automatic</code>.</li>
                            <li>Copy the script to <code>C:\ProgramData\Pulseboard\collect.ps1</code>. The comments at the top of the script show how to let the user read it but not change it.</li>
                            <li>Put the line above in <code>C:\Users\&lt;user&gt;\.ssh\authorized_keys</code>. If that user is an administrator, use <code>C:\ProgramData\ssh\administrators_authorized_keys</code> instead (a standard user is safer).</li>
                            <li>Allow TCP port 22 from the Pulseboard computer in Windows Firewall. Pulseboard in Docker reaches this PC as <b>host.docker.internal</b>.</li>
                          </ol>
                        ) : (
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            <li>Install the script: <code>sudo install -m 0755 pulseboard-collect /usr/local/bin/pulseboard-collect</code></li>
                            <li>Add the line above to <code>~/.ssh/authorized_keys</code> of that user (mode 600).</li>
                            <li>Optional, for RAM modules and speed: allow one command without a password in <code>/etc/sudoers.d/pulseboard</code>: <code>&lt;user&gt; ALL=(root) NOPASSWD: /usr/sbin/dmidecode -t memory</code></li>
                          </ol>)}
                        <p className="mt-2">The line limits this key to the one script: it cannot open a shell, forward ports, or run anything else.</p>
                      </details>
                    </div>)}
                </div>)}
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
                <dt className="text-muted">Monitoring</dt><dd>{f.monitor === 'ssh' ? `SSH as ${f.sshUser}, port ${f.sshPort}` : f.monitor === 'snmp' ? `SNMP ${f.version}, port ${f.snmpPort}` : f.monitor === 'tcp' ? `TCP port ${f.port}` : 'Ping'}</dd>
              </dl>
              <button type="button" onClick={test} disabled={!!busy} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50">{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
              {result && <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-ok' : 'text-crit'}`}>{result.ok ? '✔' : '✖'} {result.text}</p>}
              {f.monitor === 'ssh' && f.found && (
                <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
                  <p>Host key fingerprint the device presented:</p><code className="block break-all rounded bg-raised p-2">{f.found}</code>
                  {f.trusted && f.trusted !== f.found && <p role="alert" className="text-crit">✖ This is DIFFERENT from the host key you trusted before. That can mean the machine was reinstalled, or that something is impersonating it. Only continue if you can explain the change.</p>}
                  <p className="text-muted">Compare it with the device itself, so you know you are talking to the right machine:<br /><code>{isWin ? String.raw`Get-ChildItem C:\ProgramData\ssh\ssh_host_*_key.pub | ForEach-Object { ssh-keygen -lf $_.FullName }` : 'ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub'}</code></p>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={f.verified} onChange={(e) => setF((x) => ({ ...x, verified: e.target.checked, hostKey: e.target.checked ? x.found : '' }))} /> I checked: the fingerprint matches the device</label>
                </div>)}
            </div>)}
          {error && <p role="alert" className="mt-3 text-sm text-crit">✖ {error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" disabled={step === 0 || !!busy} onClick={() => { setError(''); setStep(step - 1); }} className="rounded-lg border border-line bg-raised px-3 py-1.5 disabled:opacity-40">Back</button>
            <button type="submit" disabled={!!busy || (step === 3 && f.monitor === 'ssh' && !f.hostKey)} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent disabled:opacity-60">{step === 3 ? (busy === 'save' ? 'Saving…' : 'Save device') : 'Next'}</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
