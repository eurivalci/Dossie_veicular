// Proxy da consulta veicular por placa (provedor pago à sua escolha).
// A chave do provedor fica só em variável de ambiente; o navegador nunca a vê.
import { cors, cabecalhosSeguranca, responder, buscarJson, limitar, ipCliente, mascarar, origemPermitida, query } from './_lib/http.js';
import { normalizar } from './_lib/normalizar.js';

const PLACA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

function simulado(placa) {
  const ruim = placa.endsWith('99');
  return { data: {
    chassi: '9BWAB45U0KT004251', renavam: '00639884962', marca: 'VW', modelo: 'GOL 1.0 (simulado)',
    ano_fabricacao: 2019, ano_modelo: 2020, cor: 'PRATA', combustivel: 'FLEX', uf: 'CE',
    roubo_furto: 'nada consta', renajud: 'nao', gravame: ruim ? 'sim' : 'nao', restricao_administrativa: 'nao',
    remarcacao_chassi: 'nao', leilao: ruim ? 'sim' : 'nao', /* perda_total ausente de propósito: vira null */
    debitos: { ipva: ruim ? '1.830,50' : 0, licenciamento: 0, multas: ruim ? 293.47 : 0 }
  } };
}

export default async function handler(req, res) {
  cabecalhosSeguranca(res);
  if (cors(req, res)) return;
  if (req.method !== 'GET') return responder(res, 405, { erro: 'Método não permitido.' });
  if (!origemPermitida(req)) return responder(res, 403, { erro: 'Origem não autorizada.' });

  const placa = String(query(req).placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PLACA.test(placa)) return responder(res, 400, { erro: 'Placa inválida.' });

  const url = process.env.VEICULO_PROVIDER_URL;
  // Modo de simulação: exercita normalizador e front sem custo. Placas terminadas em 99 trazem restrições.
  if (url === 'mock') return responder(res, 200, normalizar(simulado(placa), { placa, fonte: 'Simulação (VEICULO_PROVIDER_URL=mock)' }), 'private, no-store');
  if (!url || !url.includes('{placa}')) return responder(res, 501, { erro: 'Consulta de placa não configurada neste servidor.' });

  const limite = Math.max(1, Number(process.env.VEICULO_RATE_LIMIT) || 20);
  const rl = limitar('veic:' + ipCliente(req), limite, 3_600_000);
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.retryAfter)); return responder(res, 429, { erro: 'Limite de consultas por hora atingido.' }); }

  const headers = { Accept: 'application/json' };
  const token = process.env.VEICULO_PROVIDER_TOKEN;
  if (token) {
    const nome = process.env.VEICULO_PROVIDER_AUTH_HEADER || 'Authorization';
    headers[nome] = nome.toLowerCase() === 'authorization' ? `Bearer ${token}` : token;
  }

  const t0 = Date.now();
  try {
    const r = await buscarJson(url.replace('{placa}', encodeURIComponent(placa)), { headers }, 12000);
    console.log(JSON.stringify({ ev: 'consulta_veiculo', placa: mascarar(placa), status: r.status, ms: Date.now() - t0 }));
    if (r.status === 404) return responder(res, 404, { erro: 'Placa não encontrada no provedor.' });
    if (r.status === 401 || r.status === 403) return responder(res, 502, { erro: 'Credencial do provedor recusada. Verifique as variáveis de ambiente.' });
    if (!r.ok || !r.json) return responder(res, 502, { erro: 'O provedor de consulta não respondeu como esperado.' });
    return responder(res, 200, normalizar(r.json, { placa, fonte: process.env.VEICULO_PROVIDER_NOME || 'provedor configurado' }), 'private, no-store');
  } catch (e) {
    console.log(JSON.stringify({ ev: 'consulta_veiculo_erro', placa: mascarar(placa), ms: Date.now() - t0, erro: e && e.name }));
    return responder(res, 504, { erro: 'O provedor demorou demais para responder.' });
  }
}
