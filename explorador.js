// Explorador territorial electoral — Capa 1 (resultado) + Capa 2 (socio por polígono)
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-33.45,-70.66], 10);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
const canvas = L.canvas({padding:.5});

const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const colBloque = b => BLOQCOL[b]||'#cccccc';
const SEQ=['#EFF3FB','#C6D9F0','#8CB3DE','#4A80C0','#16365A'];
const SOCIO_LBL={escolaridad:'Escolaridad (años)',pct_extranjeros:'% extranjeros',pct_indigena:'% pueblos orig.',
  pct_mujeres:'% mujeres',pct_60mas:'% 60+ años',pct_jov1824:'% jóvenes 18-24'};

let AREAS=null, RES={}, COM={}, MENU=null, SOCIO={}, RANGE={}, cutSel=null, elecSel=null, modo='electoral', capa=null;

Promise.all([
  fetch('data/explorador_menu.json?v=3').then(r=>r.json()),
  fetch('data/explorador_resultados.json?v=3').then(r=>r.json()),
  fetch('data/explorador_comuna.json?v=3').then(r=>r.json()),
  fetch('data/explorador_socio.json?v=3').then(r=>r.json()).catch(()=>({})),
  fetch('data/explorador_areas.geojson?v=3').then(r=>r.json()),
]).then(([menu,res,com,socio,areas])=>{
  MENU=menu; RES=res; COM=com; SOCIO=socio; AREAS=areas;
  computeRanges(); buildElecs(); buildMenu(); renderLegend();
});

function pctl(arr,p){ if(!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor((s.length-1)*p)]; }
function computeRanges(){
  Object.keys(SOCIO_LBL).forEach(k=>{
    const vals=Object.values(SOCIO).map(o=>o[k]).filter(v=>v!=null);
    RANGE[k]={lo:pctl(vals,.05), hi:pctl(vals,.95)};
  });
}
function socioColor(v,k){ if(v==null) return '#e5e5e5'; const r=RANGE[k]; if(!r||r.hi===r.lo) return SEQ[2];
  const t=Math.max(0,Math.min(1,(v-r.lo)/(r.hi-r.lo))); return SEQ[Math.min(4,Math.floor(t*5))]; }

function fillFor(codigo){
  if(modo==='electoral'){ const r=(RES[codigo]||{})[elecSel]; return colBloque(r&&r.bloque); }
  return socioColor((SOCIO[codigo]||{})[modo], modo);
}

// --- selector de elecciones ---
function buildElecs(){
  const box=document.getElementById('elecs'); box.innerHTML='';
  Object.entries(MENU.elecciones).forEach(([tipo,list])=>{
    list.sort((a,b)=> a.id<b.id?-1:1);
    list.forEach(e=>{
      const b=document.createElement('button'); b.textContent=e.label; b.dataset.id=e.id;
      b.onclick=()=>{ elecSel=e.id; document.querySelectorAll('#elecs button').forEach(x=>x.classList.toggle('on',x.dataset.id===e.id)); render(); };
      box.appendChild(b);
    });
  });
  elecSel=MENU.elecciones['Presidenciales'].slice(-1)[0].id;
  document.querySelectorAll('#elecs button').forEach(x=>x.classList.toggle('on',x.dataset.id===elecSel));
}

// --- menú izquierdo ---
function buildMenu(){
  const m=document.getElementById('menu'); m.innerHTML='';
  MENU.regiones.forEach(reg=>{
    const wrap=document.createElement('div'); wrap.className='rn-region';
    const h=document.createElement('button'); h.className='rn-head';
    h.innerHTML=`<span class="rt"><span class="chev">▶</span>${reg.region}</span><span class="cnt">${reg.comunas.length}</span>`;
    h.onclick=()=> wrap.classList.toggle('open');
    const cl=document.createElement('div'); cl.className='rn-comunas';
    reg.comunas.forEach(c=>{
      const cb=document.createElement('button'); cb.textContent=c.comuna; cb.dataset.cut=c.cut; cb.dataset.name=c.comuna.toLowerCase();
      cb.onclick=()=> selectComuna(c.cut, c.comuna, cb);
      cl.appendChild(cb);
    });
    wrap.appendChild(h); wrap.appendChild(cl); m.appendChild(wrap);
  });
}
document.getElementById('buscar').addEventListener('input', e=>{
  const q=e.target.value.toLowerCase().trim();
  document.querySelectorAll('.rn-region').forEach(reg=>{
    let any=false;
    reg.querySelectorAll('.rn-comunas button').forEach(b=>{ const hit=b.dataset.name.includes(q); b.style.display=hit?'':'none'; if(hit)any=true; });
    reg.style.display=any?'':'none'; if(q&&any) reg.classList.add('open'); else if(!q) reg.classList.remove('open');
  });
});

function selectComuna(cut, nombre, btn){
  cutSel=cut;
  document.querySelectorAll('#menu button.on').forEach(b=>b.classList.remove('on')); if(btn) btn.classList.add('on');
  const feats=AREAS.features.filter(f=>f.properties.cut===cut);
  if(!feats.length){ document.getElementById('resumen').innerHTML=`<b>${nombre}</b>: sin polígonos.`; return; }
  render();
  map.fitBounds(L.geoJSON({type:'FeatureCollection',features:feats}).getBounds(),{padding:[30,30]});
}

function render(){
  if(!cutSel||!elecSel) return;
  if(capa) map.removeLayer(capa);
  const feats=AREAS.features.filter(f=>f.properties.cut===cutSel);
  capa=L.geoJSON({type:'FeatureCollection',features:feats}, {
    renderer:canvas,
    style:f=>({color:'#fff',weight:.8,fillColor:fillFor(f.properties.codigo_rec),fillOpacity:.82}),
    onEachFeature:(f,l)=>{ l.bindPopup(popupHtml(f.properties));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:.8})); }
  }).addTo(map);
  renderResumen(feats); renderLegend();
}

function popupHtml(p){
  const r=(RES[p.codigo_rec]||{})[elecSel], s=SOCIO[p.codigo_rec]||{};
  let h=`<b>${p.recinto||''}</b><br>`;
  h+=r?`Ganó: <b>${r.ganador}</b> (${r.pct||'—'}%) · ${r.bloque||'—'}<br>Participación: ${r.part||'—'}%`:'sin resultado';
  if(s.pob) h+=`<hr style="border:none;border-top:1px solid #eee;margin:6px 0">`+
    `Pob: ${s.pob.toLocaleString('es-CL')} · Escolaridad: ${s.escolaridad||'—'} años<br>`+
    `Extranjeros: ${s.pct_extranjeros||'—'}% · 60+: ${s.pct_60mas||'—'}% · Mujeres: ${s.pct_mujeres||'—'}%`;
  return h;
}

function renderResumen(feats){
  const cr=(COM[cutSel]||{})[elecSel]; const nombre=(feats[0]&&feats[0].properties.comuna)||'';
  const lbl=(Object.values(MENU.elecciones).flat().find(x=>x.id===elecSel)||{}).label||elecSel;
  document.getElementById('resumen').innerHTML = cr
    ? `<div class="r-com">${nombre}</div><div class="r-el">${lbl}</div>`+
      `Ganó en la comuna: <b>${cr.ganador}</b> (${cr.pct||'—'}%)<br>Participación: <b>${cr.part||'—'}%</b>`+
      `<div class="r-hint">${modo==='electoral'?'Cada polígono = un local, color = bloque del más votado.':'Polígonos coloreados por '+SOCIO_LBL[modo]+' (Censo 2024).'}</div>`
    : `<b>${nombre}</b> — sin resultado para ${lbl}.`;
}

function renderLegend(){
  const el=document.getElementById('leg2');
  if(modo==='electoral'){
    el.innerHTML=Object.entries(BLOQCOL).map(([b,c])=>`<span class="lg"><i style="background:${c}"></i>${b}</span>`).join('');
  } else {
    const r=RANGE[modo]||{}; const fmt=v=>v==null?'—':(modo==='escolaridad'?v.toFixed(1):v.toFixed(0)+'%');
    el.innerHTML=`<span class="lg" style="width:100%;color:#333;font-weight:600">${SOCIO_LBL[modo]}</span>`+
      SEQ.map((c,i)=>`<span class="lg"><i style="background:${c}"></i>${i===0?fmt(r.lo):i===4?fmt(r.hi):''}</span>`).join('');
  }
}

document.getElementById('capa').addEventListener('change', e=>{ modo=e.target.value; if(cutSel) render(); else renderLegend(); });
