import sys, pathlib
from playwright.sync_api import sync_playwright
fails=[];n=0
def ok(c,m):
    global n;n+=1
    if not c: fails.append(m);print('FALHA:',m)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1360,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.route('**/fonts.*/**',lambda r:r.abort())
    pg.goto('http://localhost:8788/'); pg.wait_for_timeout(800)
    ok('Servidor conectado' in pg.inner_text('#connMsg'),'modo automático no mesmo domínio: '+pg.inner_text('#connMsg'))
    ok(pg.is_enabled('#bConsultar'),'botão consultar habilitado')
    pg.fill('#placa','ABC1D99'); pg.fill('#chassi','9BWAB45U0KT004252')  # chassi diverge do registro simulado
    pg.click('#bConsultar'); pg.wait_for_timeout(1000)
    st=pg.evaluate("({g:__DV.S.c.gravame?.s,r:__DV.S.c.roubo?.s,l:__DV.S.c.leilao?.s,sin:__DV.S.c.sinistro?.s||null,ipva:__DV.S.f.ipva,ren:__DV.S.v.renavam,mod:__DV.S.v.modelo})")
    ok(st['g']=='problema' and st['r']=='ok' and st['l']=='alerta','status sugeridos %s'%st)
    ok(st['sin'] is None,'perda total ausente fica não verificado')
    ok(st['ipva']=='1830.5' and st['ren']=='00639884962' and 'GOL' in st['mod'],'preenche débitos e campos vazios')
    ok(pg.get_attribute('#verdict','data-v')=='block','gravame → não compre')
    ok('Chassi informado difere do registro' in pg.inner_text('#achados'),'achado de divergência visível')
    ok('Ano codificado' not in pg.inner_text('#achados'),'simulação coerente: ano do chassi confere')
    ok('ABC1D99' in pg.inner_text('#dossieSel'),'seletor atualiza com a placa')
    ok('Sugerido por Simulação' in pg.inner_text('#listConsultas'),'proveniência exibida')
    ok('Simulação' in pg.inner_text('#report'),'registro citado no laudo')
    # FIPE pelo proxy
    pg.click('#bFipeLoad'); pg.wait_for_timeout(500)
    pg.select_option('#fMarca','59'); pg.wait_for_timeout(500)
    pg.select_option('#fModelo','5940'); pg.wait_for_timeout(500)
    pg.select_option('#fAno','2020-1'); pg.wait_for_timeout(600)
    ok(pg.input_value('#fipe')=='52340','FIPE via proxy: %s'%pg.input_value('#fipe'))
    ok('005340-6' in pg.inner_text('#fipeStatus'),'referência FIPE')
    ok(errs==[],'sem erros JS %s'%errs)
    pg.locator('#s-veiculo').scroll_into_view_if_needed(); pg.evaluate("window.scrollTo(0,0)"); None
    pg.locator('#achados').scroll_into_view_if_needed(); None
    # sem servidor (como na página publicada): modo assistido
    pg2=b.new_page(); pg2.goto((pathlib.Path(__file__).resolve().parent.parent/'index.html').as_uri()); pg2.wait_for_timeout(500)
    ok('Modo assistido' in pg2.inner_text('#connMsg') and not pg2.is_enabled('#bConsultar'),'modo assistido sem servidor')
    b.close()
print(f'{n-len(fails)}/{n} OK'); sys.exit(1 if fails else 0)
