import { describe, expect, it } from 'vitest';
import { isBlockedIp, parseTargetUrl } from './netsafe';

describe('isBlockedIp', () => {
  it('blocks loopback, metadata, unspecified and multicast', () => {
    for (const ip of ['127.0.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it('allows private and public addresses', () => {
    for (const ip of ['10.0.0.5', '192.168.1.20', '172.16.4.4', '8.8.8.8', '2606:4700::1111']) expect(isBlockedIp(ip), ip).toBe(false);
  });
});
describe('parseTargetUrl', () => {
  it('requires https where asked, and rejects embedded credentials', () => {
    expect(() => parseTargetUrl('http://x.example.com/h', true)).toThrow();
    expect(() => parseTargetUrl('https://u:p@x.example.com/h', true)).toThrow();
    expect(parseTargetUrl('http://x.example.com/h', false).host).toBe('x.example.com');
  });
});
