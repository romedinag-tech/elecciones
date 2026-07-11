// Explorador territorial electoral — multinivel (año→tipo) × (región/distrito/circ.sen/comuna/polígono)
const V='8';
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-35.5,-71.3], 5);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
const canvas = L.canvas({padding:.5});

const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const OPCION_COL={'APRUEBO':'#3F8E86','A FAVOR':'#3F8E86','RECHAZO':'#C55A11','EN CONTRA':'#C55A11'};
const colResult = r => { if(!r) return '#e5e5e5'; if(r.bloque) return BLOQCOL[r.bloque]||'#b9c0cb';
  const o=(r.ganador||'').toUpperCase(); return OPCION_COL[o]||'#b9c0cb'; };
const SEQ=['#EFF3FB','#C6D9F0','#8CB3DE','#4A80C0','#16365A'];
const SOCIO_LBL={escolaridad:'Escolaridad (años)',pct_extranjeros:'% extranjeros',pct_indigena:'% pueblos orig.',
  pct_mujeres:'% mujeres',pct_60mas:'% 60+ años',pct_jov1824:'% jóvenes 18-24'};

// nivel -> {geometría, propiedad-id, etiqueta de la unidad}
const LVL={
  region:{lbl:'Región', idp:'nro_region', name:d=>d.region},
  distrito:{lbl:'Distrito', idp:'distrito_num', name:d=>'Distrito '+d.distrito_num+' · '+d.region},
  circ_senatorial:{lbl:'Circ. Senatorial', idp:'circ_sen_num', name:d=>'Circ. sen. '+d.circ_sen_num+' · '+d.region},
  comuna:{lbl:'Comuna', idp:'cut', name:d=>d.comuna},
  poligono:{lbl:'Polígono (local)', idp:'codigo_rec', name:d=>d.recinto||''}
};
const NIV_ORDER=['region','distrito','circ_senatorial','comuna','poligono'];

let CAT={}, NIV={}, GEOM={}, MENU=null, POLIRES={}, COM={}, SOCIO={}, RANGE={}, AREAS=null;
let nivel='comuna', yearSel=null, elecSel=null, modo='electoral', cutSel=null, layer=null;

Promise.all([
  fetch('data/catalogo_elecciones.json?v='+V).then(r=>r.json()),
  fetch('data/resultados_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_menu.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_resultados.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_comuna.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_socio.json?v='+V).then(r=>r.json()).catch(()=>({})),
  fetch('data/explorador_areas.geojson?v='+V).then(r=>r.json()),
  fetch('data/regiones.geojson?v='+V).then(r=>r.json()),
  fetch('data/distritos.geojson?v='+V).then(r=>r.json()),
  fetch('data/circ_senatoriales.geojson?v='+V).then(r=>r.json()),
  fetch('data/comunas.geojson?v='+V).then(r=>r.json()),
]).then(([cat,niv,menu,polires,com,socio,areas,greg,gdis,gcirc,gcom])=>{
  CAT=cat; NIV=niv; MENU=menu; POLIRES=polires; COM=com; SOCIO=socio; AREAS=areas;
  GEOM={region:greg, distrito:gdis, circ_senatorial:gcirc, comuna:gcom};
  computeRanges(); buildNiveles(); buildYears(); buildMenu();
  // selección inicial: último año, primera elección
  const years=Object.keys(CAT).sort(); yearSel=years[years.length-1];
  selectYear(yearSel); const first=CAT[yearSel][0].elecciones[0].id; setEleccion(first);
});

// ---------- rangos socio ----------
function pctl(a,p){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor((s.length-1)*p)]; }
function computeRanges(){ Object.keys(SOCIO_LBL).forEach(k=>{
  const v=Object.values(SOCIO).map(o=>o[k]).filter(x=>x!=null); RANGE[k]={lo:pctl(v,.05),hi:pctl(v,.95)}; }); }
function socioColor(v,k){ if(v==null) return '#e5e5e5'; const r=RANGE[k]; if(!r||r.hi===r.lo) return SEQ[2];
  const t=Math.max(0,Math.min(1,(v-r.lo)/(r.hi-r.lo))); return SEQ[Math.min(4,Math.floor(t*5))]; }

// ---------- barra: nivel ----------
function buildNiveles(){
  const box=document.getElementById('niveles'); box.innerHTML='';
  NIV_ORDER.forEach(k=>{
    const b=document.createElement('button'); b.textContent=LVL[k].lbl; b.dataset.k=k;
    b.className=k===nivel?'on':''; b.onclick=()=>{ nivel=k;
      document.querySelectorAll('#niveles button').forEach(x=>x.classList.toggle('on',x.dataset.k===k));
      document.getElementById('capa').disabled = (k!=='poligono');
      render(); };
    box.appendChild(b);
  });
  document.getElementById('capa').disabled = (nivel!=='poligono');
}

// ---------- barra: año -> tipo (colapsable) ----------
function buildYears(){
  const box=document.getElementById('anios'); box.innerHTML='';
  Object.keys(CAT).sort().reverse().forEach(y=>{
    const b=document.createElement('button'); b.textContent=y; b.dataset.y=y;
    b.onclick=()=>selectYear(y); box.appendChild(b);
  });
}
function selectYear(y){
  yearSel=y;
  document.querySelectorAll('#anios button').forEach(x=>x.classList.toggle('on',x.dataset.y===y));
  const box=document.getElementById('elecs'); box.innerHTML='';
  CAT[y].forEach(fam=>{
    const g=document.createElement('div'); g.className='eg';
    g.innerHTML=`<span class="eg-t">${fam.familia}</span>`;
    fam.elecciones.forEach(e=>{
      const b=document.createElement('button'); b.textContent=e.label; b.dataset.id=e.id;
      b.className=e.id===elecSel?'on':''; b.onclick=()=>setEleccion(e.id);
      g.appendChild(b);
    });
    box.appendChild(g);
  });
}
function setEleccion(id){
  elecSel=id;
  document.querySelectorAll('#elecs button').forEach(x=>x.classList.toggle('on',x.dataset.id===id));
  render();
}

// ---------- menú izquierdo (comunas) ----------
function buildMenu(){
  const m=document.getElementById('menu'); m.innerHTML='';
  MENU.regiones.forEach(reg=>{
    const wrap=document.createElement('div'); wrap.className='rn-region';
    const h=document.createElement('button'); h.className='rn-head';
    h.innerHTML=`<span class="rt"><span class="chev">▶</span>${reg.region}</span><span class="cnt">${reg.comunas.length}</span>`;
    h.onclick=()=>wrap.classList.toggle('open');
    const cl=document.createElement('div'); cl.className='rn-comunas';
    reg.comunas.forEach(c=>{
      const cb=document.createElement('button'); cb.textContent=c.comuna; cb.dataset.cut=c.cut; cb.dataset.name=c.comuna.toLowerCase();
      cb.onclick=()=>selectComuna(c.cut,c.comuna,cb);
      cl.appendChild(cb);
    });
    wrap.appendChild(h); wrap.appendChild(cl); m.appendChild(wrap);
  });
}
document.getElementById('buscar').addEventListener('input', e=>{
  const q=e.target.value.toLowerCase().trim();
  document.querySelectorAll('.rn-region').forEach(reg=>{ let any=false;
    reg.querySelectorAll('.rn-comunas button').forEach(b=>{ const hit=b.dataset.name.includes(q); b.style.display=hit?'':'none'; if(hit)any=true; });
    reg.style.display=any?'':'none'; if(q&&any) reg.classList.add('open'); else if(!q) reg.classList.remove('open'); });
});
function selectComuna(cut,nombre,btn){
  cutSel=cut;
  document.querySelectorAll('#menu button.on').forEach(b=>b.classList.remove('on')); if(btn) btn.classList.add('on');
  if(nivel==='poligono'){ render(); return; }
  // en niveles nacionales: acercar a la comuna
  const f=GEOM.comuna.features.find(x=>x.properties.cut===cut);
  if(f) map.fitBounds(L.geoJSON(f).getBounds(),{padding:[40,40],maxZoom:11});
}

// ---------- render ----------
function render(){
  if(layer){ map.removeLayer(layer); layer=null; }
  if(!elecSel) return;
  if(nivel==='poligono') return renderPoligono();
  return renderNivel();
}
function renderNivel(){
  const cfg=LVL[nivel], data=(NIV[nivel]||{})[elecSel]||{}, idp=cfg.idp;
  layer=L.geoJSON(GEOM[nivel], {
    renderer:canvas,
    style:f=>({color:'#fff',weight:.7,fillColor:colResult(data[f.properties[idp]]),fillOpacity:.8}),
    onEachFeature:(f,l)=>{ const id=f.properties[idp], r=data[id];
      l.bindPopup(`<b>${cfg.name(f.properties)}</b><br>`+detHtml(r));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:.7}));
      l.on('click',()=>resumenUnidad(cfg.name(f.properties),r)); }
  }).addTo(map);
  const n=Object.keys(data).length;
  document.getElementById('resumen').innerHTML=`<div class="r-com">${cfg.lbl}</div><div class="r-el">${elecLabel()}</div>`+
    `${n} unidades coloreadas por ganador.<div class="r-hint">Pasa el cursor o haz clic en una unidad para ver el detalle.</div>`;
  renderLegend();
}
function detHtml(r){ if(!r) return 'sin resultado';
  return `1ª mayoría: <b>${r.ganador}</b> (${r.pct??'—'}%)<br>${r.bloque?'Bloque: <b>'+r.bloque+'</b><br>':''}Participación: ${r.part??'—'}%`; }
function resumenUnidad(nombre,r){
  document.getElementById('resumen').innerHTML=`<div class="r-com">${nombre}</div><div class="r-el">${elecLabel()}</div>`+detHtml(r);
}
function renderPoligono(){
  if(!cutSel){ document.getElementById('resumen').innerHTML='Elige una comuna en el menú para ver los <b>polígonos (locales)</b>.'; renderLegend(); return; }
  const feats=AREAS.features.filter(f=>f.properties.cut===cutSel);
  if(!feats.length){ document.getElementById('resumen').innerHTML='Esta comuna no tiene polígonos de local.'; return; }
  const fillFor=cod=>{ if(modo==='electoral') return colResult((POLIRES[cod]||{})[elecSel]); return socioColor((SOCIO[cod]||{})[modo],modo); };
  layer=L.geoJSON({type:'FeatureCollection',features:feats}, {
    renderer:canvas,
    style:f=>({color:'#fff',weight:.8,fillColor:fillFor(f.properties.codigo_rec),fillOpacity:.82}),
    onEachFeature:(f,l)=>{ l.bindPopup(popupPol(f.properties));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:.8})); }
  }).addTo(map);
  map.fitBounds(layer.getBounds(),{padding:[30,30]});
  const cr=(COM[cutSel]||{})[elecSel], nombre=(feats[0].properties.comuna)||'';
  document.getElementById('resumen').innerHTML=cr
    ? `<div class="r-com">${nombre}</div><div class="r-el">${elecLabel()}</div>`+
      `Ganó en la comuna: <b>${cr.ganador}</b> (${cr.pct??'—'}%)<br>Participación: <b>${cr.part??'—'}%</b>`+
      `<div class="r-hint">${modo==='electoral'?'Cada polígono = un local; color = ganador.':'Polígonos por '+SOCIO_LBL[modo]+' (Censo 2024).'}</div>`
    : `<div class="r-com">${nombre}</div><div class="r-el">${elecLabel()}</div>Sin resultado por local para esta elección (solo presidenciales tienen mesa→local por ahora).`;
  renderLegend();
}
function popupPol(p){
  const r=(POLIRES[p.codigo_rec]||{})[elecSel], s=SOCIO[p.codigo_rec]||{};
  let h=`<b>${p.recinto||''}</b><br>`;
  h+=r?`Ganó: <b>${r.ganador}</b> (${r.pct||'—'}%) · ${r.bloque||'—'}<br>Participación: ${r.part||'—'}%`:'sin resultado';
  if(s.pob) h+=`<hr style="border:none;border-top:1px solid #eee;margin:6px 0">Pob: ${s.pob.toLocaleString('es-CL')} · Escolaridad: ${s.escolaridad||'—'} años<br>Extranjeros: ${s.pct_extranjeros||'—'}% · 60+: ${s.pct_60mas||'—'}% · Mujeres: ${s.pct_mujeres||'—'}%`;
  return h;
}
function elecLabel(){
  for(const y in CAT) for(const fam of CAT[y]) { const e=fam.elecciones.find(x=>x.id===elecSel); if(e) return e.label+' '+y; }
  return elecSel||'';
}

function renderLegend(){
  const el=document.getElementById('leg2');
  if(nivel==='poligono' && modo!=='electoral'){
    const r=RANGE[modo]||{}, fmt=v=>v==null?'—':(modo==='escolaridad'?v.toFixed(1):v.toFixed(0)+'%');
    el.innerHTML=`<span class="lg" style="width:100%;color:#333;font-weight:600">${SOCIO_LBL[modo]}</span>`+
      SEQ.map((c,i)=>`<span class="lg"><i style="background:${c}"></i>${i===0?fmt(r.lo):i===4?fmt(r.hi):''}</span>`).join('');
    return;
  }
  el.innerHTML=Object.entries(BLOQCOL).map(([b,c])=>`<span class="lg"><i style="background:${c}"></i>${b}</span>`).join('')
    +'<span class="lg"><i style="background:#3F8E86"></i>Apruebo/A favor</span><span class="lg"><i style="background:#C55A11"></i>Rechazo/En contra</span>';
}

document.getElementById('capa').addEventListener('change', e=>{ modo=e.target.value; render(); });
