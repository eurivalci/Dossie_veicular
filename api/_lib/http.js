// Utilitários compartilhados pelas funções serverless (Vercel, Node 20+).
// Sem dependências externas: menos superfície de ataque e cold start menor.

const buckets = new Map();

function origensPermitidas() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Origem ausente (mesma origem) ou na lista ALLOWED_ORIGINS. */
export function origemPermitida(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { if (new URL(origin).host === req.headers.host) return true; } catch { return false; }
  return origensPermitidas().includes(origin);
}

/** Aplica CORS restrito à lista de origens. Retorna true se respondeu ao preflight. */
export function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && origensPermitidas().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}

export function cabecalhosSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export function ipCliente(req) {
  const xf = req.headers['x-forwarded-for'];
  const v = Array.isArray(xf) ? xf[0] : (xf || '');
  return v.split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'anon';
}

/**
 * Limite por janela fixa, em memória da instância.
 * Best-effort: cada instância serverless tem o próprio contador.
 * Em produção com custo por consulta, troque por Upstash Redis ou Vercel KV.
 */
export function limitar(chave, limite, janelaMs) {
  const agora = Date.now();
  const b = buckets.get(chave);
  if (!b || agora - b.inicio > janelaMs) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(chave, { inicio: agora, n: 1 });
    return { ok: true };
  }
  b.n++;
  return { ok: b.n <= limite, retryAfter: Math.max(1, Math.ceil((b.inicio + janelaMs - agora) / 1000)) };
}

export async function buscarJson(url, opcoes = {}, timeoutMs = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctl.signal });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { json = null; }
    return { status: r.status, ok: r.ok, json };
  } finally {
    clearTimeout(t);
  }
}

export function responder(res, status, corpo, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(corpo));
}

/** Placa mascarada para logs (LGPD: placa vincula-se a pessoa identificável). */
export function mascarar(placa) {
  return String(placa || '').slice(0, 3) + '****';
}

/** Lê query string sem depender dos helpers do runtime. */
export function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req.url, 'http://x').searchParams); } catch { return {}; }
}
