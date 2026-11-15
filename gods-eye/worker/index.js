import { createFreebuffAuth } from '@freebuff/auth';

// One auth instance per isolate. The client ID and canonical origin are public
// configuration injected by the platform; no secret exists in this project.
let auth = null;

function getAuth(env) {
  if (auth) return auth;
  if (!env.FREEBUFF_CLIENT_ID || !env.APP_ORIGIN) return null;
  try {
    // http is only tolerated for a loopback development origin; deployed
    // environments must be https and never use this flag.
    const loopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN);
    auth = createFreebuffAuth({
      clientId: env.FREEBUFF_CLIENT_ID,
      issuer: env.FREEBUFF_ISSUER || undefined,
      baseUrl: env.APP_ORIGIN,
      allowInsecureLocalhost: loopback,
    });
    return auth;
  } catch (err) {
    console.error('[gods-eye] auth unavailable:', err && err.message ? err.message : 'configuration error');
    return null;
  }
}

async function serveStatic(request, env) {
  if (!env.ASSETS) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  let res = await env.ASSETS.fetch(request);
  const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
  if (res.status === 404 && request.method === 'GET' && wantsHtml) {
    res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  }
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const instance = getAuth(env);
    if (!instance) return serveStatic(request, env);

    return instance.wrap(async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      return serveStatic(req, env);
    })(request, env, ctx);
  },
};
