# Dossiê Veicular — análise pré-compra

Sistema da EDP Sistemas para quem vai comprar um veículo usado e não domina o mercado.
Organiza todas as verificações (documental, jurídica, estrutural, mecânica, preço e golpes),
calcula a oferta máxima e gera um laudo com a decisão.

## Arquitetura

```
index.html              App em arquivo único (HTML + CSS + JS inline). Funciona offline.
api/veiculo.js          Proxy da consulta por placa (provedor pago à sua escolha, ou "mock").
api/fipe.js             Proxy da Tabela FIPE (Parallelum v1), caminhos em lista fechada, cache de CDN.
api/saude.js            Diz ao app o que o servidor oferece (consulta por placa, FIPE).
api/_lib/http.js        CORS por lista, rate limit, timeout, respostas JSON, máscara de placa.
api/_lib/normalizar.js  Converte a resposta do provedor no contrato do front.
manifest.webmanifest    App instalável (PWA): nome, ícones, tela cheia.
sw.js                   Service worker: abre offline; nunca guarda respostas de /api/*.
icons/                  Ícones 192, 512, maskable e apple-touch-icon.
vercel.json             Cabeçalhos de segurança (CSP, HSTS, nosniff) e cache do service worker.
test/                   Testes do backend, do front e de integração (fora do deploy).
```

Princípios:

- **Núcleo offline**: placa (antiga e Mercosul, com conversão), RENAVAM (dígito verificador),
  chassi (estrutura, fabricante pelo WMI, ano pela 10ª posição), CPF e CNPJ, inclusive o CNPJ
  alfanumérico (IN RFB 2.229/2024), 37 verificações, achados automáticos, preço e laudo.
- **Servidor opcional**: hospedado na Vercel, o app usa o próprio domínio. Sem servidor (por
  exemplo, na página publicada no Claude), segue em modo assistido: indica onde consultar cada item.
- **Ausência não é "nada consta"**: campo que o provedor não informou fica não verificado e
  trava a decisão se for essencial.
- **Registro x documento**: chassi, RENAVAM, ano e UF do registro consultado são comparados com
  o que o vendedor apresentou; divergência de chassi ou RENAVAM é impedimento (indício de clonagem).
- **Chaves só no servidor** e **LGPD**: o proxy não repassa nome, CPF ou endereço do proprietário;
  logs mascaram a placa; o laudo mascara o CPF de quem vende.

## Cobertura nacional

As 27 UFs estão no seletor, sem estado pré-escolhido. Cada consulta de débito e restrição aponta
para o Detran da UF de registro (`detran.<uf>.gov.br`). Sem UF, o app mostra um achado pedindo a
UF; com servidor configurado, a UF vem do registro consultado. O app alerta que consulta oficial só
acontece em endereço `.gov.br`, porque há sites falsos imitando Detran e Senatran.

## Celular e app

- Barra fixa compacta (placa e decisão; toque na decisão para ver as notas), abas de etapas no
  rodapé, alvos de toque de 44 px e campos de 16 px (sem zoom automático no iPhone).
- **PWA**: hospedado na Vercel, o navegador oferece "Instalar app" (Android e desktop); no iPhone,
  Compartilhar → Adicionar à Tela de Início. Abre sem internet com os dossiês salvos no aparelho.
- **Lojas**: o mesmo PWA vai para a Google Play como TWA (Bubblewrap, com `assetlinks.json` no
  domínio). Para a App Store, empacote com Capacitor e acrescente recursos nativos (câmera para
  ler o QR code da placa e fotografar a vistoria): a Apple costuma recusar app que é só um site
  embrulhado (diretriz 4.2).

## Motor de decisão

| Situação | Decisão |
|---|---|
| Algum item impeditivo marcado como problema (roubo, gravame, restrição judicial, sinistro grave, chassi adulterado, dano estrutural, enchente, pagamento a terceiro, golpe do intermediário, titular diferente de quem vende, chassi ou RENAVAM divergente do registro) | Não compre |
| Alguma verificação essencial sem resposta | Laudo incompleto |
| Nota geral 80 ou mais e nenhum problema | Pode seguir com a compra |
| Demais casos | Só com ressalvas |

Nota por área (documentação, estrutura, mecânica, preço, pagamento): penalidade ponderada por
peso; item não verificado não reduz a nota, mas pode travar a decisão.

Teto da oferta = FIPE − reparos estimados − débitos que o comprador assumir. Não há desconto
percentual fixo para leilão ou sinistro: o laudo alerta e a negociação fica com o usuário.

## Deploy na Vercel

1. Suba a pasta para um repositório no GitHub e importe na Vercel (sem build step).
2. Configure as variáveis de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VEICULO_PROVIDER_URL` | para consulta por placa | URL do provedor com o marcador `{placa}`. Ex.: `https://api.provedor.com/v1/veiculo/{placa}`. Use `mock` para testar o fluxo sem custo (placas terminadas em 99 trazem gravame, leilão e débitos) |
| `VEICULO_PROVIDER_TOKEN` | conforme provedor | Token do provedor |
| `VEICULO_PROVIDER_AUTH_HEADER` | não | Nome do cabeçalho do token (padrão `Authorization`, enviado como `Bearer`) |
| `VEICULO_PROVIDER_NOME` | não | Nome exibido no laudo como fonte |
| `VEICULO_RATE_LIMIT` | não | Consultas por IP por hora (padrão 20) |
| `ALLOWED_ORIGINS` | não | Origens extras autorizadas, separadas por vírgula |
| `FIPE_BASE_URL` | não | Padrão `https://parallelum.com.br/fipe/api/v1` |
| `FIPE_TOKEN` | não | Enviado como `X-Subscription-Token`, se o seu plano exigir |

3. Abra o site: o modo "Automático" usa o próprio domínio como servidor.

Sem `VEICULO_PROVIDER_URL`, o sistema funciona em **modo assistido**: indica onde consultar
cada item (Sinesp Cidadão, CDT, Detran, relatórios pagos) e interpreta o que o usuário marcar.

## Ligando um provedor de consulta veicular

Cada provedor tem formato próprio. Antes de produção:

1. Faça uma consulta real e salve o JSON de resposta.
2. Ajuste os caminhos em `CAMPOS` (`api/_lib/normalizar.js`) para esse formato.
3. Se o provedor devolve objetos (ex.: `gravame: { banco, contrato }`), escreva a regra
   explícita: o mapeador genérico devolve `null` para objetos, de propósito.
4. Teste os três casos: nada consta, com restrição e campo ausente.

Contrato esperado pelo front (`GET /api/veiculo?placa=ABC1D23`):

```json
{
  "ok": true, "fonte": "Nome do provedor", "consultadoEm": "ISO-8601",
  "veiculo": { "placa": "", "chassi": "", "renavam": "", "marca": "", "modelo": "",
               "anoFabricacao": 2018, "anoModelo": 2019, "cor": "", "combustivel": "", "municipio": "", "uf": "CE" },
  "restricoes": { "rouboFurto": false, "judicial": false, "gravame": true, "administrativa": null, "remarcacaoChassi": false },
  "historico": { "leilao": false, "sinistroPerdaTotal": null },
  "debitos": { "ipva": 0, "licenciamento": 160.5, "multas": null }
}
```

`null` = o provedor não informou.

## Antes de vender como SaaS

- **Autenticação e cobrança por consulta**: o rate limit por IP é em memória (por instância).
  Com custo por consulta, coloque login (Clerk, Supabase Auth ou Auth.js), limite por usuário
  em Upstash Redis ou Vercel KV e registre consumo para faturamento.
- **Persistência**: hoje os dossiês ficam no navegador (localStorage) e podem ser exportados
  em JSON. Para lojistas e despachantes, mova para banco (Postgres/Supabase) com isolamento
  por conta.
- **Termos e LGPD**: base legal para consulta de placa, política de retenção e aviso de que o
  laudo não substitui vistoria cautelar nem consulta oficial.

## Testes

```
node test/backend.test.mjs                 # normalizador, mock, CORS, origem, caminhos FIPE (13)
python3 test/front_e2e.py                  # validadores, 27 UFs, motor, achados, XSS, importação (43)
node test/servidor-local.mjs &             # emula a Vercel em http://localhost:8788
python3 test/integracao.py                 # front + funções + FIPE pelo proxy (15)
python3 test/mobile_pwa.py                 # 360, 390 e 768 px, toque, abas, PWA offline (49)
```

Os testes de navegador usam Playwright (`pip install playwright && playwright install chromium`).
