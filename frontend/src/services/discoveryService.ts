const DISCOVERY_PORT = 3001;
const TIMEOUT_MS = 800;
const BATCH_SIZE = 20;

export interface DiscoveredServer {
  url: string;
  ip: string;
  port: number;
  app: string;
  version: string;
}

async function probeIp(ip: string): Promise<DiscoveredServer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `http://${ip}:${DISCOVERY_PORT}`;

  try {
    const res = await fetch(`${url}/api/discovery`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.app !== 'GestionStore') return null;
    return { url, ip, port: data.port ?? DISCOVERY_PORT, app: data.app, version: data.version };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function generateSubnetIps(subnet: string): string[] {
  const parts = subnet.split('.');
  const base = parts.slice(0, 3).join('.');
  return Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
}

const COMMON_SUBNETS = ['192.168.1', '192.168.0', '10.0.0', '10.0.1', '172.16.0'];

export async function discoverServers(
  onProgress?: (scanned: number, total: number) => void
): Promise<DiscoveredServer[]> {
  const servers: DiscoveredServer[] = [];
  let subnetsToScan: string[] = [];

  // Try to get subnet hints from the current page's host or a known server
  const existingUrl = localStorage.getItem('sync_server_url');
  if (existingUrl) {
    try {
      const res = await fetch(`${existingUrl}/api/discovery`);
      if (res.ok) {
        const data = await res.json();
        if (data.addresses) {
          subnetsToScan = data.addresses.map((a: { subnet: string }) => a.subnet);
        }
      }
    } catch { /* ignore */ }
  }

  // If we couldn't determine subnets, try the page's hostname first then common subnets
  if (subnetsToScan.length === 0) {
    const pageHost = window.location.hostname;
    if (pageHost && pageHost !== 'localhost' && !pageHost.startsWith('127.')) {
      const hostBase = pageHost.split('.').slice(0, 3).join('.');
      subnetsToScan = [hostBase + '.0'];
    } else {
      subnetsToScan = COMMON_SUBNETS.map((s) => s + '.0');
    }
  }

  const uniqueSubnets = [...new Set(subnetsToScan)];
  const allIps: string[] = [];
  for (const subnet of uniqueSubnets) {
    allIps.push(...generateSubnetIps(subnet));
  }

  const total = allIps.length;
  let scanned = 0;

  for (let i = 0; i < allIps.length; i += BATCH_SIZE) {
    const batch = allIps.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(probeIp));

    for (const result of results) {
      if (result) {
        const alreadyFound = servers.some((s) => s.ip === result.ip);
        if (!alreadyFound) servers.push(result);
      }
    }

    scanned += batch.length;
    onProgress?.(scanned, total);
  }

  return servers;
}
