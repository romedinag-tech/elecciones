// Explorador territorial electoral — workbench: nivel → unidad → módulos (Características + Territorial)
const V='11';
const LEVELS=[{k:'nacional',lbl:'Nacional'},{k:'region',lbl:'Región'},{k:'distrito',lbl:'Distrito'},
  {k:'circ_senatorial',lbl:'Circ. sen.'},{k:'metro',lbl:'Z. metro'},{k:'comuna',lbl:'Comuna'}];
const REG_ORDER=[15,1,2,3,4,5,13,6,7,16,8,9,14,10,11,12]; // N→S
const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const OPCION_COL={'APRUEBO':'#3F8E86','A FAVOR':'#3F8E86','RECHAZO':'#C55A11','EN CONTRA':'#C55A11'};
const colResult=r=>{ if(!r) return '#e5e5e5'; if(r.bloque) return BLOQCOL[r.bloque]||'#b9c0cb';
  const o=(r.ganador||'').toUpperCase(); return OPCION_COL[o]||'#b9c0cb'; };

let CAT={}, NIVRES={}, KPI={}, MENU=null, POLIRES={}, SOCIO={}, AREAS=null, GEOCOM=null, CUTMAP={};
let level='nacional', unitId=null, elecSel=null, tab='C', map=null, layer=null, canvas=null;

Promise.all([
  fetch('data/catalogo_elecciones.json?v='+V).then(r=>r.json()),
  fetch('data/resultados_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/kpis_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_resultados.json?v='+V).then(r=>r.json()),
  fetch('data/explorador_socio.json?v='+V).then(r=>r.json()).catch(()=>({})),
  fetch('data/explorador_areas.geojson?v='+V).then(r=>r.json()),
  fetch('data/comunas.geojson?v='+V).then(r=>r.json()),
]).then(([cat,niv,kpi,pol,socio,areas,gcom])=>{
  CAT=cat; NIVRES=niv; KPI=kpi; POLIRES=pol; SOCIO=socio; AREAS=areas; GEOCOM=gcom;
  Object.entries(KPI.comuna).forEach(([cut,o])=>CUTMAP[cut]={reg:o.reg,dist:o.dist,circ:o.circ,metro:o.metro,nombre:o.nombre});
  elecSel=defaultElec();
  buildLevels(); buildYears(); updateElecLbl(); buildMenu();
  selectUnit('CL'); // aterriza en Chile
});

function defaultElec(){
  const ys=Object.keys(CAT).sort();
  for(let i=ys.length-1;i>=0;i--){ for(const f of CAT[ys[i]]) for(const e of f.elecciones)
    if(e.id.includes('presidencial_1v')) return e.id; }
  const last=CAT[ys[ys.length-1]][0].elecciones; return last[last.length-1].id;
}
function elecInfo(id){ for(const y in CAT) for(const f of CAT[y]){ const e=f.elecciones.find(x=>x.id===id); if(e) return {label:e.label,year:y,familia:f.familia}; } return {label:id,year:''}; }
function updateElecLbl(){ const i=elecInfo(elecSel); document.getElementById('elecSelLbl').textContent=i.label+' · '+i.year; }

// ---------- selector de NIVEL ----------
function buildLevels(){
  const box=document.getElementById('levels'); box.innerHTML='';
  LEVELS.forEach(L=>{ const b=document.createElement('button'); b.textContent=L.lbl; b.dataset.k=L.k;
    b.className=L.k===level?'on':''; b.onclick=()=>setLevel(L.k); box.appendChild(b); });
}
function setLevel(k){
  level=k; unitId=null;
  document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
  document.getElementById('buscar').value='';
  buildMenu();
  if(k==='nacional'){ selectUnit('CL'); }
  else { showPlaceholder(`Elige una unidad de nivel <b>${LEVELS.find(x=>x.k===k).lbl.toLowerCase()}</b> en el menú.`); }
}

// ---------- menú superior: año → elecciones (acordeón hacia abajo) ----------
function buildYears(){
  const box=document.getElementById('anios'); box.innerHTML='';
  Object.keys(CAT).sort().reverse().forEach(y=>{ const b=document.createElement('button'); b.textContent=y; b.dataset.y=y;
    b.onclick=()=>toggleYear(y,b); box.appendChild(b); });
}
function toggleYear(y,btn){
  const p=document.getElementById('elecpanel');
  if(p.dataset.open===y){ p.style.display='none'; p.dataset.open=''; document.querySelectorAll('#anios button').forEach(b=>b.classList.remove('open')); return; }
  document.querySelectorAll('#anios button').forEach(b=>b.classList.toggle('open',b.dataset.y===y));
  p.dataset.open=y; p.innerHTML='';
  CAT[y].forEach(fam=>{ const g=document.createElement('div'); g.className='ep-fam';
    g.innerHTML=`<span class="ep-t">${fam.familia}</span>`;
    fam.elecciones.forEach(e=>{ const b=document.createElement('button'); b.textContent=e.label; b.dataset.id=e.id;
      b.className=e.id===elecSel?'on':''; b.onclick=()=>{ elecSel=e.id; updateElecLbl(); p.style.display='none'; p.dataset.open='';
        document.querySelectorAll('#anios button').forEach(x=>x.classList.remove('open'));
        if(unitId&&tab==='T') renderT(); }; g.appendChild(b); });
    p.appendChild(g); });
  const r=btn.getBoundingClientRect(); p.style.left=Math.max(8,r.left-4)+'px'; p.style.display='block';
}
document.addEventListener('click',e=>{ const p=document.getElementById('elecpanel');
  if(p.style.display==='block' && !p.contains(e.target) && !e.target.closest('#anios')){ p.style.display='none'; p.dataset.open='';
    document.querySelectorAll('#anios button').forEach(b=>b.classList.remove('open')); } });

// ---------- menú izquierdo: unidades del nivel, ordenadas geográficamente ----------
function buildMenu(){
  const m=document.getElementById('menu'); m.innerHTML=''; const units=KPI[level]||{};
  if(level==='nacional'){ const b=uBtn('CL','Chile'); m.appendChild(b); return; }
  if(level==='region'){
    Object.entries(units).sort((a,b)=>REG_ORDER.indexOf(a[1].reg)-REG_ORDER.indexOf(b[1].reg))
      .forEach(([id,o])=>m.appendChild(uBtn(id,cap(o.nombre)))); return;
  }
  // distrito/circ/metro/comuna: agrupados por región (N→S)
  const byReg={}; Object.entries(units).forEach(([id,o])=>{ (byReg[o.reg]=byReg[o.reg]||[]).push([id,o]); });
  REG_ORDER.filter(r=>byReg[r]).forEach(r=>{
    const list=byReg[r].sort((a,b)=> level==='comuna'? a[1].nombre.localeCompare(b[1].nombre) : (+a[0])-(+b[0]));
    const wrap=document.createElement('div'); wrap.className='rn-region';
    const h=document.createElement('button'); h.className='rn-head';
    h.innerHTML=`<span class="rt"><span class="chev">▶</span>${cap(list[0][1].reg_nom||('Región '+r))}</span><span class="cnt">${list.length}</span>`;
    h.onclick=()=>wrap.classList.toggle('open');
    const cl=document.createElement('div'); cl.className='rn-comunas';
    list.forEach(([id,o])=>{ const cb=uBtn(id,cap(o.nombre)); cb.classList.add('rn-item'); cl.appendChild(cb); });
    wrap.appendChild(h); wrap.appendChild(cl); m.appendChild(wrap);
  });
}
function uBtn(id,nombre){ const b=document.createElement('button'); b.className='u-btn'; b.textContent=nombre;
  b.dataset.id=id; b.dataset.name=nombre.toLowerCase(); b.onclick=()=>selectUnit(id,b); return b; }
function cap(s){ return (s||'').toLowerCase().split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ')
  .replace(/\bDe\b/g,'de').replace(/\bDel\b/g,'del').replace(/\bLa\b/g,'la').replace(/\bY\b/g,'y'); }

document.getElementById('buscar').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase().trim();
  if(document.querySelector('.rn-region')){
    document.querySelectorAll('.rn-region').forEach(reg=>{ let any=false;
      reg.querySelectorAll('.u-btn').forEach(b=>{ const hit=b.dataset.name.includes(q); b.style.display=hit?'':'none'; if(hit)any=true; });
      reg.style.display=any?'':'none'; if(q&&any) reg.classList.add('open'); else if(!q) reg.classList.remove('open'); });
  } else { document.querySelectorAll('.u-btn').forEach(b=>b.style.display=b.dataset.name.includes(q)?'':'none'); }
});

// ---------- selección de unidad → módulos ----------
function selectUnit(id,btn){
  unitId=id;
  document.querySelectorAll('#menu button.on').forEach(b=>b.classList.remove('on'));
  const b=btn||document.querySelector(`#menu .u-btn[data-id="${id}"]`); if(b){ b.classList.add('on');
    const reg=b.closest('.rn-region'); if(reg) reg.classList.add('open'); }
  document.getElementById('placeholder').style.display='none';
  document.getElementById('tabs').style.display='flex';
  renderTabs(); showTab(tab);
}
function showPlaceholder(html){
  unitId=null; document.getElementById('tabs').style.display='none';
  ['panelC','panelT'].forEach(p=>document.getElementById(p).classList.remove('show'));
  const ph=document.getElementById('placeholder'); ph.style.display='flex';
  ph.querySelector('.ph-card p').innerHTML=html;
}

const MODS=[{k:'C',lbl:'Características principales'},{k:'T',lbl:'Análisis territorial'},
  {k:'D',lbl:'Tendencial',soon:1},{k:'R',lbl:'Drivers',soon:1},{k:'P',lbl:'Predictivo',soon:1}];
function renderTabs(){
  const t=document.getElementById('tabs'); t.innerHTML='';
  MODS.forEach(M=>{ const b=document.createElement('button'); b.textContent=M.lbl+(M.soon?' ·':'');
    b.className='tabbtn'+(M.k===tab?' on':'')+(M.soon?' soon':''); if(M.soon){ b.title='Próximamente'; b.disabled=true; }
    b.onclick=()=>showTab(M.k); t.appendChild(b); });
}
function showTab(t){
  tab=t; document.querySelectorAll('#tabs .tabbtn').forEach(b=>b.classList.toggle('on', b.textContent.startsWith(MODS.find(m=>m.k===t).lbl)));
  document.getElementById('panelC').classList.toggle('show', t==='C');
  document.getElementById('panelT').classList.toggle('show', t==='T');
  if(t==='C') renderC(); else if(t==='T'){ ensureMap(); setTimeout(()=>{ map.invalidateSize(); renderT(); },30); }
}

// ---------- MÓDULO Características ----------
function fmtN(v){ return v==null?'—':Math.round(v).toLocaleString('es-CL'); }
function fmtP(v,d){ return v==null?'—':v.toFixed(d??1)+'%'; }
function fmtD(v,d){ return v==null?'—':v.toFixed(d??1); }
function card(v,lbl,sub){ return `<div class="kc"><div class="kv">${v}</div><div class="kl">${lbl}</div>${sub?`<div class="ks">${sub}</div>`:''}</div>`; }
function bars(items){ return `<div class="kbars">`+items.map(([lbl,pct,col])=>
  `<div class="kbar"><span class="kbl">${lbl}</span><span class="kbt"><i style="width:${Math.max(2,pct||0)}%;background:${col||'var(--accent)'}"></i></span><span class="kbp">${fmtP(pct,0)}</span></div>`).join('')+`</div>`; }

function renderC(){
  const o=(KPI[level]||{})[unitId]; const p=document.getElementById('panelC');
  if(!o){ p.innerHTML='<div class="mod-pad">Sin datos para esta unidad.</div>'; return; }
  const lvlLbl=LEVELS.find(x=>x.k===level).lbl;
  const eje=o.eje; const ejePos=eje==null?null:(eje/10*100);
  let h=`<div class="mod-pad">`;
  h+=`<div class="c-head"><div><div class="c-name">${cap(o.nombre)}</div>
    <div class="c-meta">${lvlLbl}${o.reg_nom&&level!=='nacional'&&level!=='region'?' · '+cap(o.reg_nom):''}</div></div>
    ${o.bloque_ganador?`<span class="c-chip" style="background:${BLOQCOL[o.bloque_ganador]||'#999'}">${o.bloque_ganador}</span>`:''}</div>`;

  h+=`<div class="kblock"><div class="kbt-h">Padrón y participación <span>· ${elecInfo(elecSel).label} ${elecInfo(elecSel).year}</span></div><div class="kgrid">`;
  h+=card(fmtN(o.inscritos),'Electores inscritos');
  h+=card(fmtP(o.participacion),'Participación');
  h+=card(fmtN(o.votantes),'Votantes');
  h+=`</div></div>`;

  h+=`<div class="kblock"><div class="kbt-h">Composición del electorado</div><div class="kgrid">`;
  h+=card(fmtP(o.pct_muj),'Mujeres', 'del electorado');
  h+=card(fmtP(o.pct_ext),'Extranjeros', 'electores no chilenos');
  h+=`</div>`;
  h+=`<div class="ksub">Distribución etaria</div>`+bars([['18–29',o.pct_a1829,'#4A80C0'],['30–44',o.pct_a3044,'#6f9fd0'],
      ['45–59',o.pct_a4559,'#9aa0a6'],['60+',o.pct_a60,'#C55A11']]);
  h+=`</div>`;

  h+=`<div class="kblock"><div class="kbt-h">Demografía y territorio <span>· Censo 2024</span></div><div class="kgrid">`;
  h+=card(fmtN(o.pob_2024),'Población', o.var_pct!=null?`${o.var_pct>0?'+':''}${fmtD(o.var_pct)}% vs 2017`:'');
  h+=card(fmtD(o.dens_hab_ha),'Densidad', 'hab/ha');
  h+=card(fmtP(o.pct_60mas),'60 años y más','población');
  h+=card(fmtP(o.pct_inmig),'Inmigrantes','población');
  h+=`</div></div>`;

  h+=`<div class="kblock"><div class="kbt-h">Socioeconómico <span>· CASEN / INE</span></div><div class="kgrid">`;
  h+=card(o.casen_ing_pc?('$'+fmtN(o.casen_ing_pc)):'—','Ingreso per cápita','hogar, CASEN');
  h+=card(fmtP(o.casen_pobreza_pct),'Pobreza','por ingresos');
  h+=card(fmtD(o.escol),'Escolaridad','años promedio');
  h+=card(fmtP(o.pct_terciaria),'Educación superior','completa');
  h+=card(o.nse_label||'—','Nivel socioeconómico','grupo modal');
  h+=card(fmtP(o.pct_activa),'Ocupación','pob. económ. activa');
  h+=`</div></div>`;

  h+=`<div class="kblock"><div class="kbt-h">Color político <span>· ${elecInfo(elecSel).year}</span></div>`;
  h+=`<div class="eje-wrap"><div class="eje-track"><div class="eje-mark" style="left:${ejePos==null?50:ejePos}%"></div></div>
    <div class="eje-lbl"><span>Izquierda</span><span class="eje-v">${eje==null?'—':'Eje '+fmtD(eje)+' / 10'}</span><span>Derecha</span></div></div>`;
  if(level==='comuna' && o.alcalde_partido)
    h+=`<div class="alc">Alcalde/sa vigente: <b>${cap(o.alcalde||'')||''}</b> ${o.alcalde_partido} · <span style="color:${BLOQCOL[o.alcalde_bloque]||'#999'}">${o.alcalde_bloque||''}</span></div>`;
  h+=`</div>`;

  h+=`<div class="c-foot">Nivel <b>${lvlLbl}</b> · agregado de ${fmtN(o.pob_2024)} habitantes. Composición del electorado a partir de quienes votaron en la elección de referencia; socioeconómico Censo 2024 + CASEN.</div>`;
  h+=`</div>`;
  p.innerHTML=h;
}

// ---------- MÓDULO Territorial ----------
function ensureMap(){ if(map) return;
  map=L.map('map',{preferCanvas:true,minZoom:3}).setView([-35.5,-71.3],5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {attribution:'&copy; OpenStreetMap &copy; CARTO',subdomains:'abcd',maxZoom:19}).addTo(map);
  canvas=L.canvas({padding:.5});
}
function subFeatures(){
  if(level==='comuna'){ return {geo:'pol', feats:AREAS.features.filter(f=>f.properties.cut==unitId)}; }
  const test = level==='nacional' ? ()=>true
    : level==='region' ? c=>CUTMAP[c] && CUTMAP[c].reg==unitId
    : level==='distrito' ? c=>CUTMAP[c] && CUTMAP[c].dist==unitId
    : level==='circ_senatorial' ? c=>CUTMAP[c] && CUTMAP[c].circ==unitId
    : level==='metro' ? c=>CUTMAP[c] && CUTMAP[c].metro==KPI.metro[unitId].nombre
    : ()=>false;
  return {geo:'com', feats:GEOCOM.features.filter(f=>test(String(f.properties.cut)))};
}
function renderT(){
  if(layer){ map.removeLayer(layer); layer=null; }
  const {geo,feats}=subFeatures();
  if(!feats.length){ document.getElementById('resumen').innerHTML='Sin sub-unidades para mapear.'; return; }
  const resCom=(NIVRES.comuna||{})[elecSel]||{};
  const fillCom=cut=>colResult(resCom[cut]);
  const fillPol=cod=>colResult((POLIRES[cod]||{})[elecSel]);
  layer=L.geoJSON({type:'FeatureCollection',features:feats},{
    renderer:canvas,
    style:f=>({color:'#fff',weight:geo==='pol'?.8:.6,
      fillColor: geo==='pol'?fillPol(f.properties.codigo_rec):fillCom(f.properties.cut), fillOpacity:.8}),
    onEachFeature:(f,l)=>{ const pr=f.properties;
      if(geo==='pol'){ const r=(POLIRES[pr.codigo_rec]||{})[elecSel];
        l.bindPopup(`<b>${pr.recinto||''}</b><br>`+(r?`1ª mayoría: <b>${r.ganador}</b> (${r.pct||'—'}%)`:'sin resultado')); }
      else { const r=resCom[pr.cut];
        l.bindPopup(`<b>${cap(pr.comuna||'')}</b><br>`+(r?`1ª mayoría: <b>${r.ganador}</b> (${r.pct??'—'}%)${r.bloque?'<br>'+r.bloque:''}`:'sin resultado')); }
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:geo==='pol'?.8:.6})); }
  }).addTo(map);
  try{ map.fitBounds(layer.getBounds(),{padding:[24,24],maxZoom: level==='comuna'?14:11}); }catch(e){}
  const o=(KPI[level]||{})[unitId]||{}; const sub= geo==='pol'?'locales de votación':'comunas';
  document.getElementById('resumen').innerHTML=`<div class="r-com">${cap(o.nombre||'')}</div>`+
    `<div class="r-el">${elecInfo(elecSel).label} ${elecInfo(elecSel).year}</div>`+
    `${feats.length} ${sub} · color = bloque de la 1ª mayoría.`+
    (geo==='pol'&&!Object.keys(POLIRES).length?'':'')+
    `<div class="r-hint">${geo==='pol'?'Solo presidenciales tienen resultado por local; otras elecciones quedan en gris.':'Haz clic en una comuna para ver su detalle.'}</div>`;
  renderLeg();
}
function renderLeg(){
  document.getElementById('leg2').innerHTML=Object.entries(BLOQCOL).map(([b,c])=>`<span class="lg"><i style="background:${c}"></i>${b}</span>`).join('')
    +'<span class="lg"><i style="background:#3F8E86"></i>Apruebo</span><span class="lg"><i style="background:#C55A11"></i>Rechazo</span>';
}
