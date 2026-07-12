// Explorador territorial electoral — workbench: nivel → unidad → módulos. Elección elegida DENTRO de cada módulo.
const V='21';
const LEVELS=[{k:'nacional',lbl:'Nacional'},{k:'region',lbl:'Región'},{k:'distrito',lbl:'Distrito'},
  {k:'circ_senatorial',lbl:'Circ. sen.'},{k:'metro',lbl:'Z. metro'},{k:'comuna',lbl:'Comuna'}];
const REG_ORDER=[15,1,2,3,4,5,13,6,7,16,8,9,14,10,11,12];
const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const OPCION_COL={'APRUEBO':'#3F8E86','A FAVOR':'#3F8E86','RECHAZO':'#C55A11','EN CONTRA':'#C55A11'};
const SEQ=['#EFF3FB','#C6D9F0','#8CB3DE','#4A80C0','#16365A'];
const REF_LBL='Presidencial 1ª v. 2025';

let CAT={}, KPI={}, GEOCOM=null, AREAS=null, TIDX={}, CUTMAP={}, REPR={};
let level='nacional', unitId=null, tab='C', elecSel=null, colorby='winner';
let TERR=null; const TERRCACHE={};
let map=null, layer=null, canvas=null, seqRange=null;

Promise.all([
  fetch('data/catalogo_elecciones.json?v='+V).then(r=>r.json()),
  fetch('data/kpis_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/comunas.geojson?v='+V).then(r=>r.json()),
  fetch('data/explorador_areas.geojson?v='+V).then(r=>r.json()),
  fetch('data/territorial_index.json?v='+V).then(r=>r.json()),
  fetch('data/representantes.json?v='+V).then(r=>r.json()).catch(()=>({})),
]).then(([cat,kpi,gcom,areas,tidx,repr])=>{
  CAT=cat; KPI=kpi; GEOCOM=gcom; AREAS=areas; TIDX=tidx; REPR=repr;
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
    loadTerr(elecSel).then(()=>{ buildColorby(); setTimeout(()=>{ map.invalidateSize(); renderT(); },30); }); }
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
  map=L.map('map',{preferCanvas:true,minZoom:3}).setView([-35.5,-71.3],5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {attribution:'&copy; OpenStreetMap &copy; CARTO',subdomains:'abcd',maxZoom:19}).addTo(map);
  canvas=L.canvas({padding:.5});
  document.getElementById('elecBtn').onclick=openElecPanel;
  document.getElementById('colorby').onchange=e=>{ colorby=e.target.value; renderT(); };
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
        document.getElementById('elecBtn').textContent=elecInfo(elecSel).label+' · '+y;
        loadTerr(elecSel).then(()=>{ buildColorby(); renderT(); }); }; wrap.appendChild(b); }));
    yr.appendChild(wrap); p.appendChild(yr); });
  p.style.display='block'; }
function buildColorby(){ const s=document.getElementById('colorby'); s.innerHTML='';
  const add=(v,t)=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; s.appendChild(o); };
  add('winner','Ganador (1ª mayoría)'); add('part','Participación'); add('margen','Margen 1º–2º'); add('nulos','% blancos + nulos');
  if(prevSameType(elecSel)) add('swing','Swing vs elección anterior');
  if(partnerOf(elecSel)) add('split','Voto cruzado (mismo día)');
  if(hasRounds(elecSel)) add('consist','Consistencia 1ª/2ª vuelta');
  const og=document.createElement('optgroup'); og.label='% por candidato';
  TERR.candidatos.slice(0,14).forEach(c=>{ const o=document.createElement('option'); o.value='cand:'+c.i; o.textContent='% '+cap(c.nombre); og.appendChild(o); });
  s.appendChild(og);
  if(![...s.options].some(o=>o.value===colorby)) colorby='winner';
  s.value=colorby; }

function unitCuts(){ if(level==='comuna') return new Set([+unitId]); if(level==='nacional') return null;
  return new Set(Object.entries(CUTMAP).filter(([c,x])=> level==='region'?x.reg==unitId:level==='distrito'?x.dist==unitId:
    level==='circ_senatorial'?x.circ==unitId:level==='metro'?x.metro===unitId:false).map(([c])=>+c)); }
function terrSub(){ const cuts=unitCuts(); const useLocal=TERR.meta.has_local&&AREAS&&colorby!=='swing'&&colorby!=='split';
  if(useLocal) return {geo:'local', idp:'codigo_rec', data:TERR.local, feats:AREAS.features.filter(f=>!cuts||cuts.has(+f.properties.cut))};
  return {geo:'comuna', idp:'cut', data:TERR.comuna, feats:GEOCOM.features.filter(f=>!cuts||cuts.has(+f.properties.cut))}; }
function winnerOf(u){ if(!u||!u.val) return null; let bi=null,bv=-1; for(const i in u.v) if(u.v[i]>bv){bv=u.v[i];bi=+i;} return bi==null?null:{i:bi,pct:100*bv/u.val}; }
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
function colorFeat(u,f){ if(colorby==='consist') return consistCol(CONSIST[String(idOf(f))]);
  if(colorby==='swing'||colorby==='split') return divCol(DIVMAP[+f.properties.cut]);
  if(colorby==='winner'){ const w=winnerOf(u); return w?candCol(w.i):'#e5e5e5'; } return seqCol(metricVal(u)); }

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
  if((colorby==='swing'||colorby==='split') && !TENDCACHE['comuna']){ ensureTendComuna().then(renderT); return; }
  if(colorby==='consist'){ const r=rounds(elecSel); if(!TERRCACHE[r.v1]||!TERRCACHE[r.v2]){ Promise.all([fetchTerr(r.v1),fetchTerr(r.v2)]).then(renderT); return; } }
  if(layer){ map.removeLayer(layer); layer=null; }
  const {geo,idp,data,feats}=terrSub();
  if(!feats.length){ document.getElementById('resumen').innerHTML='Sin sub-unidades para mapear.'; return; }
  if(colorby==='swing'||colorby==='split') computeDivMap(feats);
  else if(colorby==='consist') computeConsist(feats,geo);
  else if(colorby!=='winner'){ const vals=feats.map(f=>metricVal(data[String(f.properties[idp])])).filter(v=>v!=null);
    seqRange={lo:pctl(vals,.05),hi:pctl(vals,.95)}; }
  layer=L.geoJSON({type:'FeatureCollection',features:feats},{ renderer:canvas,
    style:f=>({color:'#fff',weight:geo==='local'?.7:.6,fillColor:colorFeat(data[String(f.properties[idp])],f),fillOpacity:.82}),
    onEachFeature:(f,l)=>{ l.bindPopup(popupSub(f,geo,idp,data));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:geo==='local'?.7:.6})); }
  }).addTo(map);
  try{ map.fitBounds(layer.getBounds(),{padding:[22,22],maxZoom:geo==='local'?14:11}); }catch(e){}
  renderSide(geo,feats,idp,data); renderResumen(geo,feats.length); renderLeg(); renderSesgos();
}
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
function renderEcol(){ const box=document.getElementById('terrbottom'); box.innerHTML='<div class="sz-hint">Cargando sesgos…</div>';
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
function renderSesgos(){ const box=document.getElementById('terrbottom');
  if(colorby.startsWith('cand:')||colorby==='nulos'){ return renderEcol(); }
  if(colorby!=='part'){ box.innerHTML=`<div class="sz-hint">Elige <b>Participación</b> (sesgos por edad/género/nacionalidad/NSE) o <b>un candidato / blancos+nulos</b> (sesgos ecológicos con la demografía).</div>`; return; }
  box.innerHTML='<div class="sz-hint">Cargando sesgos…</div>';
  Promise.all([ensureSesgos(),ensureTendComuna()]).then(()=>{
    const s=((SESGOS[level]||{})[unitId]||{})[elecSel];
    let h=`<div class="sz-title">Sesgos de participación · ${TERR.meta.label} ${elecInfo(elecSel).year} · quién vota más</div><div class="sz-row">`;
    if(!s){ h+=`<div class="sz-hint">Sin desglose demográfico disponible para esta elección.</div>`; }
    else{
      h+=szCard('Edad',[['18–29',s.edad['18-29']],['30–49',s.edad['30-49']],['50–64',s.edad['50-64']],['65+',s.edad['65+']]]);
      h+=szCard('Género',[['Hombres',s.sexo.H],['Mujeres',s.sexo.M]]);
      h+=szCard('Nacionalidad',[['Chilenos',s.nac.C],['Extranjeros',s.nac.E]]);
      const nse=nsePart(); const ord=NSE_ORDER.filter(k=>nse[k]!=null);
      if(ord.length>1) h+=szCard('Nivel socioec.', ord.map(k=>[k,nse[k]]), 'ecológico (por comuna)');
    }
    h+=`</div>`; box.innerHTML=h;
  });
}
function subName(f,geo){ return geo==='local'?(f.properties.recinto||'Local'):cap(f.properties.comuna||''); }
function popupSub(f,geo,idp,data){ const u=data[String(f.properties[idp])]; const w=u&&winnerOf(u);
  let h=`<b>${subName(f,geo)}</b><br>`;
  if(colorby==='swing'||colorby==='split'){ const dv=DIVMAP[+f.properties.cut];
    h+=(dv==null?'<span style="color:#888">sin comparable</span>':`${colorby==='swing'?'Swing':'Voto cruzado'}: <b>${dv>0?'+':''}${dv.toFixed(1)} pp</b> ${dv>0?'→ derecha':dv<0?'→ izquierda':''}<br><span style="color:#888">vs ${DIVREF?elecInfo(DIVREF).label+' '+elecInfo(DIVREF).year:'—'}</span>`)+'<br>'; }
  if(colorby==='consist'){ const cv=CONSIST[String(idOf(f))]; h+=(cv==null?'<span style="color:#888">sin comparable</span>':(cv?'<b>Mismo bloque</b> ganó 1ª y 2ª vuelta':'<b>Cambió de bloque</b> entre vueltas'))+'<br>'; }
  if(colorby==='nulos'&&u&&u.val){ const nb=u.nb||0; h+=`Blancos + nulos: <b>${(100*nb/(u.val+nb)).toFixed(1)}%</b><br>`; }
  if(!u||!w) return h+(colorby==='swing'||colorby==='split'||colorby==='consist'?'':'sin resultado');
  const top=Object.entries(u.v).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([i,vs])=>`${cap(TERR.candidatos[+i].nombre)}: <b>${(100*vs/u.val).toFixed(1)}%</b>`).join('<br>');
  h+=top+`<br><span style="color:#888">Participación: ${u.part??'—'}%</span>`; return h; }
function unitTotals(){ const cuts=unitCuts(); const agg={}; let val=0;
  for(const cut in TERR.comuna){ if(cuts&&!cuts.has(+cut)) continue; const u=TERR.comuna[cut]; val+=u.val; for(const i in u.v) agg[i]=(agg[i]||0)+u.v[i]; }
  return {val,v:agg}; }
function renderSide(geo,feats,idp,data){ const o=(KPI[level]||{})[unitId]||{}; const tot=unitTotals();
  let h=`<div class="ts-tot"><div class="ts-h">${cap(o.nombre||'')} — total</div>`;
  const ranked=Object.entries(tot.v).sort((a,b)=>b[1]-a[1]).slice(0,10);
  h+=ranked.map(([i,vs])=>{ const c=TERR.candidatos[+i]; const pct=100*vs/tot.val;
    return `<div class="ts-row"><span class="ts-name">${cap(c.nombre)}</span><span class="ts-bar"><i style="width:${pct}%;background:${candCol(+i)}"></i></span><span class="ts-pct">${pct.toFixed(1)}%</span></div>`; }).join('');
  h+=`</div>`;
  // ranking de sub-unidades por la métrica activa
  const isDiv=(colorby==='swing'||colorby==='split'), isCon=(colorby==='consist');
  const rows=feats.map(f=>({f,u:data[String(f.properties[idp])]})).filter(x=>x.u&&x.u.val);
  const key=x=> isCon? (CONSIST[String(idOf(x.f))]??-1) : isDiv? (DIVMAP[+x.f.properties.cut] ?? -999) : colorby==='winner'?(winnerOf(x.u)||{}).pct||0 : (metricVal(x.u)??-1);
  rows.sort((a,b)=>key(b)-key(a));
  h+=`<div class="ts-h2">${feats.length} ${geo==='local'?'locales':'comunas'} · ${colLabel()}</div><div class="ts-list">`;
  h+=rows.slice(0,60).map(({f,u})=>{ const w=winnerOf(u); const wc=w?TERR.candidatos[w.i]:null;
    const dv=isDiv?DIVMAP[+f.properties.cut]:null, cv=isCon?CONSIST[String(idOf(f))]:null;
    const val= isCon? (cv==null?'—':(cv?'consistente':'cambió'))
      : isDiv? (dv==null?'—':(dv>0?'+':'')+dv.toFixed(1)+' pp')
      : colorby==='winner'? (w?cap(wc.nombre)+' '+w.pct.toFixed(0)+'%':'—')
      : colorby==='part'? (u.part??'—')+'%' : colorby==='margen'? metricVal(u).toFixed(1)+' pp' : metricVal(u).toFixed(1)+'%';
    const dot= isCon?`<i class="ts-dot" style="background:${consistCol(cv)}"></i>` : isDiv&&dv!=null?`<i class="ts-dot" style="background:${divCol(dv)}"></i>` : colorby==='winner'&&w?`<i class="ts-dot" style="background:${candCol(w.i)}"></i>`:'';
    return `<div class="ts-li"><span class="ts-liN">${dot}${subName(f,geo)}</span><span class="ts-liV">${val}</span></div>`; }).join('');
  h+=`</div>`+(rows.length>60?`<div class="ts-more">+${rows.length-60} más…</div>`:'');
  document.getElementById('terrside').innerHTML=h; }
function colLabel(){ if(colorby==='winner') return 'ganador'; if(colorby==='part') return 'participación';
  if(colorby==='margen') return 'margen 1º–2º'; if(colorby==='nulos') return 'blancos + nulos';
  if(colorby==='consist') return 'consistencia 1ª/2ª vuelta';
  if(colorby==='swing') return 'swing vs '+(DIVREF?elecInfo(DIVREF).year:'anterior');
  if(colorby==='split') return 'voto cruzado vs '+(DIVREF?cap(elecInfo(DIVREF).label):'—');
  return '% '+cap(TERR.candidatos[+colorby.slice(5)].nombre); }
function renderResumen(geo,n){ const o=(KPI[level]||{})[unitId]||{};
  let extra='';
  if(colorby==='consist'&&CONSIST_PCT!=null){ const r=rounds(elecSel);
    extra=`<div class="r-hint"><b>${CONSIST_PCT}%</b> de las ${geo==='local'?'locales':'comunas'} mantuvieron el bloque ganador entre 1ª y 2ª vuelta; el resto cambió. Compara ${elecInfo(r.v1).label} y ${elecInfo(r.v2).label} ${elecInfo(r.v2).year}.</div>`; }
  else extra=`<div class="r-hint">Máxima desagregación disponible para esta elección. Clic en una unidad para el detalle.</div>`;
  document.getElementById('resumen').innerHTML=`<div class="r-com">${cap(o.nombre||'')}</div>`+
    `<div class="r-el">${TERR.meta.label} ${elecInfo(elecSel).year}</div>`+
    `${n} ${geo==='local'?'locales de votación':'comunas'} · coloreado por <b>${colLabel()}</b>.`+extra; }
function renderLeg(){ const el=document.getElementById('leg2');
  if(colorby==='consist'){ el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">Consistencia 1ª/2ª vuelta</span>`+
      `<span class="lg"><i style="background:#3F8E86"></i>mismo bloque</span><span class="lg"><i style="background:#C55A11"></i>cambió de bloque</span>`; return; }
  if(colorby==='swing'||colorby==='split'){ const m=(seqRange&&seqRange.abs)||10;
    el.innerHTML=`<span class="lg" style="width:100%;font-weight:700;color:#333">${colLabel()} (pp)</span>`+
      `<span class="lg"><i style="background:#2166ac"></i>← izq. −${m.toFixed(0)}</span>`+
      `<span class="lg"><i style="background:#f7f7f7;border:1px solid #ccc"></i>0</span>`+
      `<span class="lg"><i style="background:#b2182b"></i>der. +${m.toFixed(0)} →</span>`; return; }
  if(colorby==='winner'){ const used={}; Object.keys(TERR.local||TERR.comuna).length;
    // leyenda por bloque + opciones presentes
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
