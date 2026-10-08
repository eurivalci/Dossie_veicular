// Converte a resposta do provedor de consulta veicular no contrato do front-end.
//
// Cada provedor tem um formato próprio. Este mapeador tenta os nomes de campo
// mais comuns; ao contratar um provedor, ajuste os caminhos em CAMPOS e valide
// com uma resposta real antes de ir para produção.
//
// Regra de ouro: campo não informado vira null (o front deixa o item como
// "Não verificado"). Nunca transforme ausência de dado em "nada consta".
//
// LGPD: dados pessoais do proprietário (nome, CPF, endereço) NÃO são repassados.

const CAMPOS = {
  chassi: ['chassi', 'vin', 'veiculo.chassi'],
  renavam: ['renavam', 'veiculo.renavam'],
  marca: ['marca', 'veiculo.marca', 'fabricante'],
  modelo: ['modelo', 'veiculo.modelo', 'marca_modelo'],
  anoFabricacao: ['ano_fabricacao', 'anoFabricacao', 'veiculo.ano_fabricacao'],
  anoModelo: ['ano_modelo', 'anoModelo', 'veiculo.ano_modelo'],
  cor: ['cor', 'veiculo.cor'],
  combustivel: ['combustivel', 'veiculo.combustivel'],
  municipio: ['municipio', 'veiculo.municipio'],
  uf: ['uf', 'veiculo.uf'],
  rouboFurto: ['roubo_furto', 'rouboFurto', 'restricoes.roubo_furto', 'alerta_roubo_furto'],
  judicial: ['renajud', 'restricao_judicial', 'restricoes.judicial', 'restricoes.renajud'],
  gravame: ['gravame', 'alienacao_fiduciaria', 'restricoes.gravame'],
  administrativa: ['restricao_administrativa', 'restricoes.administrativa'],
  remarcacaoChassi: ['remarcacao_chassi', 'chassi_remarcado', 'restricoes.remarcacao_chassi'],
  leilao: ['leilao', 'historico.leilao', 'possui_leilao'],
  sinistroPerdaTotal: ['perda_total', 'indenizacao_integral', 'sinistro_perda_total', 'historico.perda_total'],
  ipva: ['debitos.ipva', 'ipva', 'valor_ipva'],
  licenciamento: ['debitos.licenciamento', 'licenciamento', 'valor_licenciamento'],
  multas: ['debitos.multas', 'multas', 'valor_multas']
};

function obter(o, caminho) {
  return caminho.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function primeiro(o, caminhos) {
  for (const c of caminhos) {
    const v = obter(o, c);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}
function texto(v, max = 120) { return v == null ? null : String(v).slice(0, max); }
function inteiro(v) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null; }

export function booleano(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  if (typeof v !== 'string') return null; // objeto ou lista: formato do provedor precisa de mapeador próprio
  const s = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(sim|s|true|1|consta|possui|ativo|ativa)$/.test(s)) return true;
  if (/^(nao|n|false|0|nada consta|nao consta|sem restricao|inexistente|nenhum|nenhuma)$/.test(s)) return false;
  return null;
}

export function dinheiro(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

export function normalizar(bruto, { placa, fonte }) {
  const r = bruto && typeof bruto === 'object' ? (bruto.data || bruto.resultado || bruto.result || bruto) : {};
  const g = k => primeiro(r, CAMPOS[k]);
  const uf = texto(g('uf'), 2);
  return {
    ok: true,
    fonte: texto(fonte, 80),
    consultadoEm: new Date().toISOString(),
    veiculo: {
      placa,
      chassi: texto(g('chassi'), 17),
      renavam: texto(g('renavam'), 11),
      marca: texto(g('marca')),
      modelo: texto(g('modelo')),
      anoFabricacao: inteiro(g('anoFabricacao')),
      anoModelo: inteiro(g('anoModelo')),
      cor: texto(g('cor'), 40),
      combustivel: texto(g('combustivel'), 40),
      municipio: texto(g('municipio'), 80),
      uf: uf ? uf.toUpperCase() : null
    },
    restricoes: {
      rouboFurto: booleano(g('rouboFurto')),
      judicial: booleano(g('judicial')),
      gravame: booleano(g('gravame')),
      administrativa: booleano(g('administrativa')),
      remarcacaoChassi: booleano(g('remarcacaoChassi'))
    },
    historico: {
      leilao: booleano(g('leilao')),
      sinistroPerdaTotal: booleano(g('sinistroPerdaTotal'))
    },
    debitos: {
      ipva: dinheiro(g('ipva')),
      licenciamento: dinheiro(g('licenciamento')),
      multas: dinheiro(g('multas'))
    }
  };
}
