import http from 'http'; import fs from 'fs';
const D=new URL('../', import.meta.url).pathname;
process.env.VEICULO_PROVIDER_URL='mock'; process.env.FIPE_BASE_URL='http://127.0.0.1:8788/fipe';
const H={veiculo:(await import(new URL('../api/', import.meta.url).href+'veiculo.js')).default,fipe:(await import(new URL('../api/', import.meta.url).href+'fipe.js')).default,saude:(await import(new URL('../api/', import.meta.url).href+'saude.js')).default};
http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname.startsWith('/fipe/')){ // upstream FIPE falso (formato v1)
    res.setHeader('Content-Type','application/json'); const p=u.pathname;
    if(p.endsWith('/marcas')) return res.end(JSON.stringify([{codigo:'59',nome:'VW - VolksWagen'}]));
    if(p.endsWith('/modelos')) return res.end(JSON.stringify({modelos:[{codigo:5940,nome:'Gol 1.0'}],anos:[]}));
    if(p.endsWith('/anos')) return res.end(JSON.stringify([{codigo:'2020-1',nome:'2020 Gasolina'}]));
    return res.end(JSON.stringify({Valor:'R$ 52.340,00',Marca:'VW',Modelo:'Gol 1.0',AnoModelo:2020,Combustivel:'Gasolina',CodigoFipe:'005340-6',MesReferencia:'outubro de 2026 '}));
  }
  const m=u.pathname.match(/^\/api\/(\w+)$/);
  if(m&&H[m[1]]){ req.query=Object.fromEntries(u.searchParams); return H[m[1]](req,res); }
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(fs.readFileSync(D+'index.html'));
}).listen(8788,()=>console.log('up'));
