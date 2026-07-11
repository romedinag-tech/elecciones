// Explorador territorial electoral — Capa 1 (resultados por polígono)
const map = L.map('map', { preferCanvas:true, minZoom:3 }).setView([-33.45,-70.66], 10);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19 }).addTo(map);
const canvas = L.canvas({padding:.5});

const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const colBloque = b => BLOQCOL_get(b);
function BLOQCOL_get(b){ return BLOQCOL[b]||'#cccccc'; }

let AREAS=null, RES={}, COM={}, MENU=null, cutSel=null, elecSel=null, capa=null;

Promise.all([
  fetch('data/explorador_menu.json?v=1').then(r=>r.json()),
  fetch('data/explorador_resultados.json?v=1').then(r=>r.json()),
  fetch('data/explorador_comuna.json?v=1').then(r=>r.json()),
  fetch('data/explorador_areas.geojson?v=1').then(r=>r.json()),
]).then(([menu,res,com,areas])=>{
  MENU=menu; RES=res; COM=com; AREAS=areas;
  buildElecs(); buildMenu();
});

// --- selector de elecciones (arriba, por tipo) ---
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
  elecSel=MENU.elecciones['Presidenciales'].slice(-1)[0].id; // por defecto la más reciente
  document.querySelectorAll('#elecs button').forEach(x=>x.classList.toggle('on',x.dataset.id===elecSel));
}

// --- menú izquierdo: regiones colapsables + comunas ---
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
// buscador
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
  const gj={type:'FeatureCollection',features:feats};
  const b=L.geoJSON(gj).getBounds(); map.fitBounds(b,{padding:[30,30]});
}

function render(){
  if(!cutSel||!elecSel) return;
  if(capa) map.removeLayer(capa);
  const feats=AREAS.features.filter(f=>f.properties.cut===cutSel);
  capa=L.geoJSON({type:'FeatureCollection',features:feats}, {
    renderer:canvas,
    style:f=>{ const r=(RES[f.properties.codigo_rec]||{})[elecSel]; return {color:'#fff',weight:.8,fillColor:colBloque(r&&r.bloque),fillOpacity:.8}; },
    onEachFeature:(f,l)=>{ const r=(RES[f.properties.codigo_rec]||{})[elecSel];
      l.bindPopup(`<b>${f.properties.recinto||''}</b><br>${r?`Ganó: <b>${r.ganador}</b> (${r.pct||'—'}%)<br>Bloque: ${r.bloque||'—'}<br>Participación: ${r.part||'—'}%`:'sin datos'}`);
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:.8}));
    }
  }).addTo(map);
  // resumen comunal
  const cr=(COM[cutSel]||{})[elecSel]; const nombre=(feats[0]&&feats[0].properties.comuna)||'';
  const lbl=(Object.values(MENU.elecciones).flat().find(x=>x.id===elecSel)||{}).label||elecSel;
  document.getElementById('resumen').innerHTML = cr
    ? `<div class="r-com">${nombre}</div><div class="r-el">${lbl}</div>`+
      `Ganó en la comuna: <b>${cr.ganador}</b> (${cr.pct||'—'}%)<br>Participación: <b>${cr.part||'—'}%</b>`+
      `<div class="r-hint">Cada polígono = un local, coloreado por el bloque del candidato más votado ahí.</div>`
    : `<b>${nombre}</b> — sin resultado comunal para ${lbl}.`;
}

// leyenda de bloques
document.getElementById('leg2').innerHTML=Object.entries(BLOQCOL).map(([b,c])=>`<span class="lg"><i style="background:${c}"></i>${b}</span>`).join('');
