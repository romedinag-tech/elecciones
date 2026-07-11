// M1 — Tendencia política por distrito
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-35.5,-71.3], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  { attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);

// escala divergente por eje (izq→der), centrada en 5.0
const BINS=[[0,4.25,'#2166ac'],[4.25,4.75,'#67a9cf'],[4.75,5.25,'#f7f7f7'],[5.25,5.75,'#fddbc7'],[5.75,6.25,'#ef8a62'],[6.25,10,'#b2182b']];
const ejeColor = e => { if(e==null) return '#dddddd'; for(const[a,b,c] of BINS) if(e>=a && e<b) return c; return '#b2182b'; };
const canvas = L.canvas({padding:.5});
const info=document.getElementById('info');
let gj=null, layer=null, series=null, anio='2025';

function draw(){
  if(layer) map.removeLayer(layer);
  const key='eje_'+anio;
  layer = L.geoJSON(gj, { renderer:canvas,
    style: f => ({ color:'#888', weight:.5, fillColor: ejeColor(f.properties[key]), fillOpacity:.82 }),
    onEachFeature:(f,l)=> l.on('mouseover', ()=>{
      const p=f.properties;
      info.innerHTML=`<b>Distrito ${p.distrito_num}</b> · ${p.region||''}<br>`+
        `Eje ${anio}: <b>${p[key]!=null?p[key].toFixed(2):'—'}</b>/10<br>`+
        `Cambio 2013→2025: <b>${p.delta_2013_2025!=null?(p.delta_2013_2025>0?'+':'')+p.delta_2013_2025:'—'}</b> ${p.delta_2013_2025>0?'(→ derecha)':p.delta_2013_2025<0?'(→ izquierda)':''}`;
    })
  }).addTo(map);
  renderSerie();
}

function renderSerie(){
  if(!series) return;
  const s=series.presidencial.find(x=>x.anio==+anio); if(!s) return;
  const orden=['Izquierda','Centro-izquierda','Centro','Populista/Otro','Centro-derecha','Derecha','Derecha radical'];
  const col={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#999','Populista/Otro':'#b59','Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
  let html=`<div class="serie-t">País ${anio} · eje medio <b>${s.eje_medio}</b>/10</div>`;
  orden.forEach(b=>{ const v=s.bloques[b]; if(v==null) return;
    html+=`<div class="bar"><span class="bl">${b}</span><span class="tk" style="width:${Math.min(100,v*2.2)}px;background:${col[b]}"></span><span class="pv">${v.toFixed(0)}%</span></div>`; });
  document.getElementById('serie').innerHTML=html;
}

Promise.all([
  fetch('data/tendencia_distritos.geojson?v=1').then(r=>r.json()),
  fetch('data/tendencia_series.json?v=1').then(r=>r.json())
]).then(([g,s])=>{ gj=g; series=s; draw(); });

document.getElementById('anio').addEventListener('change', e=>{ anio=e.target.value; draw(); });

// leyenda
document.getElementById('legend').innerHTML='<div class="row"><b>Eje izq–der</b></div>'+
  [['#2166ac','Izquierda (&lt;4,25)'],['#67a9cf','Centro-izq'],['#f7f7f7','Centro (~5,0)'],['#ef8a62','Centro-der'],['#b2182b','Derecha (&gt;6,25)']]
  .map(([c,t])=>`<div class="row"><i style="background:${c};border:1px solid #ccc"></i>${t}</div>`).join('');
