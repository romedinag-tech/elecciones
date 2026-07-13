// Explorador territorial electoral — workbench: nivel → unidad → módulos. Elección elegida DENTRO de cada módulo.
const V='61';
// ---- tema claro/oscuro ----
try{ if(localStorage.getItem('elec_theme')==='dark') document.documentElement.setAttribute('data-theme','dark'); }catch(e){}
function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }
const MAP_LIGHT='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const MAP_DARK='https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
let mapBaseLayer=null;
function setTheme(dark){
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  try{ localStorage.setItem('elec_theme',dark?'dark':'light'); }catch(e){}
  SEQ = dark?SEQ_DARK.slice():SEQ_LIGHT.slice();
  if(mapBaseLayer) mapBaseLayer.setUrl(dark?MAP_DARK:MAP_LIGHT);
  const b=document.getElementById('themeBtn'); if(b) b.textContent=dark?'☀':'☾';
  try{ if(map&&tab==='T'&&unitId&&typeof renderT==='function') renderT(); }catch(e){}
}
document.addEventListener('DOMContentLoaded',()=>{ const b=document.getElementById('themeBtn');
  if(b){ b.textContent=isDark()?'☀':'☾'; b.onclick=()=>setTheme(!isDark()); } });
const LEVELS=[{k:'nacional',lbl:'Nacional'},{k:'region',lbl:'Región'},{k:'distrito',lbl:'Distrito'},
  {k:'circ_senatorial',lbl:'Circ. sen.'},{k:'metro',lbl:'Área metro'},{k:'comuna',lbl:'Comuna'}];
const REG_ORDER=[15,1,2,3,4,5,13,6,7,16,8,9,14,10,11,12];
// Escala por sector político (convención chilena: izquierda=rojos, derecha=azules) — paleta de Rodrigo mapeada a bloques
const BLOQCOL={'Izquierda':'#C62828',        // rojo carmesí (PC)
  'Centro-izquierda':'#F48FB1',              // rosado (PS/PPD, Socialismo Democrático)
  'Centro':'#AB47BC',                        // morado (DC/Demócratas/Amarillos)
  'Populista/Otro':'#FFB300',                // ámbar (PDG/populismos — rompe la escala)
  'Centro-derecha':'#29B6F6',                // celeste (Evópoli)
  'Derecha':'#1565C0',                       // azul rey (RN)
  'Derecha radical':'#4A148C'};              // índigo/purpúreo (Republicano/PSC)
const OPCION_COL={'APRUEBO':'#3F8E86','A FAVOR':'#3F8E86','RECHAZO':'#C55A11','EN CONTRA':'#C55A11'};
const SEQ_LIGHT=['#EFF3FB','#C6D9F0','#8CB3DE','#4A80C0','#16365A'];
const SEQ_DARK=['#3a2a1c','#7a3f12','#b7600f','#e8781a','#ff9d2f'];  // rampa naranja en modo oscuro (indicadores numéricos)
let SEQ = isDark()?SEQ_DARK.slice():SEQ_LIGHT.slice();
const REF_LBL='Presidencial 1ª v. 2025';

let CAT={}, KPI={}, GEOCOM=null, GEOCOMP=null, AREAS=null, TIDX={}, CUTMAP={}, REPR={};
let CONFIDX={}; const CONF={};  // confiabilidad geográfica: índice (elecciones disponibles) + cache por elección
let CROSSIDX={}; const CROSSB={};  // cruce bayesiano (EI espacial): índice + cache posterior por elección
// rampa de confiabilidad 0-100: rojo(distorsión)→ámbar→verde(fiable). Distinta de la paleta política.
const CONFRAMP=['#c0392b','#e67e22','#f1c40f','#7fb800','#2e7d32'];
function confCol(v){ if(v==null) return '#e5e5e5'; const t=Math.max(0,Math.min(1,v/100)); return CONFRAMP[Math.min(4,Math.floor(t*5))]; }
function ensureConf(e){ if(CONF[e]!==undefined) return Promise.resolve();
  return fetch('data/confiabilidad/'+e+'.json?v='+V).then(r=>r.ok?r.json():null).then(d=>{CONF[e]=d;}).catch(()=>{CONF[e]=null;}); }
function confRec(f){ const C=CONF[elecSel]; if(!C) return null; const g=effGran();
  if(g==='comuna'){ return C.comuna[String(f.properties.cut)]||null; }
  if(g==='distrito'||g==='region'){ const key=g==='distrito'?'dist':'reg', id=g==='distrito'?f.properties.distrito_num:f.properties.nro_region;
    let sw=0,sc=0; for(const cut in C.comuna){ const cm=CUTMAP[cut]; if(!cm||cm[key]!=id) continue; const o=C.comuna[cut]; sw++; sc+=o.conf; } return sw?{conf:Math.round(10*sc/sw)/10,agg:sw}:null; }
  const rec=f.properties.codigo_rec; return rec!=null?(C.local[String(rec)]||null):null; }  // polígono/manzana: por codigo_rec (manzana hereda del local)
function confVal(f){ const o=confRec(f); return o?o.conf:null; }
let level='nacional', unitId=null, tab='C', elecSel=null, colorby='winner', granul='poligono', chartType='coropleta';
let mapFitKey=null; const GEOMS={}; let climitsLayer=null;
let TERR=null; const TERRCACHE={};
let map=null, layer=null, canvas=null, seqRange=null;

Promise.all([
  fetch('data/catalogo_elecciones.json?v='+V).then(r=>r.json()),
  fetch('data/kpis_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/comunas.geojson?v='+V).then(r=>r.json()),
  fetch('data/areas_pobladas.geojson?v='+V).then(r=>r.json()),  // footprint poblado (recortado a manzanas): no pinta ríos/cerros
  fetch('data/comunas_pobladas.geojson?v='+V).then(r=>r.json()).catch(()=>null),  // footprint comunal para el render
  fetch('data/territorial_index.json?v='+V).then(r=>r.json()),
  fetch('data/representantes.json?v='+V).then(r=>r.json()).catch(()=>({})),
  fetch('data/confiabilidad_index.json?v='+V).then(r=>r.json()).catch(()=>({})),
  fetch('data/cross_index.json?v='+V).then(r=>r.json()).catch(()=>({})),
]).then(([cat,kpi,gcom,areas,gcomp,tidx,repr,confidx,crossidx])=>{
  CAT=cat; KPI=kpi; GEOCOM=gcom; AREAS=areas; GEOCOMP=gcomp||gcom; TIDX=tidx; REPR=repr; CONFIDX=confidx||{}; CROSSIDX=crossidx||{};
  Object.entries(KPI.comuna).forEach(([cut,o])=>CUTMAP[cut]={reg:o.reg,dist:o.dist,circ:o.circ,metro:o.metro,nombre:o.nombre});
  elecSel=defaultElec();
  buildLevels(); buildMenu(); selectUnit('CL');
});

function defaultElec(){ const ys=Object.keys(CAT).sort();
  for(let i=ys.length-1;i>=0;i--) for(const f of CAT[ys[i]]) for(const e of f.elecciones)
    if(e.id.includes('presidencial_1v')) return e.id;
  const l=CAT[ys[ys.length-1]][0].elecciones; return l[l.length-1].id; }
function elecInfo(id){ for(const y in CAT) for(const f of CAT[y]){ const e=f.elecciones.find(x=>x.id===id); if(e) return {label:e.label,year:y}; } return {label:id,year:''}; }
function cap(s){ return (s||'').toLowerCase().split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ')
  .replace(/\bDe\b/g,'de').replace(/\bDel\b/g,'del').replace(/\bLa\b/g,'la').replace(/\bY\b/g,'y'); }

// ---------- selector de NIVEL ----------
function buildLevels(){ const box=document.getElementById('levels'); box.innerHTML='';
  LEVELS.forEach(L=>{ const b=document.createElement('button'); b.textContent=L.lbl; b.dataset.k=L.k;
    b.className=L.k===level?'on':''; b.onclick=()=>setLevel(L.k); box.appendChild(b); }); }
function setLevel(k){ level=k; unitId=null;
  document.querySelectorAll('#levels button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
  document.getElementById('buscar').value=''; buildMenu();
  if(k==='nacional') selectUnit('CL');
  else showPlaceholder(`Elige una unidad de nivel <b>${LEVELS.find(x=>x.k===k).lbl.toLowerCase()}</b> en el menú.`); }

// ---------- menú izquierdo ----------
function buildMenu(){ const m=document.getElementById('menu'); m.innerHTML=''; const units=KPI[level]||{};
  if(level==='nacional'){ m.appendChild(uBtn('CL','Chile')); return; }
  if(level==='region'){ Object.entries(units).sort((a,b)=>REG_ORDER.indexOf(a[1].reg)-REG_ORDER.indexOf(b[1].reg))
      .forEach(([id,o])=>m.appendChild(uBtn(id,cap(o.nombre)))); return; }
  const byReg={}; Object.entries(units).forEach(([id,o])=>{ (byReg[o.reg]=byReg[o.reg]||[]).push([id,o]); });
  REG_ORDER.filter(r=>byReg[r]).forEach(r=>{
    const list=byReg[r].sort((a,b)=> level==='comuna'? a[1].nombre.localeCompare(b[1].nombre) : (+a[0])-(+b[0]));
    const wrap=document.createElement('div'); wrap.className='rn-region';
    const h=document.createElement('button'); h.className='rn-head';
    h.innerHTML=`<span class="rt"><span class="chev">▶</span>${cap(list[0][1].reg_nom||('Región '+r))}</span><span class="cnt">${list.length}</span>`;
    h.onclick=()=>wrap.classList.toggle('open');
    const cl=document.createElement('div'); cl.className='rn-comunas';
    list.forEach(([id,o])=>cl.appendChild(uBtn(id,cap(o.nombre))));
    wrap.appendChild(h); wrap.appendChild(cl); m.appendChild(wrap); }); }
function uBtn(id,nombre){ const b=document.createElement('button'); b.className='u-btn'; b.textContent=nombre;
  b.dataset.id=id; b.dataset.name=nombre.toLowerCase(); b.onclick=()=>selectUnit(id,b); return b; }
document.getElementById('buscar').addEventListener('input',e=>{ const q=e.target.value.toLowerCase().trim();
  if(document.querySelector('.rn-region')){ document.querySelectorAll('.rn-region').forEach(reg=>{ let any=false;
      reg.querySelectorAll('.u-btn').forEach(b=>{ const hit=b.dataset.name.includes(q); b.style.display=hit?'':'none'; if(hit)any=true; });
      reg.style.display=any?'':'none'; if(q&&any) reg.classList.add('open'); else if(!q) reg.classList.remove('open'); }); }
  else document.querySelectorAll('.u-btn').forEach(b=>b.style.display=b.dataset.name.includes(q)?'':'none'); });

// ---------- unidad → módulos ----------
function selectUnit(id,btn){ unitId=id;
  document.querySelectorAll('#menu button.on').forEach(b=>b.classList.remove('on'));
  const b=btn||document.querySelector(`#menu .u-btn[data-id="${id}"]`); if(b){ b.classList.add('on'); const reg=b.closest('.rn-region'); if(reg) reg.classList.add('open'); }
  document.getElementById('placeholder').style.display='none';
  document.getElementById('tabs').style.display='flex'; renderTabs(); showTab(tab); }
function showPlaceholder(html){ unitId=null; document.getElementById('tabs').style.display='none';
  ['panelC','panelD','panelR','panelT'].forEach(p=>document.getElementById(p).classList.remove('show'));
  const ph=document.getElementById('placeholder'); ph.style.display='flex'; ph.querySelector('.ph-card p').innerHTML=html; }

const MODS=[{k:'C',lbl:'Características principales'},{k:'T',lbl:'Análisis territorial'},
  {k:'D',lbl:'Análisis tendencial'},{k:'R',lbl:'Drivers'},{k:'P',lbl:'Predictivo',soon:1}];
function renderTabs(){ const t=document.getElementById('tabs'); t.innerHTML='';
  MODS.forEach(M=>{ const b=document.createElement('button'); b.textContent=M.lbl+(M.soon?' ·':'');
    b.className='tabbtn'+(M.k===tab?' on':'')+(M.soon?' soon':''); if(M.soon){ b.title='Próximamente'; b.disabled=true; }
    b.onclick=()=>showTab(M.k); t.appendChild(b); }); }
function showTab(t){ tab=t;
  document.querySelectorAll('#tabs .tabbtn').forEach(b=>b.classList.toggle('on', b.textContent.startsWith(MODS.find(m=>m.k===t).lbl)));
  document.getElementById('panelC').classList.toggle('show', t==='C');
  document.getElementById('panelT').classList.toggle('show', t==='T');
  document.getElementById('panelD').classList.toggle('show', t==='D');
  document.getElementById('panelR').classList.toggle('show', t==='R');
  if(t==='C') renderC();
  else if(t==='T'){ ensureMap(); document.getElementById('elecBtn').textContent=elecInfo(elecSel).label+' · '+elecInfo(elecSel).year;
    loadTerr(elecSel).then(()=>{ buildCandsel(); buildGranul(); buildIndics(); setTimeout(()=>{ map.invalidateSize(); renderT(); },30); }); }
  else if(t==='D') renderD();
  else if(t==='R') renderR(); }

// =================== MÓDULO Características ===================
function fmtN(v){ return v==null?'—':Math.round(v).toLocaleString('es-CL'); }
function fmtP(v,d){ return v==null?'—':v.toFixed(d??1)+'%'; }
function fmtD(v,d){ return v==null?'—':v.toFixed(d??1); }
function card(v,lbl,sub){ return `<div class="kc"><div class="kv">${v}</div><div class="kl">${lbl}</div>${sub?`<div class="ks">${sub}</div>`:''}</div>`; }
function bars(items){ return `<div class="kbars">`+items.map(([lbl,pct,col])=>
  `<div class="kbar"><span class="kbl">${lbl}</span><span class="kbt"><i style="width:${Math.max(2,pct||0)}%;background:${col||'var(--accent)'}"></i></span><span class="kbp">${fmtP(pct,0)}</span></div>`).join('')+`</div>`; }
function renderC(){ ensureTend().then(renderCbody); }
function partSpark(pts){ if(pts.length<1) return ''; const W=520,H=92,mL=32,mR=12,mT=10,mB=20,iw=W-mL-mR,ih=H-mT-mB;
  const vals=pts.map(p=>p.part).filter(v=>v!=null); if(!vals.length) return '<div class="ks">Sin datos.</div>';
  const lo=Math.max(0,Math.min(...vals)-8), hi=Math.min(100,Math.max(...vals)+8);
  const n=pts.length, X=i=>mL+(n<=1?iw/2:iw*i/(n-1)), Y=v=>mT+ih*(1-(v-lo)/((hi-lo)||1));
  let s=`<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="xMidYMid meet">`;
  let path=''; pts.forEach((p,i)=>{ if(p.part==null) return; path+=(path?'L':'M')+X(i)+' '+Y(p.part).toFixed(1); });
  s+=`<path d="${path}" fill="none" stroke="#16365a" stroke-width="2.2"/>`;
  pts.forEach((p,i)=>{ if(p.part==null) return; s+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(p.part).toFixed(1)}" r="3.6" fill="#16365a"><title>${p.lbl}: ${p.part}%</title></circle>`+
    `<text x="${X(i).toFixed(1)}" y="${Y(p.part)-7}" text-anchor="middle" class="td-val">${Math.round(p.part)}%</text>`+
    `<text x="${X(i).toFixed(1)}" y="${H-6}" text-anchor="middle" class="td-ax">${p.lbl.replace(/^.* /,'')} ${p.y}</text>`; });
  return s+'</svg>'; }
function partClean(lbl){ return lbl; }
function autoridad(o){ const r=(REPR[level]||{})[unitId];
  const block=(role,name,meta)=>`<div class="auth"><div class="auth-role">${role}</div><div class="auth-name">${cap(name)}</div><div class="auth-meta">${meta}</div></div>`;
  const listB=(role,items)=>`<div class="auth-role">${role}</div><div class="auth-list">`+items.map(x=>`<div class="auth-li">${x}</div>`).join('')+`</div>`;
  const per=n=>n===2?'2° período':'1er período';
  if(level==='comuna'){ if(!o.alcalde_partido) return '';
    return `<div class="kblock"><div class="kbt-h">Autoridad comunal</div>`+
      block('Alcalde/sa', o.alcalde||'', `${cap(o.alcalde_partido)}${o.alcalde_pct!=null?' · '+o.alcalde_pct+'% válidos':''}${o.alcalde_periodo?' · '+per(o.alcalde_periodo):''}`)+`</div>`; }
  if(!r) return '';
  const pty=p=>p&&p.trim()&&p!=='INDEPENDIENTES'?cap(p):(p==='INDEPENDIENTES'?'Independiente':'');
  const j=(...xs)=>xs.filter(x=>x&&(''+x).trim()).join(' · ');
  let inner='';
  if(r.tipo==='presidente') inner=block('Presidente de la República', r.nombre, j(pty(r.partido), `${r.pct_1v}% 1ª v.`, `${r.pct_2v}% 2ª v.`));
  else if(r.tipo==='gobernador') inner=block('Gobernador/a regional'+(level==='metro'?' (de la región)':''), r.nombre, j(pty(r.partido), r.pct!=null?r.pct+'%':'', per(r.periodo)));
  else if(r.tipo==='diputados') inner=listB(`Diputados electos (${r.lista.length})`, r.lista.map(d=>`${cap(d.nombre)} <span class="auth-pty">${cap(d.partido)}${d.pct!=null?' · '+d.pct+'%':''}</span>`));
  else if(r.tipo==='senadores') inner=listB(`Senadores en ejercicio (${r.lista.length})`, r.lista.map(x=>`${cap(x.nombre)} <span class="auth-pty">${cap(x.partido)} · ${x.anio}</span>`));
  return inner? `<div class="kblock"><div class="kbt-h">Autoridad electa</div>${inner}</div>`:''; }
function renderCbody(){ const o=(KPI[level]||{})[unitId]; const p=document.getElementById('panelC');
  if(!o){ p.innerHTML='<div class="mod-pad">Sin datos para esta unidad.</div>'; return; }
  const lvlLbl=LEVELS.find(x=>x.k===level).lbl;
  // serie de participación era obligatoria (≥ sept 2022)
  const ser=(TENDCACHE[level]||{})[unitId]||{};
  const oblig=Object.keys(ser).filter(e=>e>='2022-09'&&!e.includes('ppii')&&!e.includes('primarias')).sort()
    .map(e=>({e,y:ser[e].y,lbl:elecInfo(e).label,part:ser[e].part})).filter(x=>x.part!=null);
  let h=`<div class="mod-pad"><div class="c-head"><div><div class="c-name">${cap(o.nombre)}</div>
    <div class="c-meta">${lvlLbl}${o.reg_nom&&level!=='nacional'&&level!=='region'?' · '+cap(o.reg_nom):''}</div></div></div>`;
  h+=`<div class="kblock"><div class="kbt-h">Padrón y participación</div><div class="kgrid">`+
     card(fmtN(o.inscritos),'Electores inscritos','padrón 2025')+card(fmtP(o.participacion),'Participación','pdte. 2025 1ª v.')+card(fmtN(o.votantes),'Votantes','pdte. 2025 1ª v.')+`</div>`+
     (oblig.length? `<div class="ksub">Participación desde el voto obligatorio (2022→)</div>${partSpark(oblig)}`:'')+`</div>`;
  h+=`<div class="kblock"><div class="kbt-h">Composición del electorado y población</div><div class="kgrid">`+
     card(fmtP(o.pct_muj),'Mujeres','del electorado')+card(fmtP(o.pct_ext),'Extranjeros','electores no chilenos')+`</div>`+
     `<div class="ksub">Distribución etaria del electorado</div>`+bars([['18–29',o.pct_a1829,'#4A80C0'],['30–44',o.pct_a3044,'#6f9fd0'],['45–59',o.pct_a4559,'#9aa0a6'],['60+',o.pct_a60,'#C55A11']])+
     (o.pct_rural!=null?`<div class="ksub">Población urbana / rural (Censo 2024)</div>`+bars([['Urbana',100-o.pct_rural,'#4A80C0'],['Rural',o.pct_rural,'#3F8E86']]):'')+`</div>`;
  h+=`<div class="kblock"><div class="kbt-h">Demografía y territorio <span>· Censo 2024</span></div><div class="kgrid">`+
     card(fmtN(o.pob_2024),'Población',o.var_pct!=null?`${o.var_pct>0?'+':''}${fmtD(o.var_pct)}% vs 2017`:'')+
     card(fmtD(o.dens_hab_ha),'Densidad','hab/ha')+card(fmtP(o.pct_60mas),'60 años y más','población')+card(fmtP(o.pct_inmig),'Inmigrantes','población')+`</div></div>`;
  h+=`<div class="kblock"><div class="kbt-h">Socioeconómico <span>· Censo / CASEN</span></div><div class="kgrid">`+
     card(o.casen_ing_pc?('$'+fmtN(o.casen_ing_pc)):'—','Ingreso per cápita','hogar, CASEN')+card(fmtP(o.casen_pobreza_pct),'Pobreza','multidimensional')+
     card(fmtD(o.escol),'Escolaridad','años promedio')+card(o.nse_label||'—','Nivel socioeconómico','grupo modal')+card(fmtP(o.pct_activa),'Ocupación','pob. económ. activa')+`</div>`+
     (o.esc_basica!=null?`<div class="ksub">Nivel educacional (población 25+ años)</div>`+bars([['Básica',o.esc_basica,'#C55A11'],['Media',o.esc_media,'#9aa0a6'],['Técnica',o.esc_tecnica,'#6f9fd0'],['Profesional',o.esc_prof,'#4A80C0']]):'')+`</div>`;
  h+=autoridad(o);
  h+=`<div class="c-foot">Nivel <b>${lvlLbl}</b> · ${fmtN(o.pob_2024)} habitantes. Composición del electorado según quienes votaron; demografía y educación del Censo 2024; ingreso/pobreza de CASEN.</div></div>`;
  p.innerHTML=h; }

// =================== MÓDULO Análisis territorial ===================
function ensureMap(){ if(map) return;
  map=L.map('map',{preferCanvas:true,minZoom:3}).setView([-33.55,-70.66],9);  // primera imagen: cuenca de Santiago
  // capas base: Mapa (CARTO) / Satélite (Esri World Imagery) — mismo montaje que el visor de uso de suelo
  const claro=L.tileLayer(isDark()?MAP_DARK:MAP_LIGHT,
    {attribution:'&copy; OpenStreetMap &copy; CARTO',subdomains:'abcd',maxZoom:19}); mapBaseLayer=claro;
  const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics',maxZoom:19});
  const labels=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
    {subdomains:'abcd',maxZoom:19,pane:'shadowPane'});  // etiquetas de calles/lugares sobre satélite
  claro.addTo(map);
  L.control.layers({'Mapa':claro,'Satélite':sat},null,{position:'topright',collapsed:true}).addTo(map);
  map.on('baselayerchange',e=>{ if(e.name==='Satélite'){ labels.addTo(map); } else { map.removeLayer(labels); } });
  // pantalla completa
  const fc=L.control({position:'topleft'});
  fc.onAdd=function(){ const d=L.DomUtil.create('div','leaflet-bar'); const a=L.DomUtil.create('a','',d);
    a.href='#'; a.title='Pantalla completa'; a.style.cssText='font-size:15px;font-weight:700;text-align:center'; a.innerHTML='⛶';
    L.DomEvent.on(a,'click',function(ev){ L.DomEvent.stop(ev); const el=map.getContainer();
      if(!document.fullscreenElement){ (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el); }
      else { (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document); }
      setTimeout(()=>map.invalidateSize(),250); }); return d; };
  fc.addTo(map);
  canvas=L.canvas({padding:.5});
  document.getElementById('elecBtn').onclick=openElecPanel;
  document.getElementById('climits').onchange=()=>{ if(tab==='T') renderT(); };
  document.getElementById('charttype').onchange=e=>{ chartType=e.target.value; renderT(); };
  document.addEventListener('click',e=>{ const p=document.getElementById('elecpanel');
    if(p.style.display==='block'&&!p.contains(e.target)&&e.target.id!=='elecBtn'){ p.style.display='none'; } });
}
function loadTerr(e){ if(TERRCACHE[e]){ TERR=TERRCACHE[e]; return Promise.resolve(); }
  return fetch('data/territorial/'+e+'.json?v='+V).then(r=>r.json()).then(d=>{ TERRCACHE[e]=d; TERR=d; }); }
function openElecPanel(){ const p=document.getElementById('elecpanel');
  if(p.style.display==='block'){ p.style.display='none'; return; }
  p.innerHTML=''; Object.keys(CAT).sort().reverse().forEach(y=>{ const yr=document.createElement('div'); yr.className='ep-year';
    yr.innerHTML=`<div class="ep-y">${y}</div>`; const wrap=document.createElement('div'); wrap.className='ep-els';
    CAT[y].forEach(fam=> fam.elecciones.forEach(el=>{ const b=document.createElement('button'); b.textContent=el.label; b.title=fam.familia;
      b.className=el.id===elecSel?'on':''; b.onclick=()=>{ elecSel=el.id; colorby='winner'; p.style.display='none';
        const _g=officeGran(elecSel); if(_g) granul=clampGran(_g);   // granularidad natural del cargo, acotada al alcance (gob→región nacional / comuna dentro de una región)
        document.getElementById('elecBtn').textContent=elecInfo(elecSel).label+' · '+y;
        loadTerr(elecSel).then(()=>{ buildCandsel(); buildGranul(); buildIndics(); renderT(); }); }; wrap.appendChild(b); }));
    yr.appendChild(wrap); p.appendChild(yr); });
  p.style.display='block'; }
function indicList(){ const L=[{k:'winner',lbl:'Ganador'},{k:'part',lbl:'Participación'},{k:'cand',lbl:'Candidato'},{k:'nulos',lbl:'Blancos+nulos'},{k:'margen',lbl:'Competitividad'}];
  // Swing y Voto cruzado MOVIDOS a Análisis tendencial (spec 2026-07-12). 'consist' retirado antes.
  if(hasRounds(elecSel)) L.push({k:'traspaso',lbl:'Traspaso de votos'});
  if(CONFIDX[elecSel]) L.push({k:'conf',lbl:'Confiabilidad geog.'});  // padrón vs residentes censales (solo elecciones cercanas al Censo 2024)
  L.push({k:'vdc',lbl:'Voto duro/coalición',soon:1});  // llega desde Tendencial → placeholder deshabilitado
  return L; }
function validColorby(){ const s=new Set(['winner','part','nulos','margen']); if(hasRounds(elecSel))s.add('traspaso'); if(CONFIDX[elecSel])s.add('conf'); return s; }
function buildIndics(){ const box=document.getElementById('indics'); box.innerHTML='';
  if(!(colorby.startsWith('cand:')||validColorby().has(colorby))) colorby='winner';
  indicList().forEach(I=>{ const b=document.createElement('button'); b.className='ind-btn'+(I.soon?' soon':''); b.textContent=I.lbl+(I.soon?' ·':'');
    if(I.soon){ b.disabled=true; b.title='Llega desde Análisis tendencial (próximamente)'; box.appendChild(b); return; }
    if(I.k==='cand'?colorby.startsWith('cand:'):colorby===I.k) b.classList.add('on');
    b.onclick=()=>{ if(I.k==='cand'){ colorby='cand:'+candselVal(); showCandsel(true); } else { colorby=I.k; showCandsel(false); } buildIndics(); renderT(); };
    box.appendChild(b); });
  showCandsel(colorby.startsWith('cand:')); }
function candselVal(){ const s=document.getElementById('candsel'); return s&&s.value?+s.value.slice(5):0; }
function showCandsel(on){ const s=document.getElementById('candsel'); s.style.display=on?'':'none'; if(on) s.value=colorby.startsWith('cand:')?colorby:'cand:0'; }
function buildCandsel(){ const s=document.getElementById('candsel'); s.innerHTML='';
  // candidatos COHERENTES con la unidad: solo los que tienen votos en ella (clave en gobernadores/diputados, carrera por región/distrito)
  const cuts=unitCuts(); const agg={};
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue; const v=TERR.comuna[cut].v; for(const i in v) agg[i]=(agg[i]||0)+v[i]; }
  let idxs=Object.keys(agg).map(i=>+i).sort((a,b)=>agg[b]-agg[a]);
  if(!idxs.length) idxs=TERR.candidatos.map(c=>c.i);  // fallback
  idxs.slice(0,30).forEach(i=>{ const c=TERR.candidatos[i]; if(!c) return; const o=document.createElement('option'); o.value='cand:'+i; o.textContent=cap(c.nombre); s.appendChild(o); });
  // si el candidato coloreado actual no está en la unidad, resetea al más votado de ella
  if(colorby.startsWith('cand:') && !idxs.includes(+colorby.slice(5))) colorby='cand:'+idxs[0];
  s.onchange=e=>{ colorby=e.target.value; buildIndics(); renderT(); }; }
const MANZ={};  // cache de geojson de manzanas por cut
function ensureManz(cut){ if(MANZ[cut]!==undefined) return Promise.resolve();
  return fetch('data/manzanas/'+cut+'.geojson?v='+V).then(r=>r.ok?r.json():null).then(d=>{MANZ[cut]=d;}).catch(()=>{MANZ[cut]=null;}); }
// ===== MODO C: imputación de voto a nivel MANZANA (dasimétrico) =====
let MANZIMP={}; const MZ_MIN=20;  // umbral de privacidad: no imputar manzanas con < MZ_MIN electores
function unitGaps(){ // sesgo por grupo (pp, tasaA−tasaB) para el colorby actual, sobre la unidad
  const s=((SESGOS[level]||{})[unitId]||{})[elecSel]; const g={gen:0,edad:0,nac:0};
  if(colorby==='part'){ if(s&&s.sexo) g.gen=(s.sexo.M||0)-(s.sexo.H||0);
    if(s&&s.edad) g.edad=(s.edad['18-24']||0)-((s.edad['25-44']||0)+(s.edad['45-59']||0)+(s.edad['60+']||0))/3;
    if(s&&s.nac) g.nac=(s.nac.E||0)-(s.nac.C||0); return g; }
  const ms=unitMesas();
  for(const [k,fr] of [['gen',m=>m.muj/m.t],['edad',m=>m.ed[0]/m.t],['nac',m=>m.ext/m.t]]){
    const pts=ms.map(m=>({x:fr(m),y:mesaOutcome(m),w:m.t})).filter(p=>p.x!=null&&isFinite(p.x)&&p.y!=null);
    const ki=kingEI(pts); g[k]=ki?(ki.A-ki.B)*100:0; }
  return g;
}
function polyRateC(rec){ const u=TERR.local[rec]; if(!u||!u.val) return null;
  if(colorby==='part') return u.part;
  const em=u.val+(u.nb||0);
  if(colorby==='nulos') return em?100*(u.nb||0)/em:null;
  if(colorby.startsWith('cand:')) return 100*(u.v[+colorby.slice(5)]||0)/u.val; return null; }
function manzBayesCells(){ const by=(colorby.startsWith('cand:')||colorby==='nulos')?crossBayes():null;  // [p_MJ,p_HJ,p_MM,p_HM] posterior comunal
  return (by&&by!=='loading'&&by.cells&&by.cells.m&&by.cells.m.every(x=>x!=null))?by.cells.m:null; }
function computeManzImput(feats){ MANZIMP={};
  const bc=manzBayesCells();            // si hay posterior bayesiana → dasimétrico con β por celda; si no → brechas EI
  const gp=bc?null:unitGaps();
  const poly={};  // codigo_rec → composición agregada de sus manzanas
  for(const f of feats){ const p=f.properties, rec=p.codigo_rec; if(!rec) continue;
    const o=poly[rec]||(poly[rec]={pob:0,muj:0,jov:0,ext:0}); o.pob+=p.pob||0; o.muj+=p.muj||0; o.jov+=p.joven||0; o.ext+=p.ext||0; }
  const vals=[];
  for(const f of feats){ const p=f.properties, rec=p.codigo_rec, pob=p.pob||0;
    if(!rec||pob<MZ_MIN||p.muj==null){ MANZIMP[p.manzent]=null; continue; }  // sin composición censal → suprimida
    const pr=polyRateC(rec), pg=poly[rec];
    if(pr==null||!pg||!pg.pob){ MANZIMP[p.manzent]=null; continue; }
    let imp;
    if(bc){ // desviación composicional (celdas género×edad de la manzana vs polígono) ponderada por la propensión BAYESIANA de cada celda
      const mw=p.muj/pob, mj=p.joven/pob, pw=pg.muj/pg.pob, pj=pg.jov/pg.pob;
      const mf=[mw*mj,(1-mw)*mj,mw*(1-mj),(1-mw)*(1-mj)], pf=[pw*pj,(1-pw)*pj,pw*(1-pj),(1-pw)*(1-pj)];
      let dev=0; for(let k=0;k<4;k++) dev+=(mf[k]-pf[k])*bc[k]; imp=pr+dev;
    } else imp=pr + gp.gen*(p.muj/pob - pg.muj/pg.pob) + gp.edad*(p.joven/pob - pg.jov/pg.pob) + gp.nac*(p.ext/pob - pg.ext/pg.pob);
    imp=Math.max(0,Math.min(100,imp)); MANZIMP[p.manzent]=imp; vals.push(imp); }
  seqRange={lo:pctl(vals,.05),hi:pctl(vals,.95)};
}
function buildGranul(){ const s=document.getElementById('granul'); const opts=[];
  if(TERR.meta.has_local&&AREAS){ opts.push(['poligono','Polígono (local)']);
    if(level==='comuna'){ opts.push(['manzana','Manzana (observado)']);   // modo B: hereda el valor del polígono
      opts.push(['manzana_est','Manzana (estimativa)']); } }              // modo C: voto imputado por composición censal
  opts.push(['comuna','Comuna']);
  if(level==='nacional'||level==='region') opts.push(['distrito','Distrito']);   // distrito no tiene sentido dentro de una comuna
  if(level==='nacional') opts.push(['region','Región']);                          // región solo a nivel país (dentro de una región es 1 polígono)
  s.innerHTML=opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
  granul=clampGran(granul); if(!opts.some(o=>o[0]===granul)) granul=opts[0][0];
  s.value=granul; s.onchange=e=>{ granul=e.target.value; renderT(); }; }
// evita granularidades más gruesas o iguales al alcance (el bug del "1 polígono" al entrar a una región con granularidad Región)
function clampGran(g){
  if(g==='region' && level!=='nacional') g='comuna';
  if(g==='distrito' && !(level==='nacional'||level==='region')) g='comuna';
  if((g==='comuna'||g==='distrito'||g==='region') && level==='comuna') g=(TERR&&TERR.meta.has_local&&AREAS)?'poligono':'comuna';
  return g; }

function unitCuts(){ if(level==='comuna') return new Set([+unitId]); if(level==='nacional') return null;
  return new Set(Object.entries(CUTMAP).filter(([c,x])=> level==='region'?x.reg==unitId:level==='distrito'?x.dist==unitId:
    level==='circ_senatorial'?x.circ==unitId:level==='metro'?x.metro===unitId:false).map(([c])=>+c)); }
function ensureGeom(g){ const file={distrito:'distritos.geojson',region:'regiones_pobladas.geojson'}[g];
  if(!file||GEOMS[g]) return Promise.resolve(); return fetch('data/'+file+'?v='+V).then(r=>r.json()).then(d=>{GEOMS[g]=d;}); }
function aggToLevel(kind){ const cuts=unitCuts(); const out={}; const key=kind==='dist'?'dist':'reg';
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue; const cm=CUTMAP[cut]; const g=cm?cm[key]:null; if(g==null) continue;
    const u=TERR.comuna[cut]; const o=out[g]||(out[g]={val:0,nb:0,v:{},emit:0,ins:0});
    o.val+=u.val; o.nb+=(u.nb||0); for(const i in u.v) o.v[i]=(o.v[i]||0)+u.v[i];
    const em=u.val+(u.nb||0); o.emit+=em; if(u.part) o.ins+=em/(u.part/100); }
  for(const g in out){ const o=out[g]; o.part=o.ins?Math.round(1000*o.emit/o.ins)/10:null; } return out; }
function effGran(){ let g=clampGran(granul);   // clamp por alcance (render siempre coherente aunque el dropdown quede stale)
  if(colorby==='swing'||colorby==='split') g='comuna';
  if(colorby==='consist'&&(g==='distrito'||g==='region')) g='comuna';
  if((g==='manzana'||g==='manzana_est')&&(level!=='comuna'||!(TERR.meta.has_local&&AREAS))) g='poligono';  // manzana solo a nivel comuna
  if(g==='manzana_est'&&!(colorby==='part'||colorby==='nulos'||colorby.startsWith('cand:'))) g='manzana';  // imputación solo para indicadores numéricos con estimación
  if(g==='poligono'&&!(TERR.meta.has_local&&AREAS)) g='comuna'; return g; }
function granName(geo){ return geo==='manzana'?'manzanas':geo==='local'?'locales':geo==='distrito'?'distritos':geo==='region'?'regiones':'comunas'; }
function terrSub(){ const cuts=unitCuts(); const g=effGran();
  if(g==='manzana'||g==='manzana_est'){ const mz=MANZ[unitId]; return {geo:'manzana', idp:'codigo_rec', data:TERR.local, feats:mz?mz.features:[]}; }
  if(g==='poligono') return {geo:'local', idp:'codigo_rec', data:TERR.local, feats:AREAS.features.filter(f=>!cuts||cuts.has(+f.properties.cut))};
  if(g==='comuna') return {geo:'comuna', idp:'cut', data:TERR.comuna, feats:GEOCOMP.features.filter(f=>!cuts||cuts.has(+f.properties.cut))};
  if(g==='distrito'){ const data=aggToLevel('dist'); return {geo:'distrito', idp:'distrito_num', data, feats:(GEOMS.distrito?GEOMS.distrito.features:[]).filter(f=>data[f.properties.distrito_num]!=null)}; }
  const data=aggToLevel('reg'); return {geo:'region', idp:'nro_region', data, feats:(GEOMS.region?GEOMS.region.features:[]).filter(f=>data[f.properties.nro_region]!=null)}; }
function winnerOf(u){ if(!u||!u.val) return null; let bi=null,bv=-1; for(const i in u.v){ if(ELIM.has(+i)) continue; if(u.v[i]>bv){bv=u.v[i];bi=+i;} } return bi==null?null:{i:bi,pct:100*bv/u.val}; }
// ===== vista Ganador con ELIMINACIÓN gradual (instant-runoff visual) =====
let elimN=0; let ELIM=new Set();
function elimOrder(){ const tot=unitTotals(); return Object.entries(tot.v).map(([i,v])=>({i:+i,v:+v})).sort((a,b)=>b.v-a.v).map(x=>x.i); }  // candidatos por votos del ámbito
function computeElim(){ ELIM=new Set(); if(colorby!=='winner'){ elimN=0; return; } const ord=elimOrder(); const max=Math.max(0,ord.length-1);
  if(elimN>max) elimN=max; for(let k=0;k<elimN;k++) ELIM.add(ord[k]); }
function renderElimCtl(){ let c=document.getElementById('elimctl'); if(!c){ c=document.createElement('div'); c.id='elimctl'; document.getElementById('mapwrap').appendChild(c); }
  const ord = colorby==='winner'?elimOrder():[];
  if(colorby!=='winner' || ord.length<3){ c.style.display='none'; return; }
  c.style.display='block';
  const names=ord.slice(0,elimN).map(i=>cap((TERR.candidatos[i]||{}).ape1||(TERR.candidatos[i]||{}).nombre||'')).join(', ');
  const nextNm = elimN<ord.length-1?cap((TERR.candidatos[ord[elimN]]||{}).ape1||''):null;
  c.innerHTML=`<div class="ec-row"><span class="ec-lbl">Eliminar</span>`+
     `<button class="ec-b" data-d="-1" ${elimN<=0?'disabled':''}>−</button><span class="ec-n">${elimN}</span>`+
     `<button class="ec-b" data-d="1" ${elimN>=ord.length-1?'disabled':''}>+</button></div>`+
     (elimN?`<div class="ec-el"><b>Fuera:</b> ${names}<br>Cada polígono se colorea por su ganador entre los que quedan.</div>`
           :`<div class="ec-el ec-hint">Saca al más votado (${nextNm||'—'}) y ve quién queda 2º en cada polígono.</div>`);
  c.querySelectorAll('.ec-b').forEach(b=>b.onclick=()=>{ elimN=Math.max(0,Math.min(ord.length-1,elimN+ +b.dataset.d)); renderT(); });
}
function candCol(i){ const c=TERR.candidatos[i]; if(!c) return '#b9c0cb'; return c.bloque?(BLOQCOL[c.bloque]||'#b9c0cb'):(OPCION_COL[(c.nombre||'').toUpperCase()]||'#b9c0cb'); }
function metricVal(u){ if(!u||!u.val) return null;
  if(colorby==='part') return u.part;
  if(colorby==='margen'){ const s=Object.values(u.v).sort((a,b)=>b-a); return s.length>=2?100*(s[0]-s[1])/u.val:100; }
  if(colorby==='nulos'){ const nb=u.nb||0; return 100*nb/(u.val+nb); }
  if(colorby.startsWith('cand:')){ const i=+colorby.slice(5); return 100*((u.v[i]||0))/u.val; } return null; }
function pctl(a,p){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor((s.length-1)*p)]; }
function seqCol(v){ if(v==null) return '#e5e5e5'; const r=seqRange; if(!r||r.hi===r.lo) return SEQ[2];
  const t=Math.max(0,Math.min(1,(v-r.lo)/(r.hi-r.lo))); return SEQ[Math.min(4,Math.floor(t*5))]; }
function idOf(f){ return f.properties.codigo_rec!=null?f.properties.codigo_rec:f.properties.cut; }
function colorFeat(u,f){ if(colorby==='conf') return confCol(confVal(f));
  if(effGran()==='manzana_est'){ const v=MANZIMP[f.properties.manzent]; return v==null?'#e5e5e5':seqCol(v); }
  if(colorby==='consist') return consistCol(CONSIST[String(idOf(f))]);
  if(colorby==='swing'||colorby==='split') return divCol(DIVMAP[+f.properties.cut]);
  if(colorby==='traspaso'){ const eg=effGran();
    if(traspView==='transfer'&&eg!=='distrito'&&eg!=='region') return transferCol(f,transferT);
    const w=winnerOf(u); return w?candCol(w.i):'#e5e5e5'; }  // vista Ganador y Aumento usan el ganador de fondo
  if(colorby==='winner'){ const w=winnerOf(u); return w?candCol(w.i):'#e5e5e5'; }
  return seqCol(metricVal(u)); }

// ===== VISTAS DEL TRASPASO: Ganador · Transferencia (coropleta que muta 1ª→2ª) · Aumento % =====
let traspView='winner', transferT=1; let TRANSFERMAP={}, TRANSFERFIN=null;
function colOfCand(c){ if(!c) return '#b9c0cb'; return c.bloque?(BLOQCOL[c.bloque]||'#b9c0cb'):(OPCION_COL[(c.nombre||'').toUpperCase()]||'#b9c0cb'); }
// precalcula, por sub-unidad, la base de 1ª vuelta (candidatos asignados a cada finalista por cercanía ideológica) y el resultado de 2ª
function computeTransfer(feats,geo){ TRANSFERMAP={}; TRANSFERFIN=null;
  const r=rounds(elecSel); const T1=TERRCACHE[r.v1], T2=TERRCACHE[r.v2]; if(!T1||!T2) return;
  const fin=[...T2.candidatos].sort((a,b)=>b.vn-a.vn).slice(0,2); if(fin.length<2) return;
  const f1=fin[0], f2=fin[1], e1=f1.eje, e2=f2.eje;
  TRANSFERFIN={c1:f1,c2:f2,col1:colOfCand(f1),col2:colOfCand(f2)};
  const side={};  // candidato de 1ª vuelta → finalista más cercano por eje ideológico
  T1.candidatos.forEach(c=>{ side[c.i]=(c.eje==null||e1==null||e2==null)?null:(Math.abs(c.eje-e1)<=Math.abs(c.eje-e2)?1:2); });
  const d1=geo==='comuna'?T1.comuna:T1.local, d2=geo==='comuna'?T2.comuna:T2.local;
  feats.forEach(f=>{ const id=geo==='comuna'?String(f.properties.cut):String(f.properties.codigo_rec);
    const u2=d2[id]; if(!u2||!u2.val){ TRANSFERMAP[id]=null; return; }
    let a1=(u2.v[f1.i]||0), a2=(u2.v[f2.i]||0); const as=a1+a2; if(!as){ TRANSFERMAP[id]=null; return; } a1/=as; a2/=as;
    const u1=d1[id]; let b1=0,b2=0; if(u1&&u1.val){ for(const i in u1.v){ const s=side[i]; if(s===1)b1+=u1.v[i]; else if(s===2)b2+=u1.v[i]; } }
    const bs=b1+b2; if(bs){ b1/=bs; b2/=bs; } else { b1=a1; b2=a2; }  // sin base 1ª → arranca en el resultado 2ª
    TRANSFERMAP[id]={b1,b2,a1,a2}; }); }
function transferCol(f,t){ if(!TRANSFERFIN) return '#e5e5e5';
  const geo=effGran(); const id=geo==='comuna'?String(f.properties.cut):String(f.properties.codigo_rec);
  const m=TRANSFERMAP[id]; if(!m) return '#e5e5e5';
  const s1=(1-t)*m.b1+t*m.a1, s2=(1-t)*m.b2+t*m.a2; return s1>=s2?TRANSFERFIN.col1:TRANSFERFIN.col2; }
function recolorTransfer(){ if(!layer) return;
  layer.eachLayer(l=>{ if(l.feature) l.setStyle({fillColor:transferCol(l.feature,transferT)}); }); }
// barras verticales del AUMENTO % de votos (emitidos) 1ª→2ª sobre cada zona
function keyName(s){ return (s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
// Aumento %: DOS barras por polígono (una por finalista, con su color de bloque), altura ∝ % de aumento de SUS votos 1ª→2ª
function drawAumentoBars(feats,geo){ if(barLayer){ map.removeLayer(barLayer); barLayer=null; } barLayer=L.layerGroup();
  const r=rounds(elecSel); const T1=TERRCACHE[r.v1], T2=TERRCACHE[r.v2]; if(!T1||!T2){ barLayer.addTo(map); return; }
  const fin=[...T2.candidatos].sort((a,b)=>b.vn-a.vn).slice(0,2); if(fin.length<2){ barLayer.addTo(map); return; }
  const v1idx={}; T1.candidatos.forEach(c=>{ v1idx[keyName(c.nombre)]=c.i; });
  const fins=fin.map(c=>({i2:c.i, i1:v1idx[keyName(c.nombre)], col:colOfCand(c), name:cap(c.ape1||c.nombre||'')}));
  const d1=geo==='comuna'?T1.comuna:T1.local, d2=geo==='comuna'?T2.comuna:T2.local;
  const rows=[]; let hi=1;
  feats.forEach(f=>{ const id=geo==='comuna'?String(f.properties.cut):String(f.properties.codigo_rec);
    const u1=d1[id], u2=d2[id]; if(!u1||!u2) return; const c=featCenter(f); if(!c) return;
    const gs=fins.map(fn=>{ if(fn.i1==null) return null; const a=u1.v[fn.i1]||0, b=u2.v[fn.i2]||0; return a>0?100*(b-a)/a:null; });
    if(gs.every(g=>g==null)) return; gs.forEach(g=>{ if(g!=null) hi=Math.max(hi,Math.abs(g)); }); rows.push({c,gs}); });
  if(!rows.length){ barLayer.addTo(map); return; }
  const showN=rows.length<=140;  // número sobre cada barra si no hay demasiadas zonas
  rows.forEach(({c,gs})=>{ let bars='';
    gs.forEach((g,k)=>{ if(g==null){ bars+='<span class="mb2col"><span class="mb2 mb2e"></span></span>'; return; }
      const hpx=Math.max(3,Math.min(40,Math.abs(g)/hi*40));
      const lbl=showN?`<span class="mb2n">${g>=0?'+':''}${g.toFixed(0)}%</span>`:'';
      bars+=`<span class="mb2col">${lbl}<span class="mb2" style="height:${hpx}px;background:${fins[k].col};outline:1px solid rgba(255,255,255,.35)" title="${fins[k].name}: ${g>=0?'+':''}${g.toFixed(0)}%"></span></span>`; });
    const H=showN?58:44; const icon=L.divIcon({className:'barmk',html:`<div class="mbar2">${bars}</div>`,iconSize:[30,H],iconAnchor:[15,H]});
    L.marker(c,{icon,keyboard:false,interactive:false}).addTo(barLayer); });
  barLayer.addTo(map); }
// control de vistas + slider sobre el mapa (solo con indicador Traspaso)
function renderTraspCtl(){ let c=document.getElementById('traspctl');
  if(!c){ c=document.createElement('div'); c.id='traspctl'; document.getElementById('mapwrap').appendChild(c); }
  if(colorby!=='traspaso'){ c.style.display='none'; return; }
  c.style.display='block';
  const views=[['winner','Ganador'],['transfer','Transferencia'],['aumento','Aumento %']];
  c.innerHTML=`<div class="tc-seg">`+views.map(([v,l])=>`<button class="trsp-b${traspView===v?' on':''}" data-tv="${v}">${l}</button>`).join('')+`</div>`+
    (traspView==='transfer'?`<div class="tc-sl"><span>1ª</span><input type="range" id="tSlider" min="0" max="100" value="${Math.round(transferT*100)}"><span>2ª</span></div>`:'');
  c.querySelectorAll('.trsp-b').forEach(b=>b.onclick=()=>{ traspView=b.dataset.tv; if(traspView==='transfer')transferT=1; renderT(); });
  const sl=document.getElementById('tSlider'); if(sl) sl.oninput=e=>{ transferT=+e.target.value/100; recolorTransfer(); }; }

// ---- consistencia 1ª/2ª vuelta (bloque ganador se repite entre rondas) ----
let CONSIST={}, CONSIST_PCT=null;
function fetchTerr(e){ if(TERRCACHE[e]) return Promise.resolve(TERRCACHE[e]);
  return fetch('data/territorial/'+e+'.json?v='+V).then(r=>r.json()).then(d=>{TERRCACHE[e]=d; return d;}); }
function rounds(e){ const off=officeOf(e), yr=e.slice(0,4); const all=allElecList().filter(x=>x.slice(0,4)===yr&&officeOf(x)===off);
  return {v1:all.find(x=>x.includes('_1v')), v2:all.find(x=>x.includes('_2v'))}; }
function hasRounds(e){ const r=rounds(e); return r.v1&&r.v2; }
function wbBloc(T,geo,id){ if(!T) return null; const data=geo==='local'?T.local:T.comuna; const u=data[String(id)];
  if(!u||!u.val) return null; let bi=null,bv=-1; for(const k in u.v) if(u.v[k]>bv){bv=u.v[k];bi=+k;}
  const c=bi==null?null:T.candidatos[bi]; return c?c.bloque:null; }
function computeConsist(feats,geo){ CONSIST={}; const r=rounds(elecSel); const T1=TERRCACHE[r.v1], T2=TERRCACHE[r.v2];
  feats.forEach(f=>{ const id=idOf(f); const b1=wbBloc(T1,geo,id), b2=wbBloc(T2,geo,id);
    CONSIST[String(id)]=(b1&&b2)?(b1===b2?1:0):null; });
  const vv=Object.values(CONSIST).filter(v=>v!=null); CONSIST_PCT=vv.length?Math.round(100*vv.filter(v=>v).length/vv.length):null; }
function consistCol(v){ return v==null?'#e5e5e5':(v?'#3F8E86':'#C55A11'); }

// ---- swing (vs elección anterior mismo tipo) y split-ticket (vs otra elección del mismo día) ----
const DIVPAL=['#2166ac','#67a9cf','#f7f7f7','#ef8a62','#b2182b']; let DIVMAP={}, DIVREF=null;
function allElecList(){ const a=[]; for(const y in CAT) for(const f of CAT[y]) for(const e of f.elecciones) a.push(e.id); return a.sort(); }
function suffixOf(e){ return e.substring(e.indexOf('_')+1); }
function officeOf(e){ for(const o of ['presidencial','primarias','diputados','senadores','alcaldes','concejales','gobernadores','cores','convencion','consejo','plebiscito']) if(e.includes(o)) return o; return ''; }
function officeGran(e){ return ({gobernadores:'region',alcaldes:'comuna',concejales:'comuna',cores:'comuna',diputados:'distrito',senadores:'region'})[officeOf(e)]||null; }  // null = deja el default (presidencial/plebiscito → polígono)
function prevSameType(e){ const sf=suffixOf(e); const all=allElecList().filter(x=>suffixOf(x)===sf); const i=all.indexOf(e); return i>0?all[i-1]:null; }
function partnerOf(e){ const d=e.slice(0,7); const same=allElecList().filter(x=>x!==e&&x.slice(0,7)===d);
  const pref={presidencial:['diputados','senadores'],diputados:['presidencial','senadores'],senadores:['presidencial','diputados'],
    alcaldes:['gobernadores','cores'],gobernadores:['alcaldes','cores'],cores:['alcaldes','gobernadores'],concejales:['alcaldes'],convencion:['gobernadores','cores']};
  for(const o of (pref[officeOf(e)]||[])){ const m=same.find(x=>officeOf(x)===o); if(m) return m; } return same[0]||null; }
function netPos(bl){ if(!bl) return null; const l=(bl['Izquierda']||0)+(bl['Centro-izquierda']||0);
  const r=(bl['Centro-derecha']||0)+(bl['Derecha']||0)+(bl['Derecha radical']||0); return (l+r)===0?null:(r-l); }
function ensureTendComuna(){ if(TENDCACHE['comuna']) return Promise.resolve();
  return fetch('data/tendencia/comuna.json?v='+V).then(r=>r.json()).then(d=>{ TENDCACHE['comuna']=d; }); }
function computeDivMap(feats){ DIVMAP={}; const tc=TENDCACHE['comuna']||{};
  DIVREF = colorby==='swing'? prevSameType(elecSel) : partnerOf(elecSel);
  const vals=[]; feats.forEach(f=>{ const cut=+f.properties.cut; const ser=tc[String(cut)];
    const na=ser&&ser[elecSel]?netPos(ser[elecSel].bl):null, nb=ser&&DIVREF&&ser[DIVREF]?netPos(ser[DIVREF].bl):null;
    const v=(na==null||nb==null)?null:+(na-nb).toFixed(1); DIVMAP[cut]=v; if(v!=null) vals.push(Math.abs(v)); });
  seqRange={abs:Math.max(pctl(vals,.95)||8, 3)}; }
function divCol(v){ if(v==null) return '#e5e5e5'; const m=(seqRange&&seqRange.abs)||10; const t=Math.max(-1,Math.min(1,v/m));
  return DIVPAL[ t<=-0.5?0 : t<=-0.15?1 : t<0.15?2 : t<0.5?3 : 4 ]; }

function renderT(){
  const eg=effGran(); computeElim();
  if((eg==='distrito'||eg==='region') && !GEOMS[eg]){ ensureGeom(eg).then(renderT); return; }
  if((eg==='manzana'||eg==='manzana_est') && MANZ[unitId]===undefined){ document.getElementById('resumen').innerHTML='Cargando manzanas…'; ensureManz(unitId).then(renderT); return; }
  if(eg==='manzana_est'){
    if(MESA[elecSel]===undefined||CROSSB[elecSel]===undefined){ document.getElementById('resumen').innerHTML='Estimando manzanas…'; Promise.all([ensureMesa(elecSel),ensureSesgos(),ensureCrossBayes(elecSel)]).then(renderT); return; }
    computeManzImput(terrSub().feats); }
  if((colorby==='swing'||colorby==='split') && !TENDCACHE['comuna']){ ensureTendComuna().then(renderT); return; }
  if(colorby==='consist'){ const r=rounds(elecSel); if(!TERRCACHE[r.v1]||!TERRCACHE[r.v2]){ Promise.all([fetchTerr(r.v1),fetchTerr(r.v2)]).then(renderT); return; } }
  if(colorby==='conf'&&CONF[elecSel]===undefined){ document.getElementById('resumen').innerHTML='Cargando confiabilidad…'; ensureConf(elecSel).then(renderT); return; }
  if(colorby==='traspaso'&&(traspView==='transfer'||traspView==='aumento')){ const r=rounds(elecSel);
    if(!TERRCACHE[r.v1]||!TERRCACHE[r.v2]){ document.getElementById('resumen').innerHTML='Cargando ambas vueltas…'; Promise.all([fetchTerr(r.v1),fetchTerr(r.v2)]).then(renderT); return; } }
  if(layer){ map.removeLayer(layer); layer=null; }
  const {geo,idp,data,feats}=terrSub();
  if(!feats.length){ document.getElementById('resumen').innerHTML='Sin sub-unidades para mapear.'; return; }
  if(colorby==='swing'||colorby==='split') computeDivMap(feats);
  else if(colorby==='consist') computeConsist(feats,geo);
  else if(colorby==='traspaso'&&traspView==='transfer'&&geo!=='distrito'&&geo!=='region') computeTransfer(feats,geo);
  else if(colorby!=='winner'&&colorby!=='traspaso'&&colorby!=='conf'&&effGran()!=='manzana_est'){ const vals=feats.map(f=>metricVal(data[String(f.properties[idp])])).filter(v=>v!=null);
    seqRange={lo:pctl(vals,.05),hi:pctl(vals,.95)}; }
  const barsMode = chartType==='barras' && barsApplicable() && feats.length<=700;
  const w0=geo==='local'?.7:geo==='comuna'?.6:.8;
  layer=L.geoJSON({type:'FeatureCollection',features:feats},{ renderer:canvas,
    style:f=>({color:'#fff',weight:w0,fillColor:barsMode?'#eef1f5':colorFeat(data[String(f.properties[idp])],f),fillOpacity:barsMode?.5:.82}),
    onEachFeature:(f,l)=>{ l.bindPopup(popupSub(f,geo,idp,data));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:w0})); }
  }).addTo(map);
  drawClimits();  // límites comunales sobre el relleno
  if(barsMode) drawBars(feats,data,idp); else if(barLayer){ map.removeLayer(barLayer); barLayer=null; }
  if(colorby==='traspaso'&&traspView==='aumento') drawAumentoBars(feats,geo);
  const fk=level+'|'+unitId;  // mantener vista: solo re-encuadrar al cambiar de UNIDAD (no indicador, granularidad ni elección)
  // Nacional NO auto-encuadra (deja la vista en la cuenca de Santiago); región/comuna sí se encuadran a su unidad
  if(fk!==mapFitKey){ if(level!=='nacional'){ try{ map.fitBounds(layer.getBounds(),{padding:[22,22],maxZoom:geo==='local'?14:11}); }catch(e){} } mapFitKey=fk; }
  renderResumen(geo,feats.length); renderLeg(); renderTraspCtl(); renderElimCtl(); renderRight(geo,feats,idp,data);
}
let barLayer=null;
function barsApplicable(){ return ['part','nulos','margen'].includes(colorby)||colorby.startsWith('cand:'); }
function featCenter(f){ const g=f.geometry; if(!g) return null; let ring=g.type==='Polygon'?g.coordinates[0]:(g.coordinates[0]&&g.coordinates[0][0]);
  if(!ring||!ring.length) return null; let x=0,y=0,n=0; for(const p of ring){ x+=p[0]; y+=p[1]; n++; } return n?[y/n,x/n]:null; }
function drawBars(feats,data,idp){ if(barLayer){ map.removeLayer(barLayer); barLayer=null; } barLayer=L.layerGroup();
  const vals=feats.map(f=>metricVal(data[String(f.properties[idp])])).filter(v=>v!=null); if(!vals.length){ barLayer.addTo(map); return; }
  const hi=Math.max(...vals)||100;
  feats.forEach(f=>{ const u=data[String(f.properties[idp])]; const v=metricVal(u); if(v==null) return; const c=featCenter(f); if(!c) return;
    const hpx=Math.max(3,Math.min(48, v/hi*48));
    const icon=L.divIcon({className:'barmk',html:`<div class="mbar" style="height:${hpx}px;background:${seqCol(v)}"></div>`,iconSize:[7,hpx],iconAnchor:[3,hpx]});
    L.marker(c,{icon,keyboard:false,interactive:false}).addTo(barLayer); });
  barLayer.addTo(map); }
function drawClimits(){ if(climitsLayer){ map.removeLayer(climitsLayer); climitsLayer=null; }
  const on=document.getElementById('climits'); if(!on||!on.checked) return;
  const cuts=unitCuts(); const feats=GEOCOM.features.filter(f=>!cuts||cuts.has(+f.properties.cut));
  climitsLayer=L.geoJSON({type:'FeatureCollection',features:feats},{renderer:canvas,interactive:false,
    style:{color:'#33415a',weight:1.1,fill:false,opacity:.55}}).addTo(map); }
// ---- sesgos de participación por grupo (bajo el mapa) ----
let SESGOS={}; const NSE_ORDER=['Alto','Medio-alto','Medio','Medio-bajo','Bajo'];
function ensureSesgos(){ if(SESGOS[level]) return Promise.resolve();
  return fetch('data/sesgos/'+level+'.json?v='+V).then(r=>r.json()).then(d=>{SESGOS[level]=d;}).catch(()=>{SESGOS[level]={};}); }
function nsePart(){ const cuts=unitCuts(); const tc=TENDCACHE['comuna']||{}; const grp={};
  const cs=cuts?[...cuts]:Object.keys(KPI.comuna).map(Number);
  cs.forEach(cut=>{ const k=KPI.comuna[cut]; const ser=tc[String(cut)]; const p=ser&&ser[elecSel]?ser[elecSel].part:null;
    if(!k||!k.nse_label||p==null) return; const g=grp[k.nse_label]=grp[k.nse_label]||{w:0,s:0}; const w=k.inscritos||1; g.w+=w; g.s+=w*p; });
  const o={}; Object.entries(grp).forEach(([k,v])=>o[k]=v.w?Math.round(10*v.s/v.w)/10:null); return o; }
function szCard(title,pairs,hint){ return `<div class="sz-card"><div class="sz-h">${title}</div>`+
  pairs.map(([l,v])=>`<div class="sz-bar"><span class="sz-l">${l}</span><span class="sz-t"><i style="width:${v==null?0:Math.min(100,v)}%"></i></span><span class="sz-v">${v==null?'—':v+'%'}</span></div>`).join('')+
  (hint?`<div class="sz-note">${hint}</div>`:'')+`</div>`; }
let SOCIO={}, SOCIO_LOADED=false;
function ensureSocio(){ if(SOCIO_LOADED) return Promise.resolve();
  return fetch('data/explorador_socio.json?v='+V).then(r=>r.json()).then(d=>{SOCIO=d;SOCIO_LOADED=true;}).catch(()=>{SOCIO_LOADED=true;}); }
function renderEcol(){ const box=document.getElementById('terrbottom');
  const eg=effGran(); if(eg==='distrito'||eg==='region'){ box.innerHTML=`<div class="sz-hint">Los sesgos ecológicos se calculan a nivel <b>polígono</b> o <b>comuna</b>. Cambia la granularidad para verlos.</div>`; return; }
  box.innerHTML='<div class="sz-hint">Cargando sesgos…</div>';
  ensureSocio().then(()=>{ const {geo,idp,data,feats}=terrSub(); const isLocal=geo==='local';
    const vars=isLocal?[['escolaridad','Escolaridad'],['pct_extranjeros','% extranjeros'],['pct_60mas','% 60+ años'],['pct_jov1824','% jóvenes'],['pct_mujeres','% mujeres'],['pct_indigena','% originarios']]
      :[['escol','Escolaridad'],['pct_inmig','% inmigrantes'],['pct_60mas','% 60+ años'],['pct_a1829','% jóvenes'],['casen_ing_pc','Ingreso'],['nse_score','NSE']];
    const rows=feats.map(f=>{ const id=idOf(f); const u=data[String(id)];
      const metric= u&&u.val? (colorby==='nulos'? 100*((u.nb||0))/(u.val+(u.nb||0)) : 100*((u.v[+colorby.slice(5)]||0))/u.val) : null;
      const soc=isLocal?SOCIO[String(id)]:KPI.comuna[id]; return {metric,soc}; }).filter(x=>x.metric!=null&&x.soc);
    const cors=vars.map(([k,lbl])=>{ const xs=[],ys=[]; rows.forEach(r=>{ if(r.soc[k]!=null){ xs.push(r.soc[k]); ys.push(r.metric); }});
      return {lbl,r:xs.length>4?pearson(xs,ys):null}; }).filter(c=>c.r!=null).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
    const ml=colorby==='nulos'?'blancos + nulos':'voto de '+cap(TERR.candidatos[+colorby.slice(5)].nombre);
    let h=`<div class="sz-title">Sesgos ecológicos · ${ml} · correlación con la demografía de las ${rows.length} ${isLocal?'locales':'comunas'}</div>`;
    if(!cors.length){ h+=`<div class="sz-hint">Sin suficientes sub-unidades con dato demográfico.</div>`; }
    else h+=`<div class="sz-eco">`+cors.map(c=>{ const w=Math.abs(c.r)*50,pos=c.r>=0; return `<div class="dr-cor"><span class="dr-lbl">${c.lbl}</span><span class="dr-track"><i class="dr-fill" style="width:${w}%;${pos?'left:50%':'right:50%'};background:${pos?'#b2182b':'#2166ac'}"></i></span><span class="dr-r">${c.r>0?'+':''}${c.r.toFixed(2)}</span></div>`; }).join('')+`</div>`;
    h+=`<div class="sz-note">Correlación de Pearson (ecológica, Robinson 1950): rojo = más apoyo donde la variable es alta; azul = menos. Describe territorios, no personas.</div>`;
    box.innerHTML=h;
  });
}
// ===== INFERENCIA ECOLÓGICA sistematizada (Goodman + LS restringido) =====
// Modelo: y_p = x_p·βA + (1−x_p)·βB  (x_p = fracción del grupo A por unidad, y_p = tasa del indicador).
// eiFit devuelve βA/βB por Goodman (MCO) y por mínimos cuadrados RESTRINGIDOS a [0,1].
function eiFit(pts){ const P=pts.filter(p=>p.x!=null&&p.y!=null&&isFinite(p.x)&&isFinite(p.y)&&p.w>0); if(P.length<6) return null;
  let sw=0,Suu=0,Svv=0,Suv=0,Suy=0,Svy=0,mx=0,my=0;
  P.forEach(p=>{ const u=p.x,v=1-p.x; sw+=p.w; Suu+=p.w*u*u; Svv+=p.w*v*v; Suv+=p.w*u*v; Suy+=p.w*u*p.y; Svy+=p.w*v*p.y; mx+=p.w*p.x; my+=p.w*p.y; });
  mx/=sw; my/=sw; let vx=0; P.forEach(p=>vx+=p.w*(p.x-mx)**2); const sdx=Math.sqrt(vx/sw); const noVar=vx/sw<1e-4;
  const det=Suu*Svv-Suv*Suv; let gA=my,gB=my;
  if(!noVar&&Math.abs(det)>1e-12){ gA=(Svv*Suy-Suv*Svy)/det; gB=(Suu*Svy-Suv*Suy)/det; }
  let cA=my,cB=my;  // LS restringido: búsqueda en grilla refinada dentro de [0,1]²
  if(!noVar){ let rA=[0,1],rB=[0,1],best=null;
    for(let pass=0;pass<2;pass++){ best=null; const stA=(rA[1]-rA[0])/18, stB=(rB[1]-rB[0])/18;
      for(let a=rA[0];a<=rA[1]+1e-9;a+=stA) for(let b=rB[0];b<=rB[1]+1e-9;b+=stB){ let sse=0;
        for(const p of P){ const yh=p.x*a+(1-p.x)*b; sse+=p.w*(p.y-yh)**2; } if(!best||sse<best.sse) best={a,b,sse}; }
      rA=[Math.max(0,best.a-stA),Math.min(1,best.a+stA)]; rB=[Math.max(0,best.b-stB),Math.min(1,best.b+stB)]; }
    cA=best.a; cB=best.b; }
  return {gA,gB,cA,cB,F:mx,sdx,noVar}; }
// Nelder-Mead genérico (reutilizable para MLE/optimización)
function nelderMead(f,x0,maxIter){ const n=x0.length,al=1,ga=2,rh=0.5,si=0.5;
  let S=[x0.slice()]; for(let i=0;i<n;i++){ const p=x0.slice(); p[i]+=(Math.abs(p[i])>1e-6?0.1*Math.abs(p[i]):0.1); S.push(p); }
  let F=S.map(f);
  for(let it=0;it<maxIter;it++){ const o=F.map((v,i)=>i).sort((a,b)=>F[a]-F[b]); S=o.map(i=>S[i]); F=o.map(i=>F[i]);
    const c=new Array(n).fill(0); for(let i=0;i<n;i++) for(let j=0;j<n;j++) c[j]+=S[i][j]/n;
    const w=S[n], xr=c.map((v,j)=>v+al*(v-w[j])), fr=f(xr);
    if(fr<F[0]){ const xe=c.map((v,j)=>v+ga*(xr[j]-v)), fe=f(xe); if(fe<fr){S[n]=xe;F[n]=fe;}else{S[n]=xr;F[n]=fr;} }
    else if(fr<F[n-1]){ S[n]=xr; F[n]=fr; }
    else { const xc=c.map((v,j)=>v+rh*(w[j]-v)), fc=f(xc); if(fc<F[n]){S[n]=xc;F[n]=fc;}
      else { for(let i=1;i<=n;i++){ S[i]=S[0].map((v,j)=>v+si*(S[i][j]-v)); F[i]=f(S[i]); } } } }
  const b=F.map((v,i)=>i).sort((a,b)=>F[a]-F[b])[0]; return {x:S[b],f:F[b]}; }
// King EI (2×2): tomografía + normal bivariada trunc. (MLE modelo lineal) + estimaciones acotadas por unidad (Duncan-Davis)
function kingEI(pts){ const P=pts.filter(p=>p.x!=null&&p.y!=null&&p.w>0&&isFinite(p.x)&&isFinite(p.y)); if(P.length<8) return null;
  const nll=par=>{ const Bb=par[0],Bw=par[1],sb=Math.exp(par[2]),sw=Math.exp(par[3]),rho=Math.tanh(par[4]); let ll=0;
    for(const p of P){ const x=p.x, m=x*Bb+(1-x)*Bw; let v=x*x*sb*sb+(1-x)*(1-x)*sw*sw+2*x*(1-x)*rho*sb*sw; v=Math.max(v,1e-6);
      const d=p.y-m; ll+=p.w*(0.5*Math.log(v)+d*d/(2*v)); } return ll; };
  const g=eiFit(P); const opt=nelderMead(nll,[g?g.cA:.5,g?g.cB:.5,Math.log(.15),Math.log(.15),0],250);
  const Bb=opt.x[0],Bw=opt.x[1],sb=Math.exp(opt.x[2]),sw=Math.exp(opt.x[3]),rho=Math.tanh(opt.x[4]);
  let nB=0,dB=0,nW=0,dW=0;
  for(const p of P){ const x=p.x,t=p.y,m=x*Bb+(1-x)*Bw; let v=x*x*sb*sb+(1-x)*(1-x)*sw*sw+2*x*(1-x)*rho*sb*sw; v=Math.max(v,1e-6);
    let bB=Bb+(x*sb*sb+(1-x)*rho*sb*sw)/v*(t-m);
    const lbB=x>1e-6?Math.max(0,(t-(1-x))/x):0, ubB=x>1e-6?Math.min(1,t/x):1;  // cotas Duncan-Davis
    bB=Math.max(lbB,Math.min(ubB,bB)); bB=Math.max(0,Math.min(1,bB));
    let bW=(1-x)>1e-6?(t-x*bB)/(1-x):Bw; bW=Math.max(0,Math.min(1,bW));
    nB+=p.w*x*bB; dB+=p.w*x; nW+=p.w*(1-x)*bW; dW+=p.w*(1-x); }
  return {A:dB?nB/dB:Bb, B:dW?nW/dW:Bw}; }
// ===== inferencia de sesgos a NIVEL DE MESA (estilo DecideChile) =====
let MESA={};
function ensureMesa(e){ if(MESA[e]) return Promise.resolve();
  return fetch('data/mesa/'+e+'.json?v='+V).then(r=>r.ok?r.json():null).then(d=>{MESA[e]=d||[];}).catch(()=>{MESA[e]=[];}); }
const DEMOS=[{k:'muj',lbl:'Género',A:'Mujeres',B:'Hombres',frac:m=>m.t?m.muj/m.t:null,m3:s=>s&&s.sexo?[s.sexo.M,s.sexo.H]:null},
  {k:'jov',lbl:'Edad (jóvenes)',A:'Jóvenes 18–24',B:'25+ años',frac:m=>m.t?m.ed[0]/m.t:null,
    m3:s=>s&&s.edad?[s.edad['18-24'],(s.edad['25-44']+s.edad['45-59']+s.edad['60+'])/3]:null},
  {k:'ext',lbl:'Nacionalidad',A:'Extranjeros',B:'Chilenos',frac:m=>m.t?m.ext/m.t:null,m3:s=>s&&s.nac?[s.nac.E,s.nac.C]:null}];
function mesaOutcome(m){ const valid=Object.values(m.v).reduce((s,v)=>s+v,0);
  if(colorby.startsWith('cand:')) return valid?(m.v[colorby.slice(5)]||0)/valid:null;
  if(colorby==='nulos'){ const em=valid+(m.nb||0); return em?(m.nb||0)/em:null; } return null; }
function unitMesas(){ const cuts=unitCuts(); return (MESA[elecSel]||[]).filter(m=>m.t&&(!cuts||cuts.has(m.c))); }
function unitFrac(ms,fracFn){ let g=0,t=0; for(const m of ms){ const f=fracFn(m); if(f==null) continue; g+=f*m.t; t+=m.t; } return t?100*g/t:null; }
function fmtpp(v){ return v==null?'—':(v>0?'+':'')+v.toFixed(0)+'pp'; }
function fmtppCap(v){ if(v==null) return '—'; if(Math.abs(v)>100) return (v>0?'+':'−')+'>100pp'; return (v>0?'+':'')+v.toFixed(0)+'pp'; }
function mCard(D,F,verb,rA,rB,gap,tag,reliable,meta){
  let h=`<div class="mth-card${!reliable?' unrel':''}"><div class="sz-h">${D.lbl}</div>`;
  h+=`<div class="mth-share"><b>${D.A}</b>${F!=null?` = ${F.toFixed(0)}% del padrón`:''}${reliable?` · de ese grupo, <b>${rA.toFixed(0)}%</b> ${verb}`:''} <span class="mth-tag${meta.obs?' real':''}">${tag}</span></div>`;
  if(reliable){ h+=`<div class="mth-rates">`+
     `<div class="mrate"><span class="ml">${D.A}</span><span class="mt"><i style="width:${Math.max(0,Math.min(100,rA))}%;background:#16365a"></i></span><span class="mv">${rA.toFixed(0)}%</span></div>`+
     `<div class="mrate"><span class="ml">${D.B}</span><span class="mt"><i style="width:${Math.max(0,Math.min(100,rB))}%;background:#9aa0a6"></i></span><span class="mv">${rB.toFixed(0)}%</span></div></div>`+
     `<div class="mth-gap" style="color:${gap>=0?'#B2182B':'#2166ac'}">Sesgo ${D.A.split(' ')[0]}−${D.B.split(' ')[0]}: ${gap>0?'+':''}${gap.toFixed(0)} pp</div>`; }
  else h+=`<div class="mth-unrel">⚠ <b>Poco fiable</b> con estas mesas (grupo casi sin variación o métodos discrepan). Prueba una unidad mayor.</div>`;
  if(!meta.obs){ h+=`<div class="mth-mrow">estimaciones: <b>King</b> ${fmtppCap(meta.gapK)} · <b>Goodman</b> ${fmtppCap(meta.gapG)} · <b>LS</b> ${fmtppCap(meta.gapC)}</div>`;
    if(meta.gapK!=null){ const d=Math.abs(meta.gapK-meta.gapC); h+=`<div class="mth-conv ${d<5?'ok':d<12?'mid':'no'}">${d<5?'✓ King y LS coinciden':d<12?'~ aproximan':'✗ métodos discrepan'}</div>`; } }
  return h+`</div>`; }
// tarjeta de sesgo desde la POSTERIOR bayesiana (marginal con IC). dim={m,lo,hi}; ai/bi = índices grupo A/B
const BYMAP={muj:{d:'sexo',a:0,b:1}, jov:{d:'edad',a:0,b:1}, ext:{d:'nac',a:1,b:0}};  // nac: A=Extranjeros(1), B=Chilenos(0)
function mCardB(D,F,verb,dim,ai,bi){
  const rA=dim.m[ai], rB=dim.m[bi];
  if(rA==null||rB==null) return `<div class="mth-card"><div class="sz-h">${D.lbl}</div><div class="mth-unrel">Sin votantes de este grupo en la unidad.</div></div>`;
  const loA=dim.lo?dim.lo[ai]:null, hiA=dim.hi?dim.hi[ai]:null, wA=(hiA!=null&&loA!=null)?(hiA-loA):0;
  const loB=dim.lo?dim.lo[bi]:null, hiB=dim.hi?dim.hi[bi]:null;
  const lowBase = F!=null && F<1.5;  // grupo <1,5% del padrón (p.ej. extranjeros en comuna sin inmigración) → base muy chica, la posterior la fija el prior espacial
  const gap=rA-rB, wide=wA>=30||lowBase, pc=x=>Math.max(0,Math.min(100,x));
  const colA=mixHex('#16365a','#c9ced6',Math.min(1,(lowBase?45:wA)/50));  // desatura la barra del grupo A si el IC es ancho o la base es chica
  let h=`<div class="mth-card${wide?' unrel':''}"><div class="sz-h">${D.lbl}</div>`;
  h+=`<div class="mth-share"><b>${D.A}</b>${F!=null?` = ${F.toFixed(0)}% del padrón`:''} · de ese grupo, <b>${rA.toFixed(0)}%</b> ${verb} <span class="mth-tag">ESTIMACIÓN BAYESIANA</span></div>`;
  h+=`<div class="mth-rates">`+
     `<div class="mrate"><span class="ml">${D.A}</span><span class="mt"><i style="width:${pc(rA)}%;background:${colA}"></i></span><span class="mv">${rA.toFixed(0)}%${wA?` <span class="xg-ci">±${Math.round(wA/2)}</span>`:''}</span></div>`+
     `<div class="mrate"><span class="ml">${D.B}</span><span class="mt"><i style="width:${pc(rB)}%;background:#9aa0a6"></i></span><span class="mv">${rB.toFixed(0)}%</span></div></div>`+
     `<div class="mth-gap" style="color:${gap>=0?'#B2182B':'#2166ac'}">Sesgo ${D.A.split(' ')[0]}−${D.B.split(' ')[0]}: ${gap>0?'+':''}${gap.toFixed(0)} pp</div>`;
  if(loA!=null) h+=`<div class="mth-mrow">IC90: ${D.A.split(' ')[0]} [${loA}, ${hiA}] · ${D.B.split(' ')[0]} [${loB}, ${hiB}]</div>`;
  if(lowBase) h+=`<div class="mth-conv no">Grupo &lt;1,5% del padrón → base muy chica, estimación poco robusta (la fija el prior espacial)</div>`;
  else if(wide) h+=`<div class="mth-conv no">IC ancho → poca certeza en este grupo</div>`;
  return h+`</div>`; }
function demoCard(D,ms,s){ const F=unitFrac(ms,D.frac);
  const verb=colorby==='part'?'votó':colorby==='nulos'?'votó nulo/blanco':'votó por '+cap((TERR.candidatos[+colorby.slice(5)]||{}).ape1||'');
  if(colorby==='part'){ const m3=D.m3(s); if(!m3||m3[0]==null||m3[1]==null) return `<div class="mth-card"><div class="sz-h">${D.lbl}</div><div class="sz-hint">sin dato observado</div></div>`;
    return mCard(D,F,verb,m3[0],m3[1],m3[0]-m3[1],'observado',true,{obs:true}); }
  // 1) posterior bayesiano espacial precomputado (marginal con IC) — reemplaza King
  const by=crossBayes();
  if(by==='loading') return `<div class="mth-card"><div class="sz-h">${D.lbl}</div><div class="sz-hint">Cargando estimación bayesiana…</div></div>`;
  if(by && BYMAP[D.k] && by[BYMAP[D.k].d]) return mCardB(D,F,verb, by[BYMAP[D.k].d], BYMAP[D.k].a, BYMAP[D.k].b);
  const pts=ms.map(m=>({x:D.frac(m),y:mesaOutcome(m),w:m.t})).filter(p=>p.x!=null&&isFinite(p.x)&&p.y!=null);
  const fit=eiFit(pts); if(!fit) return `<div class="mth-card"><div class="sz-h">${D.lbl}</div><div class="sz-hint">pocas mesas</div></div>`;
  const king=kingEI(pts);
  const gapK=king?(king.A-king.B)*100:null, gapC=(fit.cA-fit.cB)*100, gapG=(fit.gA-fit.gB)*100, gEco=gapK!=null?gapK:gapC;
  const reliable=Math.abs(gEco-gapC)<12 && Math.abs(gEco)<=45 && fit.sdx>=0.008 && pts.length>=15;
  const rA=(king?king.A:fit.cA)*100, rB=(king?king.B:fit.cB)*100;
  return mCard(D,F,verb,rA,rB,gEco,reliable?'estimación (King)':'poco fiable',reliable,{gapK,gapG,gapC}); }
function renderMethods(){ const box=document.getElementById('terrside');
  box.innerHTML='<div class="mth-pad"><div class="sz-hint">Estimando a nivel de mesa…</div></div>';
  Promise.all([ensureMesa(elecSel),ensureSesgos()]).then(()=>{
    const ms=unitMesas(); const s=((SESGOS[level]||{})[unitId]||{})[elecSel];
    const ml=colorby==='part'?'la participación':colorby==='nulos'?'los blancos+nulos':'el voto de '+cap((TERR.candidatos[+colorby.slice(5)]||{}).nombre||'');
    if(colorby!=='part' && !ms.length){ box.innerHTML=`<div class="mth-pad"><div class="sz-hint">Sin datos de mesa por candidato para esta elección.</div></div>`; return; }
    let h=`<div class="mth-pad"><div class="sz-title">Sesgos de ${ml}`.replace('Sesgos de el ','Sesgos del ')+`</div>`+
      `<div class="mth-subt">${colorby==='part'?'Tasa <b>observada</b> por grupo (padrón × votantes)':'Inferencia ecológica a <b>nivel de mesa</b>'} · ${ms.length} mesas</div><div class="mth-row">`;
    DEMOS.forEach(D=>{ h+=demoCard(D,ms,s); });
    h+=`</div>`+ (colorby.startsWith('cand:')?renderCandTop():'') +`<div class="sz-note">${colorby==='part'?'<b>Observado</b>: dato oficial de quiénes votaron por grupo (SERVEL).':'<b>King</b>: inferencia ecológica a nivel de mesa (tomografía + MLE, cotas Duncan-Davis) — mismo enfoque que DecideChile. <b>Goodman</b>/<b>LS</b>: contraste. Género/edad/nacionalidad salen del padrón por mesa. Educación no está en el padrón (pendiente por censo).'} Falacia ecológica: estima grupos, no personas.</div></div>`;
    box.innerHTML=h; renderCross(ms,s);
  });
}
// ===== CRUCE género × edad (panel inferior) =====
const AGE4=['18-24','25-44','45-59','60+'];
function heatCol(v){ if(v==null) return '#eee'; const t=Math.max(0,Math.min(1,v/100)); const seq=['#eff3ff','#c6d9f0','#93b7de','#5a8fc7','#2166ac']; return seq[Math.min(4,Math.floor(t*5))]; }
function crossGrid(title,rows,note,cols){ cols=cols||AGE4;
  let h=`<div class="xg-title">${title}</div><table class="xg"><tr><th></th>${cols.map(a=>`<th>${a}</th>`).join('')}</tr>`;
  for(const rk in rows){ h+=`<tr><td class="xg-rk">${rk}</td>`+rows[rk].map(v=>{ const t=(v==null?'—':v.toFixed(0)+'%'); const c=heatCol(v);
    return `<td class="xg-c" style="background:${c};color:${v!=null&&v>60?'#fff':'#222'}">${t}</td>`; }).join('')+`</tr>`; }
  h+=`</table>`; if(note) h+=`<div class="xg-note">${note}</div>`; return h;
}
const clip01=x=>Math.max(0,Math.min(1,x));
// Cruce ESTIMADO género × (jóvenes 18-24 / 25+): modelo aditivo de los marginales validados (género y joven/mayor,
// ambos 2×2 identificables). NO estima la interacción fina (no identificable con dato agregado) → muestra la DIRECCIÓN.
function addCross(ms){ const P=ms.map(m=>({fm:m.muj/m.t, fj:m.ed[0]/m.t, y:mesaOutcome(m), w:m.t})).filter(p=>p.y!=null&&isFinite(p.y)&&p.w>0);
  const n=P.length; if(n<20) return null;
  let mw=0; for(const p of P) mw+=p.w; mw/=n; const w=P.map(p=>p.w/mw);
  let sy=0,sW=0; for(let i=0;i<n;i++){ sy+=P[i].y*w[i]; sW+=w[i]; } const o=sy/sW;
  function marg2(sel){ let A=0,B=0,C=0,d1=0,d2=0; for(let i=0;i<n;i++){ const f=sel(P[i]),g=1-f,wi=w[i]; A+=wi*f*f;B+=wi*f*g;C+=wi*g*g;d1+=wi*f*P[i].y;d2+=wi*g*P[i].y; } const det=A*C-B*B||1e-9; return [clip01((C*d1-B*d2)/det),clip01((A*d2-B*d1)/det)]; }
  const gm=marg2(p=>p.fm), am=marg2(p=>p.fj);  // gm=[Mujer,Hombre], am=[Joven,Mayor]
  // combinación en LOGIT (no aditiva lineal): evita la sobre-composición de dos efectos fuertes en celdas extremas
  const L=p=>{p=Math.max(1e-4,Math.min(1-1e-4,p)); return Math.log(p/(1-p));}, iL=x=>1/(1+Math.exp(-x));
  return [[0,0],[1,0],[0,1],[1,1]].map(([g,a])=>iL(L(gm[g])+L(am[a])-L(o))*100);  // Mj,Hj,Mm,Hm
}
// ===== cruce BAYESIANO (EI espacial precomputado) =====
function ensureCrossBayes(e){ if(CROSSB[e]!==undefined) return Promise.resolve();
  return fetch('data/cross/'+e+'.json?v='+V).then(r=>r.ok?r.json():null).then(d=>{CROSSB[e]=d;}).catch(()=>{CROSSB[e]=null;}); }
function crossBayes(){ const e=elecSel; if(!CROSSIDX[e]) return null;
  if(CROSSB[e]===undefined){ ensureCrossBayes(e).then(()=>{ if(typeof renderMethods==='function') renderMethods(); else if(_cxMs!==undefined) renderCross(_cxMs,_cxS); }); return 'loading'; }
  const D=CROSSB[e]; if(!D) return null;
  const key = colorby==='nulos'?'nulos' : colorby.startsWith('cand:')?colorby.slice(5) : null; if(key==null) return null;
  if(level==='comuna') return (D.comuna[String(unitId)]||{})[key]||null;
  if(level==='region'){ const rid=unitReg(); return rid==null?null:((D.region||{})[String(rid)]||{})[key]||null; }
  if(level==='nacional') return (D.nacional||{})[key]||null;
  const cuts=unitCuts(); if(cuts&&cuts.size) return crossBayesAgg(cuts,key,D);  // metro/distrito/circ → agrega posteriores comunales
  return null; }
// pesos por grupo por comuna desde el microdato de mesa (marginales exactas; celdas del cruce por producto)
function comunaWeights(cuts){ const W={}; const M=MESA[elecSel]||[];
  for(const m of M){ if(!m.t||(cuts&&!cuts.has(m.c))) continue; const o=W[m.c]||(W[m.c]={t:0,muj:0,jov:0,ext:0});
    o.t+=m.t; o.muj+=m.muj||0; o.jov+=(m.ed&&m.ed[0])||0; o.ext+=m.ext||0; } return W; }
// agrega las posteriores COMUNALES (media+IC) a un alcance multi-comuna (metro/distrito/circ), ponderando por votantes del grupo
function crossBayesAgg(cuts,key,D){ const W=comunaWeights(cuts); if(!Object.keys(W).length) return null;
  const Z=1.645; const dims=['cells','sexo','edad','nac'];
  const gw=o=>({cells:[o.muj*o.jov/o.t,(o.t-o.muj)*o.jov/o.t,o.muj*(o.t-o.jov)/o.t,(o.t-o.muj)*(o.t-o.jov)/o.t],
    sexo:[o.muj,o.t-o.muj], edad:[o.jov,o.t-o.jov], nac:[o.ext,o.t-o.ext]});
  const out={}; let any=false;
  for(const dim of dims){ const n=dim==='cells'?4:2; const sm=Array(n).fill(0),sw=Array(n).fill(0),sv=Array(n).fill(0);
    for(const cut in W){ const cu=D.comuna[cut]; if(!cu||!cu[key]) continue; const e=cu[key][dim]; if(!e) continue;
      const w=gw(W[cut]);
      for(let i=0;i<n;i++){ if(e.m[i]==null||!(w[dim][i]>0)) continue; const wi=w[dim][i];
        sm[i]+=e.m[i]*wi; sw[i]+=wi; const sd=(e.hi&&e.lo&&e.hi[i]!=null&&e.lo[i]!=null)?(e.hi[i]-e.lo[i])/(2*Z):0; sv[i]+=wi*wi*sd*sd; } }
    out[dim]={m:[],lo:[],hi:[]};
    for(let i=0;i<n;i++){ if(sw[i]<=0){ out[dim].m.push(null);out[dim].lo.push(null);out[dim].hi.push(null); continue; }
      any=true; const mean=sm[i]/sw[i], sd=Math.sqrt(sv[i])/sw[i];
      out[dim].m.push(+mean.toFixed(1)); out[dim].lo.push(+Math.max(0,mean-Z*sd).toFixed(1)); out[dim].hi.push(+Math.min(100,mean+Z*sd).toFixed(1)); } }
  return any?out:null; }
function hex2rgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function mixHex(a,b,t){ const A=hex2rgb(a),Bc=hex2rgb(b); return '#'+A.map((x,i)=>Math.round(x+(Bc[i]-x)*t).toString(16).padStart(2,'0')).join(''); }
function desatCol(v,width){ const k=Math.max(0,Math.min(1,(width||0)/50)); return mixHex(heatCol(v),'#e9e9e9',0.85*k); }  // IC ancho → gris → poca certeza
function cellObj(by,i){ return {m:by.m?by.m[i]:null, lo:by.lo?by.lo[i]:null, hi:by.hi?by.hi[i]:null}; }
function crossGridB(title,rows,note){ const cols=['Jóvenes 18-24','25+'];
  let h=`<div class="xg-title">${title}</div><table class="xg"><tr><th></th>${cols.map(a=>`<th>${a}</th>`).join('')}</tr>`;
  for(const rk in rows){ h+=`<tr><td class="xg-rk">${rk}</td>`+rows[rk].map(o=>{
      if(!o||o.m==null) return `<td class="xg-c" style="background:#eee">—</td>`;
      const w=(o.hi!=null&&o.lo!=null)?(o.hi-o.lo):0; const bg=desatCol(o.m,w); const dark=o.m>60&&w<25;
      const ci=(o.lo!=null)?`<span class="xg-ci">±${Math.round(w/2)}</span>`:'';
      return `<td class="xg-c" style="background:${bg};color:${dark?'#fff':'#222'}" title="IC90 [${o.lo}, ${o.hi}]">${o.m.toFixed(0)}%${ci}</td>`; }).join('')+`</tr>`; }
  h+=`</table>`; if(note) h+=`<div class="xg-note">${note}</div>`; return h; }

function crossHTML(ms,s){
  if(colorby==='part'){ const ex=s&&s.edad_x_sexo; if(!ex) return '<div class="sz-hint">Sin cruce observado.</div>';
    return crossGrid('Participación por género × edad — <b>observado</b>',
      {'Mujeres':AGE4.map(a=>ex.M?ex.M[a]:null),'Hombres':AGE4.map(a=>ex.H?ex.H[a]:null)},
      'Dato oficial (padrón × votantes): % de cada grupo que sufragó. Exacto, sin estimación.'); }
  const verb=colorby==='nulos'?'Voto nulo/blanco':'Voto de '+cap((TERR.candidatos[+colorby.slice(5)]||{}).ape1||'');
  // 1) posterior bayesiano espacial (precomputado) si existe para esta elección/unidad
  const by=crossBayes();
  if(by==='loading') return '<div class="sz-hint">Cargando estimación bayesiana…</div>';
  if(by){ const bc=by.cells||by; return crossGridB(`${verb} por género × edad — <b>estimación bayesiana</b>`,
    {'Mujeres':[cellObj(bc,0),cellObj(bc,2)],'Hombres':[cellObj(bc,1),cellObj(bc,3)]},
    '<b>Inferencia ecológica bayesiana espacial</b> (NUTS + prior de vecindad ICAR): reconcilia con el % real y propaga incertidumbre. Celda <b>desaturada</b> = intervalo de credibilidad ancho (poca certeza); <b>±N</b> = medio ancho del IC90.'); }
  // 2) fallback: aditivo-logit en vivo (elecciones sin precómputo, o niveles distrito/metro)
  const b=addCross(ms); if(!b) return '<div class="sz-hint">Pocas mesas para estimar.</div>';
  return crossGrid(`${verb} por género × edad — <b>tendencia estimada</b>`,
    {'Mujeres':[b[0],b[2]],'Hombres':[b[1],b[3]]},
    '⚠ <b>Tendencia estimada</b> (modelo aditivo de los sesgos de género y edad, por inferencia ecológica a nivel mesa). Muestra la <b>dirección</b>; la interacción fina no es identificable con el dato agregado.',
    ['Jóvenes 18-24','25+']);
}
function barzHTML(){ const cuts=unitCuts();  // barras por COMUNA (nombradas) del ámbito
  const rows=[];
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue; const v=metricVal(TERR.comuna[cut]); if(v!=null) rows.push({nom:cap((KPI.comuna[cut]||{}).nombre||cut), v}); }
  if(rows.length<2) return '<div class="sz-hint">El desglose por zona compara <b>comunas</b>. Elige un nivel mayor (región/nacional) para ver el ranking.</div>';
  rows.sort((a,b)=>b.v-a.v); const top=rows.slice(0,16); const max=Math.max(...top.map(r=>r.v),1);
  let h=`<div class="xg-title">${cap(colLabel())} por comuna · top ${top.length} de ${rows.length}</div><div class="barz">`;
  h+=top.map(r=>`<div class="barz-row"><span class="barz-n" title="${r.nom}">${r.nom}</span><span class="barz-b"><i style="width:${Math.max(2,100*r.v/max)}%"></i></span><span class="barz-v">${r.v.toFixed(1)}%</span></div>`).join('');
  return h+`</div>`;
}
function aumentoHTML(){ const r=rounds(elecSel); const ci=+colorby.slice(5); const c=TERR.candidatos[ci]||{};
  const nm=s=>(s||'').toUpperCase().trim();
  const t1=TERRCACHE[r.v1]; const i1=t1?t1.candidatos.findIndex(x=>nm(x.ape1)===nm(c.ape1)):-1;
  if(i1<0) return '<div class="sz-hint">Este candidato no estuvo en 1ª vuelta (no hay comparación).</div>';
  const cuts=unitCuts(); const rows=[];
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue;
    const v2=(TERR.comuna[cut].v[ci]||0); const u1=t1.comuna[cut]; const v1=u1?(u1.v[i1]||0):0;
    if(v1>0) rows.push({nom:cap((KPI.comuna[cut]||{}).nombre||cut), inc:100*(v2-v1)/v1, v1, v2}); }
  if(rows.length<1) return '<div class="sz-hint">Sin datos comparables.</div>';
  rows.sort((a,b)=>b.inc-a.inc); const top=rows.slice(0,16); const max=Math.max(...top.map(x=>Math.abs(x.inc)),1);
  let h=`<div class="xg-title">Aumento de votos 1ª→2ª vuelta · ${cap(c.ape1||'')} · top ${top.length} de ${rows.length}</div><div class="barz">`;
  h+=top.map(r=>`<div class="barz-row"><span class="barz-n" title="${r.nom}: ${fmtN(r.v1)}→${fmtN(r.v2)}">${r.nom}</span><span class="barz-b"><i style="width:${Math.max(2,100*Math.abs(r.inc)/max)}%;background:#2E8B57"></i></span><span class="barz-v">+${r.inc.toFixed(0)}%</span></div>`).join('');
  return h+`<div class="xg-note">Crecimiento porcentual de los votos de cada comuna entre 1ª y 2ª vuelta (absorbe a los candidatos eliminados).</div></div>`;
}
let botView='cruce'; let _cxMs, _cxS;
// torta de distribución de votos (unidad actual) con la porción del candidato mostrado destacada + KPI de sus votos
function pieKpiHTML(){ const tot=unitTotals(); const V=tot.val; if(!V||!colorby.startsWith('cand:')) return '';
  const ci=+colorby.slice(5);
  const es=Object.entries(tot.v).map(([i,v])=>({i:+i,v})).filter(e=>e.v>0).sort((a,b)=>b.v-a.v);
  const cx=68,cy=68,r=58; let a0=-Math.PI/2, paths='';
  for(const e of es){ const frac=e.v/V, a1=a0+frac*2*Math.PI, sel=e.i===ci, mid=(a0+a1)/2, off=sel?7:0;
    const ox=off*Math.cos(mid), oy=off*Math.sin(mid), large=frac>0.5?1:0;
    const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    paths+=`<path d="M${(cx+ox).toFixed(1)},${(cy+oy).toFixed(1)} L${(x0+ox).toFixed(1)},${(y0+oy).toFixed(1)} A${r},${r} 0 ${large} 1 ${(x1+ox).toFixed(1)},${(y1+oy).toFixed(1)} Z" fill="${candCol(e.i)}" opacity="${sel?1:0.5}" stroke="#fff" stroke-width="1"/>`;
    a0=a1; }
  const cand=TERR.candidatos[ci]||{}, cv=tot.v[ci]||0, pct=100*cv/V;
  return `<div class="pie-card"><svg viewBox="0 0 136 136" width="128" height="128" style="flex:none">${paths}</svg>
    <div class="pie-kpi"><div class="pk-l">Distribución del voto</div>
      <div class="pk-n" style="color:${candCol(ci)}">${fmtN(cv)}</div>
      <div class="pk-c"><b>${pct.toFixed(1)}%</b> · ${cap(cand.ape1||cand.nombre||'')}</div>
      <div class="pk-s">de ${fmtN(V)} votos válidos en ${cap(((KPI[level]||{})[unitId]||{}).nombre||'la unidad')}</div></div></div>`;
}
function renderCross(ms,s){ _cxMs=ms; _cxS=s; const box=document.getElementById('terrbottom'); if(!box) return;
  const views=[['cruce','Cruce edad×género'],['barras','Barras por zona']];
  if(hasRounds(elecSel)&&colorby.startsWith('cand:')) views.push(['aumento','Aumento 1ª→2ª']);
  if(!views.some(v=>v[0]===botView)) botView='cruce';
  let h=`<div class="bot-seg">`+views.map(([v,l])=>`<button class="trsp-b${botView===v?' on':''}" data-bv="${v}">${l}</button>`).join('')+`</div>`;
  if(botView==='aumento'){ const r=rounds(elecSel);
    if(!TERRCACHE[r.v1]){ box.innerHTML=h+'<div class="sz-hint">Cargando 1ª vuelta…</div>'; fetchTerr(r.v1).then(()=>renderCross(ms,s)); return; }
    h+=aumentoHTML(); }
  else if(botView==='barras') h+=barzHTML();
  else { const pie=colorby.startsWith('cand:')?pieKpiHTML():'';
    h+= pie ? `<div class="bot-2col"><div class="bc-l">${crossHTML(ms,s)}</div><div class="bc-r">${pie}</div></div>` : crossHTML(ms,s); }
  box.innerHTML=h;
  box.querySelectorAll('.bot-seg .trsp-b').forEach(b=>b.onclick=()=>{ botView=b.dataset.bv; renderCross(ms,s); });
}
function renderRight(geo,feats,idp,data){
  const tb=document.getElementById('terrbottom'); if(tb) tb.innerHTML='';  // el cruce solo aparece en sesgos
  if(colorby==='traspaso') return renderTraspaso();
  if(colorby==='part'||colorby==='nulos'||colorby.startsWith('cand:')) return renderMethods();
  return renderSummary(geo,feats,idp,data); }

// ===== TRASPASO DE VOTOS 1ª→2ª vuelta (matriz de transición + Sankey) =====
let TRASP={};
function traspKey(){ const r=rounds(elecSel); return r.v1&&r.v2?r.v1+'__'+r.v2:null; }
function ensureTrasp(k){ if(TRASP[k]!==undefined) return Promise.resolve();
  return fetch('data/traspaso/'+k+'.json?v='+V).then(r=>r.ok?r.json():null).then(d=>{TRASP[k]=d;}).catch(()=>{TRASP[k]=null;}); }
function unitReg(){ const cuts=unitCuts(); const any=cuts&&[...cuts][0]; return any?Math.floor(any/1000):null; }
function traspUnit(d){ // devuelve {u,nivel,nota,r1l,r2l} para la unidad seleccionada
  if(!d) return null;
  if(d.tipo==='gobernadores'){ const rg=d.regions||{};   // carrera por REGIÓN
    const rid = level==='nacional'?null:unitReg();
    if(rid==null) return {nivel:'país',nota:'El traspaso de gobernadores es por <b>región</b> (cada región es su propia carrera). Elige una región o comuna.'};
    const u=rg[String(rid)];
    if(!u) return {nivel:'región',nota:'Esta región no tuvo 2ª vuelta de gobernador.'};
    return {u,nivel:'región',r1l:u.r1_labels,r2l:u.r2_labels}; }
  const lv=d.levels;
  if(level==='nacional') return {u:lv.nacional&&lv.nacional['CL'],nivel:'país',r1l:d.r1_labels,r2l:d.r2_labels};
  if(level==='comuna') return {u:lv.comuna&&lv.comuna[String(unitId)],nivel:'comuna',r1l:d.r1_labels,r2l:d.r2_labels};
  if(level==='region'){ const rid=unitReg(); return {u:rid!=null&&lv.region&&lv.region[String(rid)],nivel:'región',r1l:d.r1_labels,r2l:d.r2_labels}; }
  return {u:lv.nacional&&lv.nacional['CL'],nivel:'país',nota:'No desagregado a este nivel; se muestra el total nacional.',r1l:d.r1_labels,r2l:d.r2_labels}; }
let traspSeg='total';
function renderTraspaso(){ const box=document.getElementById('terrside'); const k=traspKey();
  if(!k){ box.innerHTML='<div class="mth-pad"><div class="sz-hint">Sin par de vueltas para esta elección.</div></div>'; return; }
  box.innerHTML='<div class="mth-pad"><div class="sz-hint">Cargando traspaso…</div></div>';
  ensureTrasp(k).then(()=>{ const d=TRASP[k];
    if(!d){ box.innerHTML='<div class="mth-pad"><div class="sz-hint">Datos de traspaso no disponibles.</div></div>'; return; }
    const tu=traspUnit(d);
    if(!tu){ box.innerHTML=`<div class="mth-pad"><div class="sz-hint">Sin estimación de traspaso.</div></div>`; return; }
    if(!tu.u){ box.innerHTML=`<div class="mth-pad"><div class="sz-title">Traspaso de votos 1ª → 2ª vuelta</div><div class="sz-hint" style="margin-top:8px">${tu.nota||'Sin estimación de traspaso para esta unidad (pocas mesas).'}</div></div>`; return; }
    const r=rounds(elecSel);
    const canSeg = level==='nacional' && d.strata;  // estratos solo a nivel país
    if(!canSeg) traspSeg='total';
    let h=`<div class="mth-pad"><div class="sz-title">Traspaso de votos 1ª → 2ª vuelta</div>`+
      `<div class="mth-subt">${elecInfo(r.v1).label} ${elecInfo(r.v1).year} → 2ª vuelta · ${cap(((KPI[level]||{})[unitId]||{}).nombre||'')} · a nivel <b>${tu.nivel}</b></div>`;
    if(canSeg) h+=`<div class="trsp-seg">`+[['total','Total'],['edad','Por edad'],['genero','Por género']]
      .map(([v,l])=>`<button class="trsp-b${traspSeg===v?' on':''}" data-seg="${v}">${l}</button>`).join('')+`</div>`;
    if(traspSeg==='total'){
      h+=sankeySVG(tu.r1l,tu.r2l,tu.u.T,tu.u.r1);
    } else {
      const sg=d.strata[traspSeg], co=sg.corte;
      const parts = traspSeg==='edad'
        ? [['jovenes',`Áreas más jóvenes (≥${co}% menores de 30)`],['mayores',`Áreas más mayores (<${co}%)`]]
        : [['mujeres',`Áreas con más mujeres (≥${co}%)`],['hombres',`Áreas con más hombres (<${co}%)`]];
      for(const [key,sub] of parts){ const s=sg[key]; if(!s) continue;
        h+=`<div class="trsp-strat"><div class="trsp-sub">${sub}</div>`+sankeySVG(tu.r1l,tu.r2l,s.T,s.r1)+`</div>`; }
    }
    h+=`<div class="sz-note">Estimación por <b>inferencia ecológica R×C a nivel mesa</b> (cada origen reparte 100%). Base = padrón → la <b>abstención</b> es categoría. ${traspSeg!=='total'?'<b>Segmentado ecológicamente</b>: compara el traspaso entre <b>zonas</b> según su composición etaria/de género — describe territorios, no el voto de personas (falacia ecológica).':'Estimación agregada, no voto individual.'}${tu.nota?' '+tu.nota:''}</div></div>`;
    box.innerHTML=h;
    if(canSeg) box.querySelectorAll('.trsp-b').forEach(b=>b.onclick=()=>{ traspSeg=b.dataset.seg; renderTraspaso(); });
  });
}
function traspColor(i,ncand){ return i<ncand?candCol(i):(i===ncand?'#9aa0a6':'#c8ccd0'); } // cand / nulo / abstención
function sankeySVG(r1l,r2l,T,r1){
  const W=344, padT=8, nodeW=9, gap=6, lblL=78, lblR=78;
  const x0=lblL, x1=W-lblR;                     // banda entre columnas
  const total=r1.reduce((s,v)=>s+v,0)||1;
  // valores destino
  const R1=r1l.length, R2=r2l.length;
  const colTot=r2l.map((_,j)=>r1.reduce((s,_,i)=>s+r1[i]*T[i][j],0));
  const totR2=colTot.reduce((s,v)=>s+v,0)||1;
  // filtrar orígenes/destinos con peso ínfimo
  const srcIdx=r1l.map((_,i)=>i).filter(i=>r1[i]/total>=0.01);
  const dstIdx=r2l.map((_,j)=>j).filter(j=>colTot[j]/totR2>=0.005);
  const H=Math.max(240, srcIdx.length*30);
  const usableL=H-2*padT-(srcIdx.length-1)*gap, usableR=H-2*padT-(dstIdx.length-1)*gap;
  const sc=(H-2*padT-(srcIdx.length-1)*gap)/total, scR=(H-2*padT-(dstIdx.length-1)*gap)/totR2;
  // posiciones verticales de nodos
  const ncand1=R1-2, ncand2=R2-2;
  let y=padT; const posL={}; srcIdx.forEach(i=>{ const hgt=Math.max(2,r1[i]*sc); posL[i]={y,h:hgt,off:0}; y+=hgt+gap; });
  y=padT; const posR={}; dstIdx.forEach(j=>{ const hgt=Math.max(2,colTot[j]*scR); posR[j]={y,h:hgt,off:0}; y+=hgt+gap; });
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin:6px 0">`;
  // flujos (ordenados por destino para apilar limpio)
  const flows=[];
  srcIdx.forEach(i=>dstIdx.forEach(j=>{ const val=r1[i]*T[i][j]; if(val/total>=0.004) flows.push({i,j,val}); }));
  flows.sort((a,b)=> a.i-b.i || a.j-b.j);
  // apilar en origen por j asc, en destino por i asc
  flows.forEach(fl=>{
    const L=posL[fl.i], R=posR[fl.j]; const wL=fl.val*sc, wR=fl.val*scR;
    const y1=L.y+L.off+wL/2, y2=R.y+R.off+wR/2; L.off+=wL; R.off+=wR;
    const xm=(x0+x1)/2;
    s+=`<path d="M${x0} ${y1} C${xm} ${y1} ${xm} ${y2} ${x1} ${y2}" fill="none" stroke="${traspColor(fl.i,ncand1)}" stroke-width="${Math.max(1,fl.val*sc)}" stroke-opacity="0.42"/>`;
  });
  // nodos + etiquetas
  const short=l=>{ l=cap(l); return l.length>13?l.slice(0,12)+'…':l; };
  srcIdx.forEach(i=>{ const p=posL[i];
    s+=`<rect x="${x0-nodeW}" y="${p.y}" width="${nodeW}" height="${p.h}" fill="${traspColor(i,ncand1)}" rx="2"/>`;
    s+=`<text x="${x0-nodeW-4}" y="${p.y+p.h/2+3}" text-anchor="end" font-size="9.5" fill="#333">${short(r1l[i])}</text>`;
    s+=`<text x="${x0-nodeW-4}" y="${p.y+p.h/2+13}" text-anchor="end" font-size="8" fill="#999">${(100*r1[i]/total).toFixed(0)}%</text>`; });
  dstIdx.forEach(j=>{ const p=posR[j];
    s+=`<rect x="${x1}" y="${p.y}" width="${nodeW}" height="${p.h}" fill="${traspColor(j,ncand2)}" rx="2"/>`;
    s+=`<text x="${x1+nodeW+4}" y="${p.y+p.h/2+3}" text-anchor="start" font-size="9.5" fill="#333">${short(r2l[j])}</text>`;
    s+=`<text x="${x1+nodeW+4}" y="${p.y+p.h/2+13}" text-anchor="start" font-size="8" fill="#999">${(100*colTot[j]/totR2).toFixed(0)}%</text>`; });
  return s+`</svg>`;
}
function subName(f,geo){ return geo==='manzana'?'Manzana (hereda del local)':geo==='local'?(f.properties.recinto||'Local'):geo==='distrito'?('Distrito '+f.properties.distrito_num):geo==='region'?cap(f.properties.region||''):cap(f.properties.comuna||''); }
function renderCandTop(){ // top 10 comunas por % y por votos totales del candidato (a lo largo de Chile)
  const ci=+colorby.slice(5); const rows=[];
  for(const cut in TERR.comuna){ const u=TERR.comuna[cut]; if(!u||!u.val) continue; const v=u.v[ci]||0;
    rows.push({nom:cap((KPI.comuna[cut]||{}).nombre||cut), pct:100*v/u.val, vot:v}); }
  if(!rows.length) return '';
  const li=(arr,fmt)=>arr.map(r=>`<div class="tl-row"><span class="tl-c">${r.nom}</span><span class="tl-v">${fmt(r)}</span></div>`).join('');
  const byPct=[...rows].sort((a,b)=>b.pct-a.pct).slice(0,10), byVot=[...rows].sort((a,b)=>b.vot-a.vot).slice(0,10);
  return `<div class="mth-card" style="min-width:0"><div class="sz-h">Top 10 comunas · ${cap((TERR.candidatos[ci]||{}).ape1||'')}</div>
    <div class="tl-2"><div><div class="tl-h">Por % en la comuna</div>${li(byPct,r=>r.pct.toFixed(1)+'%')}</div>
    <div><div class="tl-h">Por votos totales</div>${li(byVot,r=>fmtN(r.vot))}</div></div></div>`;
}
function popupSub(f,geo,idp,data){ const u=data[String(f.properties[idp])]; const w=u&&winnerOf(u);
  let h=`<b>${subName(f,geo)}</b><br>`;
  if(colorby==='swing'||colorby==='split'){ const dv=DIVMAP[+f.properties.cut];
    h+=(dv==null?'<span style="color:#888">sin comparable</span>':`${colorby==='swing'?'Swing':'Voto cruzado'}: <b>${dv>0?'+':''}${dv.toFixed(1)} pp</b> ${dv>0?'→ derecha':dv<0?'→ izquierda':''}<br><span style="color:#888">vs ${DIVREF?elecInfo(DIVREF).label+' '+elecInfo(DIVREF).year:'—'}</span>`)+'<br>'; }
  if(colorby==='consist'){ const cv=CONSIST[String(idOf(f))]; h+=(cv==null?'<span style="color:#888">sin comparable</span>':(cv?'<b>Mismo bloque</b> ganó 1ª y 2ª vuelta':'<b>Cambió de bloque</b> entre vueltas'))+'<br>'; }
  if(colorby==='conf'){ const o=confRec(f);
    if(!o) return h+'<span style="color:#888">sin dato de confiabilidad</span>';
    h+=`Confiabilidad geográfica: <b>${o.conf}/100</b><br>`;
    if(o.agg){ h+=`<span style="color:#888">promedio de ${o.agg} comunas</span>`; return h; }
    h+=`<span style="color:#888">Arraigo padrón/residentes: <b>${o.vol==null?'—':o.vol}</b>`+
       `${o.r!=null?` (×${o.r} vs mediana país)`:''}<br>`+
       `Composición (extranjeros): <b>${o.comp}</b> · brecha ${o.gap_ext}pp<br>`+
       `${o.ins!=null?fmtN(o.ins)+' inscritos · ':''}${fmtN(o.pobr)} residentes censados</span>`; return h; }
  if(!u||!w) return h+(colorby==='swing'||colorby==='split'||colorby==='consist'?'':'sin resultado');
  const top=Object.entries(u.v).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([i,vs])=>`${cap(TERR.candidatos[+i].nombre)}: <b>${(100*vs/u.val).toFixed(1)}%</b> · ${fmtN(vs)} votos`).join('<br>');
  const emit=u.val+(u.nb||0);
  h+=top+`<br><span style="color:#888">Participación: ${u.part??'—'}% · ${fmtN(emit)} votaron</span>`; return h; }
function unitTotals(){ const cuts=unitCuts(); const agg={}; let val=0,nb=0;
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue; const u=TERR.comuna[cut]; val+=u.val; nb+=(u.nb||0); for(const i in u.v) agg[i]=(agg[i]||0)+u.v[i]; }
  return {val,nb,v:agg}; }
function renderSummary(geo,feats,idp,data){ const o=(KPI[level]||{})[unitId]||{}; const tot=unitTotals(); const emit=tot.val+(tot.nb||0);
  let h=`<div class="mth-pad"><div class="ts-tot"><div class="ts-h">${cap(o.nombre||'')}</div>
    <div class="mth-subt">${TERR.meta.label} ${elecInfo(elecSel).year} · <b>${fmtN(emit)}</b> votaron · ${fmtN(tot.val)} válidos</div>`;
  const ranked=Object.entries(tot.v).sort((a,b)=>b[1]-a[1]).slice(0,12);
  h+=ranked.map(([i,vs])=>{ const c=TERR.candidatos[+i]; const pct=100*vs/tot.val;
    return `<div class="ts-row"><span class="ts-name">${cap(c.nombre)}</span><span class="ts-bar"><i style="width:${pct}%;background:${candCol(+i)}"></i></span><span class="ts-pct">${pct.toFixed(1)}%<span class="ts-vot">${fmtN(vs)}</span></span></div>`; }).join('');
  h+=`</div><div class="sz-note" style="margin-top:10px">Elige <b>Participación</b>, <b>un candidato</b> o <b>Blancos+nulos</b> para estimar los sesgos demográficos por grupo.</div></div>`;
  document.getElementById('terrside').innerHTML=h; }
function colLabel(){ if(colorby==='winner') return 'ganador'; if(colorby==='part') return 'participación';
  if(colorby==='margen') return 'competitividad (margen 1º–2º lugar)'; if(colorby==='nulos') return 'blancos + nulos';
  if(colorby==='consist') return 'consistencia 1ª/2ª vuelta';
  if(colorby==='swing') return 'swing vs '+(DIVREF?elecInfo(DIVREF).year:'anterior');
  if(colorby==='split') return 'voto cruzado vs '+(DIVREF?cap(elecInfo(DIVREF).label):'—');
  if(colorby==='traspaso') return 'ganador (fondo) — traspaso en el panel';
  if(colorby==='conf') return 'confiabilidad geográfica (padrón vs residentes)';
  return '% '+cap(TERR.candidatos[+colorby.slice(5)].nombre); }
function renderResumen(geo,n){ const o=(KPI[level]||{})[unitId]||{};
  let extra='';
  if(colorby==='consist'&&CONSIST_PCT!=null){ const r=rounds(elecSel);
    extra=`<div class="r-hint"><b>${CONSIST_PCT}%</b> de ${granName(geo)} mantuvieron el bloque ganador entre 1ª y 2ª vuelta; el resto cambió. Compara ${elecInfo(r.v1).label} y ${elecInfo(r.v2).label} ${elecInfo(r.v2).year}.</div>`; }
  else if(colorby==='conf'){ extra=`<div class="r-hint">Compara la composición de <b>quienes votan</b> (padrón + descripción de mesa) con la de <b>quienes viven</b> (Censo 2024, manzanas del polígono). <b style="color:${CONFRAMP[4]}">Verde</b> = coinciden → el análisis geográfico es fiable; <b style="color:${CONFRAMP[0]}">rojo</b> = el domicilio del padrón está desactualizado → interpreta con cautela. Clic en un polígono para el desglose.</div>`; }
  else extra=`<div class="r-hint">Máxima desagregación disponible para esta elección. Clic en una unidad para el detalle.</div>`;
  if(colorby!=='conf'&&TERR.meta.has_local&&AREAS&&level!=='comuna')
    extra+=`<div class="r-hint" style="color:var(--ac,#2a6)"><b>Entra a una comuna</b> (clic en el mapa o menú Comuna) para desagregar a <b>Manzana</b> (observado y estimativa).</div>`;
  if(chartType==='barras'){ if(!barsApplicable()) extra+=`<div class="r-hint" style="color:var(--or)">Las barras verticales aplican a indicadores numéricos (participación, % candidato, blancos+nulos, margen). El indicador actual es categórico → se muestra coropleta.</div>`;
    else if(n>700) extra+=`<div class="r-hint" style="color:var(--or)">Demasiadas sub-unidades para barras; usa granularidad <b>Comuna</b>/<b>Distrito</b>.</div>`; }
  document.getElementById('resumen').innerHTML=`<div class="r-com">${cap(o.nombre||'')}</div>`+
    `<div class="r-el">${TERR.meta.label} ${elecInfo(elecSel).year}</div>`+
    `${n} ${granName(geo)} · coloreado por <b>${colLabel()}</b>.`+extra; }
function renderLeg(){ const el=document.getElementById('leg2');
  if(colorby==='consist'){ el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">Consistencia 1ª/2ª vuelta</span>`+
      `<span class="lg"><i style="background:#3F8E86"></i>mismo bloque</span><span class="lg"><i style="background:#C55A11"></i>cambió de bloque</span>`; return; }
  if(colorby==='swing'||colorby==='split'){ const m=(seqRange&&seqRange.abs)||10;
    el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">${colLabel()} (pp)</span>`+
      `<span class="lg"><i style="background:#2166ac"></i>← izq. −${m.toFixed(0)}</span>`+
      `<span class="lg"><i style="background:#f7f7f7;border:1px solid #ccc"></i>0</span>`+
      `<span class="lg"><i style="background:#b2182b"></i>der. +${m.toFixed(0)} →</span>`; return; }
  if(colorby==='conf'){ el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">Confiabilidad geográfica</span>`+
      `<span class="lg"><i style="background:${CONFRAMP[0]}"></i>0 · distorsión</span>`+
      CONFRAMP.slice(1,4).map(c=>`<span class="lg"><i style="background:${c}"></i></span>`).join('')+
      `<span class="lg"><i style="background:${CONFRAMP[4]}"></i>100 · fiable</span>`; return; }
  if(colorby==='traspaso'&&traspView==='transfer'&&TRANSFERFIN){ const n=c=>cap(c.ape1||c.nombre||'');
    el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">Transferencia 1ª→2ª · quién lidera</span>`+
      `<span class="lg"><i style="background:${TRANSFERFIN.col1}"></i>${n(TRANSFERFIN.c1)}</span>`+
      `<span class="lg"><i style="background:${TRANSFERFIN.col2}"></i>${n(TRANSFERFIN.c2)}</span>`+
      `<span class="lg" style="width:100%;color:#888;font-size:11px">Mueve el slider: 1ª = base ideológica · 2ª = resultado real</span>`; return; }
  if(colorby==='traspaso'&&traspView==='aumento'){ const r=rounds(elecSel); const T2=TERRCACHE[r.v2];
    const fin=T2?[...T2.candidatos].sort((a,b)=>b.vn-a.vn).slice(0,2):[];
    el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">Aumento de votos 1ª→2ª por finalista</span>`+
      fin.map(c=>`<span class="lg"><i style="background:${colOfCand(c)}"></i>${cap(c.ape1||c.nombre||'')}</span>`).join('')+
      `<span class="lg" style="width:100%;color:#888">2 barras por zona · altura ∝ % de aumento de sus votos · fondo = ganador 2ª</span>`; return; }
  if(colorby==='winner'||colorby==='traspaso'){ const used={}; Object.keys(TERR.local||TERR.comuna).length;
    // leyenda por bloque + opciones presentes (el mapa muestra el ganador de fondo; el traspaso va en el panel)
    el.innerHTML=Object.entries(BLOQCOL).map(([b,c])=>`<span class="lg"><i style="background:${c}"></i>${b}</span>`).join('')
      +'<span class="lg"><i style="background:#3F8E86"></i>Apruebo</span><span class="lg"><i style="background:#C55A11"></i>Rechazo</span>';
  } else { const r=seqRange||{}; const suf=colorby==='margen'?'pp':'%'; const f=v=>v==null?'—':v.toFixed(colorby==='part'?0:1)+suf;
    el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">${colLabel()}</span>`+
      SEQ.map((c,i)=>`<span class="lg"><i style="background:${c}"></i>${i===0?f(r.lo):i===4?f(r.hi):''}</span>`).join(''); } }

// =================== MÓDULO Análisis tendencial ===================
const TSERIES=[{k:'presidencial_1v',lbl:'Presidencial'},{k:'diputados',lbl:'Diputados'},{k:'senadores',lbl:'Senadores'},
  {k:'alcaldes',lbl:'Alcaldes'},{k:'gobernadores_1v',lbl:'Gobernadores'},{k:'cores',lbl:'Cons. Reg.'},{k:'constitucional',lbl:'Constitucional'}];
const BLOC_ORDER=['Izquierda','Centro-izquierda','Centro','Populista/Otro','Centro-derecha','Derecha','Derecha radical'];
let TEND={}, TENDNAC=null, tserie='presidencial_1v'; const TENDCACHE={};
function ensureTend(){ const need=[];
  if(!TENDCACHE[level]) need.push(fetch('data/tendencia/'+level+'.json?v='+V).then(r=>r.json()).then(d=>{TENDCACHE[level]=d;}));
  if(!TENDNAC) need.push(fetch('data/tendencia/nacional.json?v='+V).then(r=>r.json()).then(d=>{TENDNAC=d;}));
  return Promise.all(need).then(()=>{ TEND=TENDCACHE; }); }
function famMatch(k){ return k==='constitucional'? e=>/convencion|consejo|plebiscito/.test(e) : e=>e.includes(k); }
function famPoints(ser,k){ if(!ser) return []; const m=famMatch(k);
  return Object.keys(ser).filter(m).sort().map(e=>Object.assign({e,y:ser[e].y},ser[e])); }
function renderD(){ const p=document.getElementById('panelD');
  p.innerHTML='<div class="mod-pad">Cargando series…</div>';
  ensureTend().then(()=>{
    const ser=(TENDCACHE[level]||{})[unitId]; const o=(KPI[level]||{})[unitId]||{};
    // qué series (tipos) existen para esta unidad
    const avail=TSERIES.filter(s=>famPoints(ser,s.k).length>0);
    if(!avail.find(s=>s.k===tserie)) tserie=(avail[0]||{k:'presidencial_1v'}).k;
    let h=`<div class="mod-pad"><div class="c-head"><div><div class="c-name">${cap(o.nombre||'')}</div>
      <div class="c-meta">Evolución electoral · ${LEVELS.find(x=>x.k===level).lbl}</div></div></div>`;
    h+=`<div class="td-fam">`+avail.map(s=>`<button class="td-fbtn${s.k===tserie?' on':''}" data-k="${s.k}">${s.lbl}</button>`).join('')+`</div>`;
    h+=`<div id="td-charts"></div></div>`;
    p.innerHTML=h;
    p.querySelectorAll('.td-fbtn').forEach(b=>b.onclick=()=>{ tserie=b.dataset.k; renderD(); });
    drawTendCharts(ser);
  }); }
function drawTendCharts(ser){ const box=document.getElementById('td-charts'); if(!box) return;
  const pts=famPoints(ser,tserie); const nacpts=famPoints(TENDNAC&&TENDNAC.CL,tserie);
  if(pts.length<1){ box.innerHTML='<div class="td-empty">Sin datos de esta elección para la unidad.</div>'; return; }
  const isNac=level==='nacional';
  const divider=firstObl(pts);
  let h='';
  // 1) Participación
  h+=chartBlock('Participación', 'Voto voluntario hasta 2021 · obligatorio desde 2022',
     lineSVG(pts.map(p=>({x:p.y,v:p.part})), {ymin:0,ymax:100,color:'#16365a',suf:'%',divider,
       bench:isNac?null:nacpts.map(p=>({x:p.y,v:p.part})), benchLbl:'País'}));
  // 2) Eje izquierda-derecha
  h+=chartBlock('Eje izquierda–derecha (0–10)', 'Media ponderada por votos; ↑ = más a la derecha',
     lineSVG(pts.map(p=>({x:p.y,v:p.eje})), {ymin:0,ymax:10,color:'#C55A11',suf:'',dec:2,
       bench:isNac?null:nacpts.map(p=>({x:p.y,v:p.eje})), benchLbl:'País'}));
  // 3) Share por bloque
  h+=chartBlock('Composición por bloque', 'Porcentaje de votos válidos por bloque ideológico', stackSVG(pts));
  // 4) Tabla resumen (NEP + volatilidad)
  h+=`<div class="td-card"><div class="td-h">Índices por elección</div><table class="td-tab"><thead><tr>
      <th>Año</th><th>Particip.</th><th>Eje</th><th>N.E. cand.</th><th>Volatilidad</th></tr></thead><tbody>`;
  h+=pts.map(p=>`<tr><td>${p.y}</td><td>${p.part==null?'—':p.part+'%'}</td><td>${p.eje==null?'—':p.eje}</td>
      <td>${p.nep==null?'—':p.nep}</td><td>${p.vol==null?'—':p.vol}</td></tr>`).join('');
  h+=`</tbody></table><div class="td-foot">Volatilidad de Pedersen (sobre bloques) respecto de la elección anterior del mismo tipo. N.E. = número efectivo (Laakso-Taagepera).</div></div>`;
  box.innerHTML=h;
}
function firstObl(pts){ for(const p of pts) if(+p.y>=2022) return p.y; return null; }
function chartBlock(title,sub,svg){ return `<div class="td-card"><div class="td-h">${title}</div><div class="td-sub">${sub}</div>${svg}</div>`; }
function lineSVG(data,opt){ const W=560,H=180,mL=40,mR=14,mT=12,mB=26; const iw=W-mL-mR, ih=H-mT-mB;
  const dd=data.filter(d=>d.v!=null); if(!dd.length) return '<div class="td-empty">Sin datos.</div>';
  const n=data.length; const X=i=> mL + (n<=1? iw/2 : iw*i/(n-1)); const Y=v=> mT + ih*(1-(v-opt.ymin)/(opt.ymax-opt.ymin));
  const fmt=v=>v==null?'':(opt.dec?v.toFixed(opt.dec):Math.round(v))+ (opt.suf||'');
  let s=`<svg viewBox="0 0 ${W} ${H}" class="td-svg" preserveAspectRatio="xMidYMid meet">`;
  // grid + eje Y
  for(let g=0;g<=4;g++){ const val=opt.ymin+(opt.ymax-opt.ymin)*g/4, y=Y(val);
    s+=`<line x1="${mL}" y1="${y}" x2="${W-mR}" y2="${y}" stroke="#eef1f5"/>`;
    s+=`<text x="${mL-5}" y="${y+3}" text-anchor="end" class="td-ax">${opt.dec?val.toFixed(1):Math.round(val)}</text>`; }
  // divider régimen
  if(opt.divider){ const di=data.findIndex(d=>d.x===opt.divider); if(di>0){ const x=(X(di)+X(di-1))/2;
    s+=`<line x1="${x}" y1="${mT}" x2="${x}" y2="${mT+ih}" stroke="#C55A11" stroke-dasharray="3 3" opacity=".7"/>`;
    s+=`<text x="${x+3}" y="${mT+9}" class="td-ax" fill="#C55A11">obligatorio</text>`; } }
  // benchmark
  if(opt.bench){ const b=opt.bench; let path=''; b.forEach((d,i)=>{ if(d.v==null) return; path+=(path?'L':'M')+X(i)+' '+Y(d.v); });
    if(path) s+=`<path d="${path}" fill="none" stroke="#9aa0a6" stroke-width="1.5" stroke-dasharray="4 3"/>`; }
  // línea principal
  let path=''; data.forEach((d,i)=>{ if(d.v==null) return; path+=(path?'L':'M')+X(i)+' '+Y(d.v); });
  s+=`<path d="${path}" fill="none" stroke="${opt.color}" stroke-width="2.4"/>`;
  data.forEach((d,i)=>{ if(d.v==null) return; s+=`<circle cx="${X(i)}" cy="${Y(d.v)}" r="3.4" fill="${opt.color}"/>`+
    `<text x="${X(i)}" y="${Y(d.v)-8}" text-anchor="middle" class="td-val">${fmt(d.v)}</text>`; });
  // eje X
  data.forEach((d,i)=> s+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle" class="td-ax">${d.x}</text>`);
  if(opt.bench) s+=`<text x="${W-mR}" y="${mT+8}" text-anchor="end" class="td-ax" fill="#9aa0a6">- - ${opt.benchLbl}</text>`;
  return s+'</svg>'; }
function stackSVG(pts){ const W=560,H=180,mL=40,mR=14,mT=12,mB=26; const iw=W-mL-mR, ih=H-mT-mB;
  const n=pts.length; const bw=Math.min(46, iw/n*0.62); const X=i=> mL + (n<=1? iw/2 : iw*i/(n-1));
  let s=`<svg viewBox="0 0 ${W} ${H}" class="td-svg" preserveAspectRatio="xMidYMid meet">`;
  for(let g=0;g<=4;g++){ const y=mT+ih*g/4; s+=`<line x1="${mL}" y1="${y}" x2="${W-mR}" y2="${y}" stroke="#eef1f5"/>`+
    `<text x="${mL-5}" y="${y+3}" text-anchor="end" class="td-ax">${100-g*25}</text>`; }
  pts.forEach((p,i)=>{ const bl=p.bl||{}; let acc=0; const x=X(i)-bw/2;
    BLOC_ORDER.forEach(b=>{ const v=bl[b]; if(!v) return; const hgt=ih*v/100; const y=mT+ih-(acc+hgt)/1*1;
      s+=`<rect x="${x}" y="${mT+ih-(acc+hgt)}" width="${bw}" height="${hgt}" fill="${BLOQCOL[b]}"><title>${b}: ${v}%</title></rect>`; acc+=hgt; });
    s+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle" class="td-ax">${p.y}</text>`; });
  s+='</svg>';
  s+=`<div class="td-leg">`+BLOC_ORDER.map(b=>`<span class="lg"><i style="background:${BLOQCOL[b]}"></i>${b}</span>`).join('')+`</div>`;
  return s; }

// =================== MÓDULO Drivers (qué explica el voto) ===================
const DRV=[{k:'escol',lbl:'Escolaridad'},{k:'casen_ing_pc',lbl:'Ingreso p/cápita'},{k:'casen_pobreza_pct',lbl:'Pobreza %'},
  {k:'pct_terciaria',lbl:'Educ. superior %'},{k:'pct_inmig',lbl:'Inmigrantes %'},{k:'pct_60mas',lbl:'60+ años %'},
  {k:'pct_a1829',lbl:'Jóvenes 18-29 %'},{k:'nse_score',lbl:'NSE (score)'},{k:'dens_hab_ha',lbl:'Densidad'},{k:'pct_activa',lbl:'Ocupación %'}];
const ROUT=[{k:'netpos',lbl:'Balance derecha − izquierda (pp)'},{k:'eje',lbl:'Eje izquierda–derecha (0–10)'},{k:'part',lbl:'Participación (%)'}];
const REGK=['escol','casen_ing_pc','casen_pobreza_pct','pct_inmig','pct_60mas','pct_a1829','dens_hab_ha','pct_activa']; // subconjunto no redundante para OLS
let VECINOS=null, rout='netpos', rdrv=null;
function ensureVecinos(){ if(VECINOS) return Promise.resolve();
  return fetch('data/comuna_vecinos.json?v='+V).then(r=>r.json()).then(d=>{VECINOS=d;}); }
function outcomeVal(cut){ const s=(TENDCACHE['comuna']||{})[String(cut)]; const d=s&&s[elecSel]; if(!d) return null;
  if(rout==='netpos') return netPos(d.bl); if(rout==='eje') return d.eje??null; return d.part??null; }
// estadística
function mean(a){ return a.reduce((s,v)=>s+v,0)/a.length; }
function sd(a){ const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1))||1; }
function pearson(x,y){ const n=x.length; if(n<3) return null; const mx=mean(x),my=mean(y);
  let sxy=0,sx=0,sy=0; for(let i=0;i<n;i++){ const a=x[i]-mx,b=y[i]-my; sxy+=a*b; sx+=a*a; sy+=b*b; }
  return (sx&&sy)? sxy/Math.sqrt(sx*sy) : null; }
function transpose(M){ return M[0].map((_,j)=>M.map(r=>r[j])); }
function mul(A,B){ const Bt=transpose(B); return A.map(r=>Bt.map(c=>r.reduce((s,v,i)=>s+v*c[i],0))); }
function inv(A){ const n=A.length; const M=A.map((r,i)=>r.concat(Array.from({length:n},(_,j)=>i===j?1:0)));
  for(let i=0;i<n;i++){ let p=i; for(let r=i+1;r<n;r++) if(Math.abs(M[r][i])>Math.abs(M[p][i])) p=r;
    if(Math.abs(M[p][i])<1e-9) return null; [M[i],M[p]]=[M[p],M[i]]; const d=M[i][i];
    for(let j=0;j<2*n;j++) M[i][j]/=d;
    for(let r=0;r<n;r++){ if(r===i) continue; const f=M[r][i]; for(let j=0;j<2*n;j++) M[r][j]-=f*M[i][j]; } }
  return M.map(r=>r.slice(n)); }
function olsFit(rows,names){ const D=rows.filter(r=>r.y!=null && names.every(k=>r.x[k]!=null)); const n=D.length;
  if(n<names.length+3) return null;
  const ys=D.map(r=>r.y), ym=mean(ys), ysd=sd(ys);
  const col=names.map(k=>{ const v=D.map(r=>r.x[k]); return {m:mean(v),s:sd(v)}; });
  const y=ys.map(v=>(v-ym)/ysd);
  const X=D.map(r=>[1].concat(names.map((k,j)=>(r.x[k]-col[j].m)/col[j].s)));
  const XtX=mul(transpose(X),X); const lam=n*0.12; for(let i=1;i<XtX.length;i++) XtX[i][i]+=lam; // ridge suave (estabiliza colinealidad)
  const iv=inv(XtX); if(!iv) return null;
  const Xty=mul(transpose(X),y.map(v=>[v])); const beta=mul(iv,Xty).map(r=>r[0]);
  const yhat=X.map(row=>row.reduce((s,v,j)=>s+v*beta[j],0));
  const resid=y.map((v,i)=>v-yhat[i]);
  const sstot=y.reduce((s,v)=>s+v*v,0), ssres=resid.reduce((s,v)=>s+v*v,0);
  return {names, beta:beta.slice(1), r2:1-ssres/sstot, n, residByCut:Object.fromEntries(D.map((r,i)=>[String(r.cut),resid[i]]))}; }
function moranI(valByCut, cuts){ const set=new Set(cuts.filter(c=>valByCut[c]!=null).map(String));
  const arr=[...set]; if(arr.length<8||!VECINOS) return null; const m=mean(arr.map(c=>valByCut[c]));
  const z={}; arr.forEach(c=>z[c]=valByCut[c]-m); let num=0,S0=0;
  arr.forEach(c=>{ (VECINOS[c]||[]).forEach(nb=>{ const nk=String(nb); if(!set.has(nk)) return; num+=z[c]*z[nk]; S0+=1; }); });
  const den=arr.reduce((s,c)=>s+z[c]*z[c],0); if(!S0||!den) return null;
  return {I:(arr.length/S0)*(num/den), E:-1/(arr.length-1), n:arr.length}; }

function renderR(){ const p=document.getElementById('panelR');
  if(level==='comuna'){ p.innerHTML=`<div class="mod-pad"><div class="c-head"><div class="c-name">Drivers</div></div>
    <div class="td-card">El análisis de drivers compara <b>varias unidades</b> entre sí. Sube a nivel <b>Región</b>, <b>Zona metropolitana</b> o <b>Nacional</b>.<br><span style="color:var(--ink-lo);font-size:.8rem">(Análisis sub-comunal por local: próximamente.)</span></div></div>`; return; }
  p.innerHTML='<div class="mod-pad">Cargando…</div>';
  Promise.all([ensureTendComuna(),ensureVecinos()]).then(renderRbody); }
function renderRbody(){ const p=document.getElementById('panelR'); const o=(KPI[level]||{})[unitId]||{};
  const cutsSet=unitCuts(); const cuts=(cutsSet? [...cutsSet] : Object.keys(KPI.comuna).map(Number)).map(String);
  // dataset
  const rows=cuts.map(cut=>{ const k=KPI.comuna[cut]||{}; const x={}; DRV.forEach(d=>x[d.k]=k[d.k]==null?null:k[d.k]);
    return {cut, y:outcomeVal(cut), x}; }).filter(r=>KPI.comuna[r.cut]);
  const valid=rows.filter(r=>r.y!=null);
  let h=`<div class="mod-pad"><div class="c-head"><div><div class="c-name">${cap(o.nombre||'')}</div>
    <div class="c-meta">¿Qué explica el voto? · ${LEVELS.find(x=>x.k===level).lbl} · ${elecInfo(elecSel).label} ${elecInfo(elecSel).year}</div></div></div>`;
  h+=`<div class="dr-ctl"><span class="tb-lbl">Variable a explicar</span><select id="routsel">`+
     ROUT.map(r=>`<option value="${r.k}"${r.k===rout?' selected':''}>${r.lbl}</option>`).join('')+`</select>
     <span class="dr-n">${valid.length} unidades con dato</span></div>`;
  if(valid.length<10){ h+=`<div class="td-card">Muy pocas unidades con dato de esta elección (${valid.length}) para un análisis robusto. Prueba otra elección o un nivel con más sub-unidades.</div></div>`;
    p.innerHTML=h; document.getElementById('routsel').onchange=e=>{rout=e.target.value;rdrv=null;renderRbody();}; return; }
  // correlaciones
  const cors=DRV.map(d=>{ const xs=[],ys=[]; valid.forEach(r=>{ if(r.x[d.k]!=null){ xs.push(r.x[d.k]); ys.push(r.y); } });
    return {k:d.k,lbl:d.lbl,r:pearson(xs,ys),n:xs.length}; }).filter(c=>c.r!=null).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
  if(!rdrv) rdrv=cors[0].k;
  h+=`<div class="td-card"><div class="td-h">Correlación con el voto</div>
     <div class="td-sub">r de Pearson entre cada variable socioeconómica y el resultado, sobre las ${valid.length} unidades. Clic para ver la dispersión.</div>`;
  h+=cors.map(c=>{ const w=Math.abs(c.r)*50; const pos=c.r>=0; return `<div class="dr-cor${c.k===rdrv?' on':''}" data-k="${c.k}">
     <span class="dr-lbl">${c.lbl}</span><span class="dr-track"><i class="dr-fill" style="width:${w}%;${pos?'left:50%':'right:50%'};background:${pos?'#b2182b':'#2166ac'}"></i></span>
     <span class="dr-r">${c.r>0?'+':''}${c.r.toFixed(2)}</span></div>`; }).join('')+`</div>`;
  // scatter
  const dd=DRV.find(d=>d.k===rdrv); const sp=valid.filter(r=>r.x[rdrv]!=null).map(r=>({x:r.x[rdrv],y:r.y,name:cap((KPI.comuna[r.cut]||{}).nombre||'')}));
  h+=`<div class="td-card"><div class="td-h">Dispersión: ${dd.lbl} vs voto</div>
     <div class="td-sub">Cada punto es una sub-unidad. Recta = ajuste lineal.</div>${scatterSVG(sp,{xlab:dd.lbl,ylab:ROUT.find(r=>r.k===rout).lbl})}</div>`;
  // regresión OLS + espacial
  const fit=olsFit(valid,REGK);
  h+=`<div class="td-card"><div class="td-h">Regresión múltiple (peso de cada driver)</div>`;
  if(!fit){ h+=`<div class="td-sub">Insuficientes datos completos para la regresión.</div>`; }
  else{ h+=`<div class="td-sub">Coeficientes estandarizados (β, ridge) controlando por el resto · R² = <b>${(fit.r2*100).toFixed(0)}%</b> · n=${fit.n}. Positivo (rojo) = empuja a la derecha. Subconjunto no redundante de variables.</div>`;
    const order=fit.names.map((k,i)=>({k,lbl:DRV.find(d=>d.k===k).lbl,b:fit.beta[i]})).sort((a,b)=>Math.abs(b.b)-Math.abs(a.b));
    const mx=Math.max(...order.map(o=>Math.abs(o.b)),.01);
    h+=order.map(o=>{ const w=Math.abs(o.b)/mx*50; const pos=o.b>=0; return `<div class="dr-cor">
       <span class="dr-lbl">${o.lbl}</span><span class="dr-track"><i class="dr-fill" style="width:${w}%;${pos?'left:50%':'right:50%'};background:${pos?'#b2182b':'#2166ac'}"></i></span>
       <span class="dr-r">${o.b>0?'+':''}${o.b.toFixed(2)}</span></div>`; }).join('');
    // diagnóstico espacial de Moran (outcome + residuos)
    const outByCut={}; valid.forEach(r=>outByCut[r.cut]=r.y);
    const mOut=moranI(outByCut, valid.map(r=>r.cut));
    const mRes=fit.residByCut? moranI(fit.residByCut, Object.keys(fit.residByCut)) : null;
    if(mOut){ const dep=mRes&&mRes.I>0.15;
      h+=`<div class="dr-sp"><b>Diagnóstico espacial (I de Moran)</b><br>
        Voto: I = ${mOut.I.toFixed(2)} ${mOut.I>0.15?'→ hay clustering territorial':''}<br>
        Residuos del modelo: I = ${mRes?mRes.I.toFixed(2):'—'} ${dep?'→ queda dependencia espacial: un modelo espacial (SAR/SEM) mejoraría el ajuste':'→ los residuos no muestran autocorrelación fuerte'}.</div>`; }
  }
  h+=`</div>`;
  h+=`<div class="c-foot">Análisis ecológico (describe territorios, no personas). Correlación no implica causalidad. RF/XGBoost + SHAP (importancia no lineal) quedan pendientes (requieren scikit-learn).</div></div>`;
  p.innerHTML=h;
  document.getElementById('routsel').onchange=e=>{ rout=e.target.value; rdrv=null; renderRbody(); };
  p.querySelectorAll('.dr-cor[data-k]').forEach(el=>el.onclick=()=>{ rdrv=el.dataset.k; renderRbody(); }); }
function scatterSVG(pts,opt){ const W=560,H=230,mL=44,mR=14,mT=12,mB=34; const iw=W-mL-mR,ih=H-mT-mB;
  if(pts.length<3) return '<div class="td-empty">Sin datos.</div>';
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y); const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const X=v=> mL+iw*(v-xmin)/((xmax-xmin)||1); const Y=v=> mT+ih*(1-(v-ymin)/((ymax-ymin)||1));
  const r=pearson(xs,ys); const mx=mean(xs),my=mean(ys); let sxy=0,sxx=0; xs.forEach((x,i)=>{sxy+=(x-mx)*(ys[i]-my);sxx+=(x-mx)*(x-mx);});
  const b=sxy/(sxx||1), a=my-b*mx;
  let s=`<svg viewBox="0 0 ${W} ${H}" class="td-svg" preserveAspectRatio="xMidYMid meet">`;
  for(let g=0;g<=4;g++){ const y=mT+ih*g/4, val=ymax-(ymax-ymin)*g/4; s+=`<line x1="${mL}" y1="${y}" x2="${W-mR}" y2="${y}" stroke="#eef1f5"/>`+
    `<text x="${mL-5}" y="${y+3}" text-anchor="end" class="td-ax">${val.toFixed(ymax-ymin<5?1:0)}</text>`; }
  pts.forEach(p=>{ s+=`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#1F6FEB" fill-opacity=".55"><title>${p.name}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})</title></circle>`; });
  s+=`<line x1="${X(xmin)}" y1="${Y(a+b*xmin)}" x2="${X(xmax)}" y2="${Y(a+b*xmax)}" stroke="#16365a" stroke-width="2"/>`;
  s+=`<text x="${W-mR}" y="${mT+10}" text-anchor="end" class="td-val">r = ${r>0?'+':''}${r.toFixed(2)}</text>`;
  s+=`<text x="${mL+iw/2}" y="${H-6}" text-anchor="middle" class="td-ax">${opt.xlab}</text>`;
  return s+'</svg>'; }

// Indicador de versión (esquina inferior izquierda) — refleja la versión de caché V para verificación visual
(function(){ const b=document.createElement('div'); b.id='verbadge'; b.textContent='v'+V; b.title='Versión del dashboard desplegada';
  b.style.cssText='position:fixed;left:8px;bottom:6px;z-index:1500;font:600 11px Inter,system-ui,sans-serif;color:#8a93a0;'
    +'background:rgba(255,255,255,.88);padding:2px 8px;border-radius:8px;border:1px solid #e2e6ea;pointer-events:none;user-select:none';
  document.body.appendChild(b); })();
