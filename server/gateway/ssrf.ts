import dns from 'dns';
import { BadRequestError } from '../errors/AppError';
import { config } from '../config';

// Range checks for IPv4 private, loopback, and link-local networks
function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (Current network / default route)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private RFC 1918: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-Local & Cloud Metadata RFC 3927)
  if (a === 169 && b === 254) return true;

  return false;
}

function isPrivateOrLoopbackIPv6(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Loopback and unspecified (::1, ::, 0:0:0:0:0:0:0:1)
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1' || clean === '0:0:0:0:0:0:0:0') return true;
  // Unique Local Address fc00::/7 (fc00:: - fdff::)
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
  // Link-Local fe80::/10 (fe80:: - febf::)
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true;

  return false;
}

/**
 * Validates that an upstream target URL does not point to internal/private network infrastructure,
 * loopback, or metadata services.
 * Strictly scopes the internal demo echo exception to APIShield's specific port and path.
 */
export function validateTargetUrlSync(targetUrl: string): { isValid: boolean; reason?: string } {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { isValid: false, reason: 'Target URL is missing or not a string.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isValid: false, reason: 'Invalid target URL format.' };
  }

  // Protocol must be HTTP or HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, reason: 'Target URL must use HTTP or HTTPS protocol.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const serverPort = String(config.port);

  // Exact narrow allowlist for APIShield-controlled local echo target on the server's designated port
  const isLocalEcho =
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    effectivePort === serverPort &&
    (parsed.pathname === '/api/echo' || parsed.pathname.startsWith('/api/echo/'));

  if (isLocalEcho) {
    return { isValid: true };
  }

  // Hostname loopback checks (rejects any localhost / 127.0.0.1 on non-echo or wrong port)
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1'
  ) {
    return { isValid: false, reason: 'Target URL cannot target loopback or localhost.' };
  }

  // Cloud metadata endpoint protection (AWS, GCP, Azure, DigitalOcean)
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  ) {
    return { isValid: false, reason: 'Target URL cannot target cloud metadata services.' };
  }

  // IPv4 private/loopback literal check
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateOrLoopbackIPv4(hostname)) {
      return {
        isValid: false,
        reason: 'Target URL cannot point to private or internal network addresses (RFC 1918 / RFC 3927).',
      };
    }
  }

  // IPv6 private/loopback literal check
  if (hostname.includes(':')) {
    if (isPrivateOrLoopbackIPv6(hostname)) {
      return { isValid: false, reason: 'Target URL cannot point to internal or loopback IPv6 addresses.' };
    }
  }

  return { isValid: true };
}

/**
 * Performs asynchronous DNS resolution to verify that a target hostname does not resolve
 * to an internal, loopback, or private network IP address.
 * FAILS CLOSED: Any DNS resolution failure strictly rejects the target URL.
 */
export async function validateTargetUrl(targetUrl: string): Promise<{ isValid: boolean; reason?: string }> {
  const syncCheck = validateTargetUrlSync(targetUrl);
  if (!syncCheck.isValid) {
    return syncCheck;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isValid: false, reason: 'Invalid target URL format.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const serverPort = String(config.port);

  // Skip DNS lookup only for the exactly whitelisted local echo service on the server's configured port
  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    effectivePort === serverPort &&
    (parsed.pathname === '/api/echo' || parsed.pathname.startsWith('/api/echo/'))
  ) {
    return { isValid: true };
  }

  try {
    const lookupResult = await dns.promises.lookup(hostname, { all: true });
    if (!lookupResult || lookupResult.length === 0) {
      return { isValid: false, reason: `No IP records resolved for target host '${hostname}'.` };
    }

    for (const record of lookupResult) {
      if (record.family === 4 && isPrivateOrLoopbackIPv4(record.address)) {
        return {
          isValid: false,
          reason: `Target destination hostname resolved to forbidden private/loopback IP address (${record.address}).`,
        };
      }
      if (record.family === 6 && isPrivateOrLoopbackIPv6(record.address)) {
        return {
          isValid: false,
          reason: `Target destination hostname resolved to forbidden IPv6 address (${record.address}).`,
        };
      }
    }
  } catch (err: any) {
    // Fail closed: Any DNS resolution error (ENOTFOUND, ETIMEOUT, EAI_AGAIN, etc.) strictly rejects the target
    return {
      isValid: false,
      reason: `DNS resolution failed for target host '${hostname}': ${err.code || err.message || 'Resolution error'}`,
    };
  }

  return { isValid: true };
}

/**
 * Asserts that a target URL is safe, throwing a structured BadRequestError if SSRF checks fail.
 */
export async function assertSafeTargetUrl(targetUrl: string): Promise<void> {
  const check = await validateTargetUrl(targetUrl);
  if (!check.isValid) {
    throw new BadRequestError(`Target URL rejected for security: ${check.reason}`);
  }
}
