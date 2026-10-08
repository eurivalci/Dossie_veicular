// Proxy da Tabela FIPE (API pública Parallelum, v1).
// Valida o caminho por lista fechada (sem SSRF), normaliza a resposta e usa cache de CDN.
import { cors, cabecalhosSeguranca, responder, buscarJson, limitar, ipCliente, query } from './_lib/http.js';

const TIPOS = new Set(['carros', 'motos', 'caminhoes']);
const CAMINHO = /^marcas(\/\d{1,6}(\/modelos(\/\d{1,7}(\/anos(\/\d{4,5}-\d)?)?)?)?)?$/;
const BASE = (process.env.FIPE_BASE_URL || 'https://parallelum.com.br/fipe/api/v1').replace(/\/+$/, '');

function item(i) {
  if (!i || typeof i !== 'object') return null;
  const codigo = String(i.codigo ?? '').slice(0, 20);
  const nome = String(i.nome ?? '').slice(0, 120);
  return codigo && nome ? { codigo, nome } : null;
}

export default async function handler(req, res) {
  cabecalhosSeguranca(res);
  if (cors(req, res)) return;
  if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não permitido.' });

  const rl = limitar('fipe:' + ipCliente(req), 120, 60_000);
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.retryAfter)); return responder(res, 429, { erro: 'Muitas consultas seguidas. Aguarde um minuto.' }); }

  const q = query(req);
  const tipo = String(q.tipo || '');
  const caminho = String(q.path || '');
  if (!TIPOS.has(tipo) || !CAMINHO.test(caminho)) return responder(res, 400, { erro: 'Parâmetros inválidos.' });

  const headers = { Accept: 'application/json' };
  if (process.env.FIPE_TOKEN) headers['X-Subscription-Token'] = process.env.FIPE_TOKEN;

  try {
    const r = await buscarJson(`${BASE}/${tipo}/${caminho}`, { headers }, 10000);
    if (r.status === 429) return responder(res, 429, { erro: 'Limite de consultas da FIPE atingido. Tente mais tarde.' });
    if (!r.ok || !r.json) return responder(res, 502, { erro: 'A FIPE não respondeu como esperado.' });
    const j = r.json;
    let corpo;
    if (Array.isArray(j)) corpo = { itens: j.map(item).filter(Boolean) };
    else if (Array.isArray(j.modelos)) corpo = { itens: j.modelos.map(item).filter(Boolean) };
    else if (j.Valor) corpo = {
      valor: String(j.Valor),
      codigoFipe: String(j.CodigoFipe || ''),
      mesReferencia: String(j.MesReferencia || '').trim(),
      marca: String(j.Marca || ''),
      modelo: String(j.Modelo || ''),
      anoModelo: Number.isFinite(+j.AnoModelo) ? +j.AnoModelo : null,
      combustivel: String(j.Combustivel || '')
    };
    else return responder(res, 502, { erro: 'Formato inesperado da FIPE.' });
    return responder(res, 200, corpo, 'public, s-maxage=86400, stale-while-revalidate=604800');
  } catch {
    return responder(res, 504, { erro: 'A FIPE demorou demais para responder.' });
  }
}
