# Celular (layout, toque, barra fixa, abas) e app instalável (manifesto, service worker, offline).
# Requer: node test/servidor-local.mjs em execução.
import sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8788/'
fails=[];n=0
def ok(c,m):
    global n;n+=1
    if not c: fails.append(m);print('FALHA:',m)
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw,vh,nome in [(360,740,'android pequeno'),(390,844,'iphone'),(768,1024,'tablet')]:
        c=b.new_context(viewport={'width':vw,'height':vh},is_mobile=True,has_touch=True,device_scale_factor=2)
        pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.route('**/fonts.*/**',lambda r:r.abort())
        pg.goto(BASE); pg.wait_for_timeout(700)
        ok(pg.evaluate('document.documentElement.scrollWidth')<=vw,f'{nome}: sem rolagem lateral')
        top=pg.evaluate("document.querySelector('.rail').getBoundingClientRect().height")
        ok(top<=200,f'{nome}: barra do topo compacta ({top:.0f}px)')
        nav=pg.evaluate("(()=>{const r=document.querySelector('.rail-nav').getBoundingClientRect();return {b:r.bottom,h:r.height,pos:getComputedStyle(document.querySelector('.rail-nav')).position}})()")
        ok(nav['pos']=='fixed' and abs(nav['b']-vh)<2,f'{nome}: abas fixas no rodapé {nav}')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#renavam')).fontSize")=='16px',f'{nome}: campo 16px (sem zoom no iPhone)')
        hb=pg.evaluate("Math.min(...[...document.querySelectorAll('.seg button,.btn,.rail-nav a')].filter(e=>e.offsetParent).map(e=>e.getBoundingClientRect().height))")
        ok(hb>=43.5,f'{nome}: alvos de toque ≥44px ({hb:.0f})')
        pg.fill('#placa','ABC1D99'); pg.wait_for_timeout(300)
        # navegar pelas abas: título da seção não fica sob a barra
        pg.tap('.rail-nav a[data-nav="s-golpes"]'); pg.wait_for_timeout(900)
        y=pg.evaluate("document.querySelector('#s-golpes h2').getBoundingClientRect().top")
        ok(y>=top-2 and y<vh*0.6,f'{nome}: título visível após tocar a aba (y={y:.0f}, topo={top:.0f})')
        ok(pg.get_attribute('.rail-nav a[data-nav="s-golpes"]','aria-current')=='true',f'{nome}: aba ativa marcada')
        # marcar resposta por toque
        pg.tap('.row[data-row="g_conta"] .seg button[data-s="nao"]'); pg.wait_for_timeout(200)
        ok(pg.get_attribute('#verdict','data-v')=='block',f'{nome}: toque atualiza o veredito')
        # veredito expande
        ok(not pg.is_visible('#axes'),f'{nome}: notas recolhidas'); pg.tap('#verdict'); pg.wait_for_timeout(150)
        ok(pg.is_visible('#axes'),f'{nome}: toque no veredito mostra as notas'); pg.tap('#verdict')
        # menu
        ok(not pg.is_visible('#bExport'),f'{nome}: ferramentas no menu'); pg.tap('#bMenu'); pg.wait_for_timeout(150)
        ok(pg.is_visible('#bExport'),f'{nome}: menu abre')
        ok(errs==[],f'{nome}: sem erros JS {errs}')
        pg.tap('#bMenu')
        if nome=='iphone':
            pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/m_topo.png')
            pg.tap('.rail-nav a[data-nav="s-consultas"]'); pg.wait_for_timeout(900); pg.screenshot(path='/tmp/m_consultas.png')
            pg.tap('#verdict'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/m_veredito.png'); pg.tap('#verdict')
            pg.tap('.rail-nav a[data-nav="s-financeiro"]'); pg.wait_for_timeout(900); pg.screenshot(path='/tmp/m_preco.png')
        c.close()
    # PWA
    c=b.new_context(viewport={'width':390,'height':844}); pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    csp=[]; pg.on('console',lambda m: csp.append(m.text) if 'Content Security Policy' in m.text else None)
    pg.goto(BASE); pg.wait_for_timeout(500)
    man=pg.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())")
    ok(man['display']=='standalone' and any(i.get('purpose')=='maskable' for i in man['icons']),'manifesto instalável')
    for ic in man['icons']:
        st=pg.evaluate(f"fetch('{ic['src']}').then(r=>r.status+' '+r.headers.get('content-type'))")
        ok(st=='200 image/png',f'ícone {ic["src"]}: {st}')
    reg=pg.evaluate("navigator.serviceWorker.ready.then(r=>!!r.active)")
    ok(reg,'service worker ativo')
    pg.reload(); pg.wait_for_timeout(500)
    pg.fill('#placa','QWE1R23'); pg.wait_for_timeout(400)
    c.set_offline(True); pg.reload(); pg.wait_for_timeout(800)
    ok(pg.title().startswith('Dossiê Veicular') and pg.input_value('#placa')=='QWE1R23','abre offline com o dossiê salvo')
    ok('não respondeu' in pg.inner_text('#connMsg') or 'Modo assistido' in pg.inner_text('#connMsg'),'offline cai para modo assistido: '+pg.inner_text('#connMsg'))
    cached=pg.evaluate("caches.keys().then(ks=>Promise.all(ks.map(k=>caches.open(k).then(c=>c.keys())))).then(a=>a.flat().map(r=>new URL(r.url).pathname))")
    ok(not any(x.startswith('/api/') for x in cached),f'nenhuma consulta em cache {cached}')
    ok(csp==[],f'sem violações de CSP {csp}')
    ok(errs==[],f'PWA sem erros JS {errs}')
    b.close()
print(f'{n-len(fails)}/{n} OK'); sys.exit(1 if fails else 0)
