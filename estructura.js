// Estructura del voto — voto duro / tipología / realineamiento / prima de candidato. v1
// Datos: build_e7_frontdata.py (SERVEL) -> data/e7/{comuna,recinto,meta}.json
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-35.5,-71.3], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
const canvas = L.canvas({ padding:0.5 });
const info = document.getElementById('info');

let META, COM, REC, GEOCOM, GEOAREA, layer;
let view = 'duro', gran = 'comuna';

const VISTAS = [
  ['duro','Voto duro'], ['tipologia','Tipología'], ['realin','Realineamiento'], ['prima','Prima de candidato']
];
const BLOQ = {Izq:'#e2504a', Centro:'#f0a830', Der:'#3b6fb0', Populista:'#7a5aa8'};
const BLQN = {Izq:'Izquierda', Centro:'Centro', Der:'Derecha', Populista:'Populista/Otro'};
const TIPCOL = {'Bastión':'#2c6e49','Basculante':'#e76f51','Bisagra':'#e9c46a','Mixto':'#8d99ae',
  'Datos insuficientes':'#cbced4','insuf':'#cbced4'};
const GREY = '#cbced4';

const hex = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const mix = (a,b,t)=>{ const A=hex(a),B=hex(b); return `rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`; };
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
// diverge: v<0 -> blanco→neg ; v>0 -> blanco→pos ; escala por |hi|
const diverge=(v,neg,pos,hi)=>{ if(v==null) return GREY; const t=clamp(v/hi,-1,1);
  return t<0 ? mix('#f2f3f5',neg,-t) : mix('#f2f3f5',pos,t); };

const pct = x => x==null ? '—' : Math.round(x*100)+'%';
const spp = x => x==null ? '—' : (x>=0?'+':'')+Math.round(x*100)+'pp';

// modal tipología de una comuna (mayor fracción de recintos)
function comTip(d){ if(!d.tip) return null; let bk=null,bv=-1; for(const k in d.tip){ if(d.tip[k]>bv){bv=d.tip[k];bk=k;} } return bv>0?bk:null; }

// {color, valido} para una unidad según la vista
function styleFor(d){
  if(!d) return {c:GREY, ok:false};
  if(view==='duro'){ if(!d.dom) return {c:GREY,ok:false};
    const op = 0.25 + 0.6*clamp((d.piso-0.30)/0.45,0,1);
    return {c:BLOQ[d.dom]||GREY, ok:true, op}; }
  if(view==='tipologia'){ const t = gran==='comuna'?comTip(d):d.tip; return {c:TIPCOL[t]||GREY, ok:!!t && t!=='insuf'}; }
  if(view==='realin'){ const v=d.realin; return {c:diverge(v,'#e2504a','#3b6fb0',0.30), ok:v!=null}; } // + = se derechiza (azul)
  if(view==='prima'){ const p=d.prima; if(!p||p.prima==null) return {c:GREY,ok:false};
    return {c:diverge(p.prima,'#c1121f','#178a6e',0.40), ok:true}; }        // + = arrastre personal (verde)
  return {c:GREY,ok:false};
}

function popup(name, d, isRec){
  if(!d) return `<b>${name}</b><br><span style="color:#888">sin datos</span>`;
  if(view==='prima'){ const p=d.prima;
    if(!p) return `<b>${name}</b><br><span style="color:#888">alcalde sin clasificar (independiente)</span>`;
    return `<b>${name}</b><br>Alcalde: <b>${p.cand}</b> (${BLQN[p.b3]||p.b3})<br>`+
      `Votación: <b>${pct(p.share)}</b> · piso del bloque: ${pct(p.piso)}<br>`+
      `Prima personal: <b>${spp(p.prima)}</b> ${p.prima>=0?'de arrastre sobre su base':'(bajo su base)'}`;
  }
  if(!d.dom && (isRec)) return `<b>${name}</b><br><span style="color:#888">datos insuficientes (&lt;4 elecciones)</span>`;
  let h=`<b>${name}</b><br>`;
  h+=`Bloque dominante: <b>${BLQN[d.dom]||'—'}</b> · piso <b>${pct(d.piso)}</b><br>`;
  h+=`Realineamiento 2021→2025: <b>${spp(d.realin)}</b> ${d.realin>0?'(hacia la derecha)':d.realin<0?'(hacia la izquierda)':''}<br>`;
  if(isRec){ h+=`Tipología: <b>${d.tip}</b>${d.ancla?'':' · sin ancla 2021'}`; }
  else if(d.tip){ const t=comTip(d); h+=`Tipología dominante: <b>${t||'—'}</b> · ${d.nrec} recintos`;
    if(d.b) h+=`<br><span style="color:#888">Pisos — Izq ${pct(d.b.Izq)} · C ${pct(d.b.Centro)} · Der ${pct(d.b.Der)}</span>`; }
  return h;
}

function legend(){
  const L=document.getElementById('legend'); let h='';
  if(view==='duro'){ h='<div class="row"><b>Bloque dominante (piso)</b></div>'+
    Object.keys(BLOQ).map(k=>`<div class="row"><i style="background:${BLOQ[k]}"></i>${BLQN[k]}</div>`).join('')+
    '<div class="row estr-note">Opacidad = piso (voto duro): más opaco, piso más alto.</div>'; }
  else if(view==='tipologia'){ h='<div class="row"><b>Tipología</b></div>'+
    ['Bastión','Basculante','Bisagra','Mixto','Datos insuficientes'].map(k=>
      `<div class="row"><i style="background:${TIPCOL[k]}"></i>${k}</div>`).join(''); }
  else if(view==='realin'){ h='<div class="row"><b>Realineamiento 2021→2025</b></div>'+
    `<div class="row"><i style="background:${mix('#f2f3f5','#e2504a',.85)}"></i>Se izquierdiza</div>`+
    `<div class="row"><i style="background:#f2f3f5"></i>Estable</div>`+
    `<div class="row"><i style="background:${mix('#f2f3f5','#3b6fb0',.85)}"></i>Se derechiza</div>`; }
  else { h='<div class="row"><b>Prima personal del alcalde (2024)</b></div>'+
    `<div class="row"><i style="background:${mix('#f2f3f5','#c1121f',.85)}"></i>Bajo su base (voto propio débil)</div>`+
    `<div class="row"><i style="background:#f2f3f5"></i>≈ su base</div>`+
    `<div class="row"><i style="background:${mix('#f2f3f5','#178a6e',.85)}"></i>Arrastre personal</div>`+
    `<div class="row estr-note">Solo comuna. Comunas con alcalde independiente sin clasificar quedan en gris.</div>`; }
  L.innerHTML=h;
  document.getElementById('estr-desc').textContent = (META&&META.vistas&&META.vistas[view]) || '';
}

function render(){
  if(layer) map.removeLayer(layer);
  const isRec = gran==='recinto';
  const gj = isRec ? GEOAREA : GEOCOM;
  const dat = isRec ? REC : COM;
  const key = f => String(isRec ? f.properties.codigo_rec : f.properties.cut);
  const nm  = f => isRec ? (f.properties.recinto||('Recinto '+f.properties.codigo_rec)) : (f.properties.comuna||f.properties.cut);
  layer = L.geoJSON(gj, { renderer:canvas,
    style:f=>{ const d=dat[key(f)]; const s=styleFor(d);
      return {color: isRec?'#fff':'#9aa0a8', weight: isRec?.3:.5,
        fillColor:s.c, fillOpacity: s.op!=null? s.op : (s.ok?0.8:0.35)}; },
    onEachFeature:(f,l)=>{ const d=dat[key(f)];
      l.bindPopup(()=>popup(nm(f),d,isRec));
      l.on('mouseover',()=>{ info.innerHTML=popup(nm(f),d,isRec); l.setStyle({weight:2,color:'#333'}); });
      l.on('mouseout',()=>{ l.setStyle({color:isRec?'#fff':'#9aa0a8', weight:isRec?.3:.5}); }); }
  }).addTo(map);
  legend();
}

// controles
const vbox=document.getElementById('estr-views');
VISTAS.forEach(([k,lbl])=>{ const b=document.createElement('button'); b.textContent=lbl; b.className=k===view?'on':'';
  b.onclick=()=>{ view=k; [...vbox.children].forEach(x=>x.classList.toggle('on',x.textContent===lbl));
    // prima solo comuna
    if(view==='prima' && gran==='recinto'){ gran='comuna'; syncGran(); }
    render(); }; vbox.appendChild(b); });
function syncGran(){ document.querySelectorAll('#estr-gran button').forEach(b=>b.classList.toggle('on',b.dataset.g===gran)); }
document.querySelectorAll('#estr-gran button').forEach(b=> b.onclick=()=>{
  if(view==='prima' && b.dataset.g==='recinto') return;  // prima no tiene nivel recinto
  gran=b.dataset.g; syncGran(); render(); });

Promise.all([
  fetch('data/e7/meta.json?v=1').then(r=>r.json()),
  fetch('data/e7/comuna.json?v=1').then(r=>r.json()),
  fetch('data/e7/recinto.json?v=1').then(r=>r.json()),
  fetch('data/comunas.geojson?v=1').then(r=>r.json()),
  fetch('data/areas_pobladas.geojson?v=1').then(r=>r.json()),
]).then(([meta,com,rec,gc,ga])=>{ META=meta; COM=com; REC=rec; GEOCOM=gc; GEOAREA=ga; render(); })
 .catch(e=>{ info.innerHTML='<span style="color:#c00">Error cargando datos: '+e+'</span>'; });
