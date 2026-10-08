// Emula a Vercel para testes: arquivos estáticos + funções /api/* + cabeçalhos do vercel.json.
import http from 'http'; import fs from 'fs'; import path from 'path';
const RAIZ = new URL('../', import.meta.url).pathname;
const API = new URL('../api/', import.meta.url).href;
process.env.VEICULO_PROVIDER_URL ||= 'mock';
process.env.FIPE_BASE_URL ||= 'http://127.0.0.1:8788/fipe';
const H = { veiculo: (await import(API + 'veiculo.js')).default, fipe: (await import(API + 'fipe.js')).default, saude: (await import(API + 'saude.js')).default };
const CFG = JSON.parse(fs.readFileSync(RAIZ + 'vercel.json', 'utf8'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
function cabecalhos(res, p) {
  for (const regra of CFG.headers) {
    const re = new RegExp('^' + regra.source.replace('(.*)', '.*') + '$');
    if (re.test(p)) for (const h of regra.headers) res.setHeader(h.key, h.value);
  }
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/fipe/')) {                        // upstream FIPE falso (formato v1)
    res.setHeader('Content-Type', 'application/json'); const p = u.pathname;
    if (p.endsWith('/marcas')) return res.end(JSON.stringify([{ codigo: '59', nome: 'VW - VolksWagen' }]));
    if (p.endsWith('/modelos')) return res.end(JSON.stringify({ modelos: [{ codigo: 5940, nome: 'Gol 1.0' }], anos: [] }));
    if (p.endsWith('/anos')) return res.end(JSON.stringify([{ codigo: '2020-1', nome: '2020 Gasolina' }]));
    return res.end(JSON.stringify({ Valor: 'R$ 52.340,00', Marca: 'VW', Modelo: 'Gol 1.0', AnoModelo: 2020, Combustivel: 'Gasolina', CodigoFipe: '005340-6', MesReferencia: 'outubro de 2026 ' }));
  }
  cabecalhos(res, u.pathname);
  const m = u.pathname.match(/^\/api\/(\w+)$/);
  if (m && H[m[1]]) { req.query = Object.fromEntries(u.searchParams); return H[m[1]](req, res); }
  let arq = path.normalize(path.join(RAIZ, u.pathname === '/' ? 'index.html' : u.pathname));
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = RAIZ + 'index.html';
  res.setHeader('Content-Type', TIPOS[path.extname(arq)] || 'application/octet-stream');
  res.end(fs.readFileSync(arq));
}).listen(8788, () => console.log('http://localhost:8788'));
