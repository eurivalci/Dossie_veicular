import json, sys, pathlib
from playwright.sync_api import sync_playwright
URL=(pathlib.Path(__file__).resolve().parent.parent/'index.html').as_uri()
fails=[]; n=0
def ok(c,m):
    global n; n+=1
    if not c: fails.append(m); print('FALHA:',m)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1360,'height':900})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: d.accept())
    pg.route('**/fonts.googleapis.com/**',lambda r:r.abort()); pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
    pg.goto(URL); pg.wait_for_timeout(400)
    ev=lambda js: pg.evaluate(js)
    # validadores
    ok(ev("__DV.V.placa('abc-1234').equivalente")=='ABC1C34','placa antiga→mercosul')
    ok(ev("__DV.V.placa('ABC1C34').equivalente")=='ABC1234','mercosul→antiga')
    ok(ev("__DV.V.placa('AB12345').ok")==False,'placa inválida')
    ok(ev("__DV.V.renavam('00639884962').ok")==True,'renavam válido')
    ok(ev("__DV.V.renavam('00639884961').ok")==False,'renavam DV errado')
    ok(ev("__DV.V.renavam('639884962').ok")==True,'renavam 9 dígitos')
    d=ev("__DV.V.chassi('9BWZZZ377VT004251')")
    ok(d['ok'] and d['anosPossiveis']==[1997,2027] and d['fabricante'].startswith('Volkswagen'),'decodifica chassi')
    ok(ev("__DV.V.chassi('9BWZZZ377VT00425O').ok")==False,'chassi com O')
    ok(ev("__DV.num('1.234,56')")==1234.56 and ev("__DV.num('50000')")==50000 and ev("__DV.num('50.000')")==50000 and ev("__DV.num('R$ 12.500')")==12500,'parser BRL')
    # estado inicial
    ok(pg.locator('#vTitle').inner_text()=='Laudo incompleto','inicial incompleto')
    ok(pg.input_value('#uf')=='','UF começa vazia')
    ok('Escolha a UF' in pg.inner_text('#listConsultas'),'Detran pede UF')
    pg.select_option('#uf','MG')
    ok(pg.locator('#listConsultas a[href="https://www.detran.mg.gov.br/"]').count()>=3,'links Detran-MG')
    pg.fill('#placa','abc1d23'); ok(pg.input_value('#placa')=='ABC1D23','normaliza placa')
    pg.fill('#renavam','00639884962'); ok('confere' in pg.inner_text('#renavamMsg'),'msg renavam')
    pg.fill('#chassi','9bwzzz377vt004251'); pg.fill('#anoMod','2014')
    ok('não confere' in pg.inner_text('#decode'),'ano chassi divergente sinalizado')
    pg.fill('#anoMod','1997'); ok('confere com o documento' in pg.inner_text('#decode'),'ano chassi confere')
    # responder essenciais como ok
    def seg(rowid,s):
        pg.click(f'.row[data-row="{rowid}"] .seg button[data-s="{s}"]')
    for r in ['roubo','titular','debitos','gravame','judicial']: seg(r,'ok')
    for r in ['i_chassi','i_eta']: seg(r,'ok')
    seg('g_conta','sim'); seg('g_intermed','nao'); seg('g_atpv','sim')
    pg.wait_for_timeout(200)
    ok(pg.locator('#verdict').get_attribute('data-v')=='go', 'essenciais ok → pode seguir (got %s)'%pg.locator('#verdict').get_attribute('data-v'))
    # preço muito abaixo
    pg.fill('#preco','30.000'); pg.fill('#fipe','50000'); pg.wait_for_timeout(150)
    ok('-40' in pg.inner_text('#finOut'),'diferença -40%')
    ok(pg.locator('#verdict').get_attribute('data-v')=='caution','preço suspeito → ressalvas')
    pg.fill('#reparos','2000'); pg.select_option('#pagaDeb','comprador'); pg.fill('#ipva','1000')
    pg.wait_for_timeout(150); ok('R$\xa047.000' in pg.inner_text('#finOut'),'teto = fipe-reparos-débitos')
    # bloqueio
    seg('roubo','problema'); pg.wait_for_timeout(150)
    ok(pg.locator('#verdict').get_attribute('data-v')=='block','roubo → não compre')
    seg('roubo','problema'); pg.wait_for_timeout(100)  # desmarca
    ok(pg.locator('#verdict').get_attribute('data-v')=='incomplete','desmarcar volta a incompleto')
    seg('roubo','ok'); seg('g_conta','nao'); pg.wait_for_timeout(150)
    ok(pg.locator('#verdict').get_attribute('data-v')=='block','pagar a terceiro → não compre')
    # XSS na anotação
    pg.fill('.row[data-row="g_conta"] input[data-note]','<img src=x onerror="window.__x=1">')
    pg.wait_for_timeout(500)
    ok(ev("window.__x")is None and '&lt;img' in pg.inner_html('#report'),'anotação escapada no laudo')
    ok(len(ev("__DV.S.c ? Object.keys(__DV.S.c) : []"))>0,'estado')
    # persistência
    pg.wait_for_timeout(400); pg.reload(); pg.wait_for_timeout(400)
    ok(pg.input_value('#placa')=='ABC1D23' and pg.locator('#verdict').get_attribute('data-v')=='block','persistência após recarregar')
    # sanitize import
    bad=ev("(()=>{try{__DV.sanitize({schema:9});return 'aceitou'}catch(e){return e.message}})()")
    ok('compatível' in bad,'rejeita schema errado')
    san=ev("""__DV.sanitize({schema:1,v:{placa:'X'.repeat(999),uf:'ZZ',evil:1},c:{roubo:{s:'hack',n:'a'},gravame:{s:'ok'}},i:{},g:{},f:{}})""")
    ok(len(san['v']['placa'])==200 and san['v']['uf']=='' and 'evil' not in san['v'] and san['c']['roubo']['s'] is None and san['c']['gravame']['s']=='ok','sanitiza importação')
    # validadores de documento do vendedor
    ok(ev("__DV.achados({placa:'ABC1D23',uf:''},null).some(x=>x.t.startsWith('UF de registro'))"),'achado UF ausente')
    ok(ev("UFS.length")==27 and ev("UFS.every(u=>detranUrl(u).endsWith('.gov.br/'))"),'27 Detrans .gov.br')
    ok(ev("__DV.V.doc('529.982.247-25').ok")==True and ev("__DV.V.doc('529.982.247-24').ok")==False,'CPF')
    ok(ev("__DV.V.doc('11.222.333/0001-81').ok")==True,'CNPJ numérico')
    ok(ev("__DV.V.doc('12.ABC.345/01DE-35').ok")==True,'CNPJ alfanumérico (exemplo RFB)')
    ok(ev("__DV.V.mascaraDoc('52998224725')")=='***.982.247-**','mascara CPF no laudo')
    # achados: titular diferente vira impeditivo
    a=ev("__DV.achados({placa:'ABC1D23',titular:'Maria da Silva',nomeVend:'João Souza',vendedor:'particular',anoFab:'2010',anoMod:'2010',km:'9000'},null)")
    ts=[x['t'] for x in a]
    ok('Quem vende não é o titular do documento' in ts and 'Quilometragem muito baixa para a idade' in ts,'achados titular e km (%s)'%ts)
    a=ev("__DV.achados({titular:'MARIA DA SILVA',nomeVend:'maria da silva',vendedor:'particular'},null)")
    ok(a==[],'mesmo nome com acento/caixa não acusa')
    a=ev("__DV.achados({chassi:'9BWZZZ377VT004251',renavam:'00639884962',uf:'CE',anoMod:'2020'},{veiculo:{chassi:'9BWZZZ377VT004252',renavam:'00639884962',anoModelo:2020,uf:'CE'},restricoes:{}})")
    ok(any(x['t'].startswith('Chassi informado difere') and x['s']=='problema' for x in a),'divergência com registro')
    # contrato do servidor: null não vira ok
    n_ap=ev("""__DV.aplicarRegistro({ok:true,fonte:'T',consultadoEm:new Date().toISOString(),veiculo:{},restricoes:{rouboFurto:false,gravame:null,judicial:null,administrativa:null},historico:{leilao:true,sinistroPerdaTotal:null},debitos:{ipva:10,multas:null,licenciamento:0}})""")
    ok(n_ap==2,'aplica só o que o provedor informou (%s)'%n_ap)
    ok(ev("__DV.S.c.gravame && __DV.S.c.gravame.prov ? 'tocou' : 'intacto'")=='intacto' or ev("__DV.S.c.gravame.s")!=None,'gravame null não sobrescreve')
    ok(ev("(()=>{try{__DV.aplicarRegistro({foo:1});return 'aceitou'}catch(e){return 'rejeitou'}})()")=='rejeitou','rejeita formato inválido')
    ok(errs==[],'sem erros JS: %s'%errs)
    pg.reload(); pg.wait_for_timeout(300)
    None
    pg.locator('#s-consultas').scroll_into_view_if_needed(); None
    pg.locator('#s-financeiro').scroll_into_view_if_needed(); None
    pg.locator('#s-laudo').scroll_into_view_if_needed(); pg.wait_for_timeout(200); None
    pg.emulate_media(media='print'); None ; pg.emulate_media(media='screen')
    ev("document.documentElement.dataset.theme='light'"); pg.evaluate("window.scrollTo(0,0)"); None
    m=b.new_page(viewport={'width':390,'height':844}); m.on('pageerror',lambda e: errs.append(str(e)))
    m.goto(URL); m.wait_for_timeout(300); None
    sw=m.evaluate("document.documentElement.scrollWidth"); ok(sw<=390,'sem rolagem lateral no celular (%s)'%sw)
    m.locator('#s-consultas').scroll_into_view_if_needed(); None
    b.close()
print(f'{n-len(fails)}/{n} OK'); sys.exit(1 if fails else 0)
