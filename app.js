// Visor de recintos de votación de Chile — v1
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-35.5,-71.3], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19
}).addTo(map);

const BINS = [0, 2000, 5000, 10000, 20000, 40000];
const COLORS = ['#fee5d9','#fcbba1','#fc9272','#fb6a4a','#de2d26','#a50f15'];
const colorFor = v => { if(v==null) return '#cccccc'; for(let i=BINS.length-1;i>=0;i--) if(v>=BINS[i]) return COLORS[i]; return COLORS[0]; };
const radiusFor = v => v==null?3 : Math.max(3, Math.min(22, Math.sqrt(v)/12));
const canvas = L.canvas({ padding:0.5 });
const info = document.getElementById('info');
let areasLayer, recLayer, recData=null, penOnly=false;

const popupHtml = p => {
  const nse = p.dependencia ? `<span class="tag">${p.dependencia}</span>` : '';
  return `<b>${p.recinto||'—'}</b><br>${p.comuna||''} · ${p.region||''}<br>`+
    `Mesas: <b>${p.n_mesas??'—'}</b> · Inscritos: <b>${p.inscritos?p.inscritos.toLocaleString('es-CL'):'—'}</b><br>`+
    `${p.glosa_tipo||''} ${nse}`;
};

function buildRec(){
  if(recLayer) map.removeLayer(recLayer);
  recLayer = L.geoJSON(recData, {
    renderer: canvas,
    filter: f => !penOnly || f.properties.glosa_tipo==='Centro Penitenciario',
    pointToLayer:(f,latlng)=> L.circleMarker(latlng, {
      radius: radiusFor(f.properties.inscritos),
      fillColor: f.properties.glosa_tipo==='Centro Penitenciario' ? '#5b21b6' : '#08519c',
      color:'#fff', weight:.6, fillOpacity:.85 }),
    onEachFeature:(f,l)=>{ l.bindPopup(popupHtml(f.properties)); l.on('mouseover',()=> info.innerHTML=popupHtml(f.properties)); }
  }).addTo(map);
}

fetch('data/areas.geojson?v=1').then(r=>r.json()).then(gj=>{
  areasLayer = L.geoJSON(gj, {
    renderer: canvas,
    style: f => ({ color:'#7a7a7a', weight:.4, fillColor:colorFor(f.properties.inscritos), fillOpacity:.55 }),
    onEachFeature:(f,l)=> l.on('mouseover', ()=> info.innerHTML = popupHtml(f.properties))
  }).addTo(map);
});
fetch('data/recintos.geojson?v=1').then(r=>r.json()).then(gj=>{ recData=gj; buildRec(); });

const tg=(id,fn)=>document.getElementById(id).addEventListener('change',e=>fn(e.target.checked));
tg('tgAreas', on=> areasLayer && (on? areasLayer.addTo(map) : map.removeLayer(areasLayer)));
tg('tgRec',   on=> recLayer  && (on? recLayer.addTo(map)  : map.removeLayer(recLayer)));
tg('tgPen',   on=>{ penOnly=on; if(recData) buildRec(); });

const lg=document.getElementById('legend');
lg.innerHTML='<div class="row"><b>Inscritos por local</b></div>'+
  BINS.map((b,i)=>`<div class="row"><i style="background:${COLORS[i]}"></i>${b.toLocaleString('es-CL')}${BINS[i+1]?'–'+BINS[i+1].toLocaleString('es-CL'):'+'}</div>`).join('')+
  '<div class="row" style="margin-top:5px"><i style="background:#5b21b6;border-radius:50%"></i>Centro penitenciario</div>';
