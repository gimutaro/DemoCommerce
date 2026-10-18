import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';

// Supabase CLI 2.121's slim Auth probe uses BusyBox wget, which ignores
// NO_PROXY in managed Docker environments. Repair only that loopback probe;
// keep the verified image, all service settings and outbound proxy intact.
const authName = 'supabase_auth_democommerce';
const healthUrl = 'http://127.0.0.1:9999/health';
process.env.SUPABASE_HOME ??= `${process.cwd()}/.cache/supabase`;
process.env.SUPABASE_TELEMETRY_DISABLED ??= 'true';
process.env.SUPABASE_USE_SLIM_IMAGES ??= 'true';
process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY ??= 'docker.io';

function dockerApi(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ socketPath: process.platform === 'win32' ? '\\\\.\\pipe\\docker_engine' : '/var/run/docker.sock', method, path,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        // Never include Docker response bodies: inspection contains credentials.
        if (!response.statusCode || response.statusCode >= 400) { reject(new Error(`Local Docker operation failed (${response.statusCode}).`)); return; }
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve(text ? JSON.parse(text) as unknown : null); } catch { reject(new Error('Invalid local Docker response.')); }
      });
    });
    req.on('error', () => reject(new Error('The managed local Docker socket is unavailable.')));
    req.end(payload);
  });
}

interface ContainerInfo {
  Config: Record<string, unknown> & { Image: string; Healthcheck?: { Test?: string[]; [key: string]: unknown } };
  HostConfig: Record<string, unknown>;
  Mounts: unknown[];
  State: { Health?: { Status: string } };
  NetworkSettings: { Networks: Record<string, { Aliases?: string[] }> };
}

async function repairLocalAuthProbe() {
  const original = await dockerApi('GET', `/containers/${authName}/json`) as ContainerInfo;
  const test = original.Config.Healthcheck?.Test;
  const knownProbe = test?.join(' ') === `CMD-SHELL wget -q --spider ${healthUrl}`
    || test?.join(' ') === `CMD wget -q --spider ${healthUrl}`;
  if (!original.Config.Image.startsWith('ghcr.io/supabase/cli/auth') || !knownProbe) return;
  if (original.Mounts.length) throw new Error('Unexpected Auth container mounts; refusing automatic probe repair.');
  const networks = Object.fromEntries(Object.entries(original.NetworkSettings.Networks).map(([name, network]) => [name, { Aliases: network.Aliases }]));
  const base = { ...original.Config, HostConfig: original.HostConfig, NetworkingConfig: { EndpointsConfig: networks } };
  const fixed = { ...base, Healthcheck: { ...original.Config.Healthcheck, Test: ['CMD', 'wget', '-Y', 'off', '-q', '--spider', healthUrl] } };
  await dockerApi('POST', `/containers/${authName}/stop?t=5`);
  await dockerApi('DELETE', `/containers/${authName}`);
  try {
    await dockerApi('POST', `/containers/create?name=${authName}`, fixed);
    await dockerApi('POST', `/containers/${authName}/start`);
  } catch {
    // Restore the stateless service from its original in-memory configuration.
    await dockerApi('DELETE', `/containers/${authName}?force=true`).catch(() => undefined);
    await dockerApi('POST', `/containers/create?name=${authName}`, base);
    await dockerApi('POST', `/containers/${authName}/start`);
    throw new Error('Auth probe repair failed; original service configuration was restored.');
  }
  console.log('Repaired the local Auth loopback health probe; outbound proxy and image digest preserved.');
}

async function main() {
  console.log('Starting local Supabase (verified slim images). Initial image downloads can take several minutes.');
  const proxy = Boolean(process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy);
  const args = ['start', '--exclude', 'studio,realtime,storage-api,imgproxy,postgres-meta,edge-runtime,logflare,vector,supavisor,mailpit'];
  // The native proxy-sensitive probe is replaced and strictly rechecked below.
  if (proxy) args.push('--ignore-health-check');
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url)), ...args], { stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('error', () => reject(new Error('Supabase CLI could not start. Run npm ci first.')));
    child.on('exit', resolve);
  });
  if (exitCode !== 0) throw new Error('Local Supabase startup failed. Inspect Docker connectivity and the configured image registry.');
  if (proxy) await repairLocalAuthProbe();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const auth = await dockerApi('GET', `/containers/${authName}/json`) as ContainerInfo;
      const db = await dockerApi('GET', '/containers/supabase_db_democommerce/json') as ContainerInfo;
      const gateway = await dockerApi('GET', '/containers/supabase_kong_democommerce/json') as ContainerInfo;
      const response = await fetch('http://127.0.0.1:54321/auth/v1/health', { signal: AbortSignal.timeout(3000) });
      if (response.ok && (await response.json() as { name?: string }).name === 'GoTrue'
        && [auth, db, gateway].every((container) => container.State.Health?.Status === 'healthy')) {
        console.log('Local Supabase ready: Postgres, Auth and gateway healthy; Auth HTTP request succeeded. No credentials printed.');
        return;
      }
    } catch { /* Services may still be coming up. Never print SDK or Docker data. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Local Supabase did not pass strict service and Auth HTTP readiness checks.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Local Supabase startup failed.');
  process.exitCode = 1;
});
