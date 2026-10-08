// Verificação de saúde usada pelo botão "Testar conexão". Não expõe segredos.
import { cors, cabecalhosSeguranca, responder } from './_lib/http.js';

export default function handler(req, res) {
  cabecalhosSeguranca(res);
  if (cors(req, res)) return;
  const url = process.env.VEICULO_PROVIDER_URL || '';
  return responder(res, 200, { ok: true, veiculo: url === 'mock' || url.includes('{placa}'), fipe: true });
}
