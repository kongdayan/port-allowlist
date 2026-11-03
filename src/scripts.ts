import { env } from 'cloudflare:workers';

export async function download(request: Request): Promise<Response> {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const u = new URL(request.url), windows = u.pathname === '/downloads/windows';
  if (!windows && u.pathname !== '/downloads/macos') return new Response('Not found', { status: 404 });
  const name = windows ? 'update-ip.ps1' : 'update-ip.sh';
  const source = await env.ASSETS.fetch(new Request(new URL(`/scripts/${name}`, u)));
  if (!source.ok) return new Response('Script unavailable', { status: 503 });
  const origin = u.origin;
  if (!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(origin)) return new Response('Invalid origin', { status: 400 });
  return new Response((windows ? '\uFEFF' : '') + (await source.text()).replaceAll('__SERVICE_ORIGIN__', origin), { headers: {
    'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
