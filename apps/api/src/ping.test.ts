import { describe, expect, it } from 'vitest';
import { parsePing } from './ping';

describe('parsePing', () => {
  it('reads iputils output', () => {
    const r = parsePing('3 packets transmitted, 3 received, 0% packet loss, time 2003ms\nrtt min/avg/max/mdev = 0.412/0.520/0.631/0.090 ms');
    expect(r).toEqual({ lossPct: 0, latencyMs: 0.52, jitterMs: 0.09 });
  });
  it('reads busybox output', () => {
    const r = parsePing('3 packets transmitted, 2 packets received, 33% packet loss\nround-trip min/avg/max = 1.0/2.0/4.0 ms');
    expect(r).toEqual({ lossPct: 33, latencyMs: 2, jitterMs: 3 });
  });
  it('treats no summary as total loss', () => {
    expect(parsePing('ping: bad address')).toEqual({ lossPct: 100, latencyMs: null, jitterMs: null });
  });
});
