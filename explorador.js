// Explorador territorial electoral — workbench: nivel → unidad → módulos. Elección elegida DENTRO de cada módulo.
const V='14';
const LEVELS=[{k:'nacional',lbl:'Nacional'},{k:'region',lbl:'Región'},{k:'distrito',lbl:'Distrito'},
  {k:'circ_senatorial',lbl:'Circ. sen.'},{k:'metro',lbl:'Z. metro'},{k:'comuna',lbl:'Comuna'}];
const REG_ORDER=[15,1,2,3,4,5,13,6,7,16,8,9,14,10,11,12];
const BLOQCOL={'Izquierda':'#2166ac','Centro-izquierda':'#67a9cf','Centro':'#9aa0a6','Populista/Otro':'#7b5ea7',
  'Centro-derecha':'#ef8a62','Derecha':'#d6604d','Derecha radical':'#b2182b'};
const OPCION_COL={'APRUEBO':'#3F8E86','A FAVOR':'#3F8E86','RECHAZO':'#C55A11','EN CONTRA':'#C55A11'};
const SEQ=['#EFF3FB','#C6D9F0','#8CB3DE','#4A80C0','#16365A'];
const REF_LBL='Presidencial 1ª v. 2025';

let CAT={}, KPI={}, GEOCOM=null, AREAS=null, TIDX={}, CUTMAP={};
let level='nacional', unitId=null, tab='C', elecSel=null, colorby='winner';
let TERR=null; const TERRCACHE={};
let map=null, layer=null, canvas=null, seqRange=null;

Promise.all([
  fetch('data/catalogo_elecciones.json?v='+V).then(r=>r.json()),
  fetch('data/kpis_niveles.json?v='+V).then(r=>r.json()),
  fetch('data/comunas.geojson?v='+V).then(r=>r.json()),
  fetch('data/explorador_areas.geojson?v='+V).then(r=>r.json()),
  fetch('data/territorial_index.json?v='+V).then(r=>r.json()),
]).then(([cat,kpi,gcom,areas,tidx])=>{
  CAT=cat; KPI=kpi; GEOCOM=gcom; AREAS=areas; TIDX=tidx;
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
  ['panelC','panelD','panelT'].forEach(p=>document.getElementById(p).classList.remove('show'));
  const ph=document.getElementById('placeholder'); ph.style.display='flex'; ph.querySelector('.ph-card p').innerHTML=html; }

const MODS=[{k:'C',lbl:'Características principales'},{k:'T',lbl:'Análisis territorial'},
  {k:'D',lbl:'Análisis tendencial'},{k:'R',lbl:'Drivers',soon:1},{k:'P',lbl:'Predictivo',soon:1}];
function renderTabs(){ const t=document.getElementById('tabs'); t.innerHTML='';
  MODS.forEach(M=>{ const b=document.createElement('button'); b.textContent=M.lbl+(M.soon?' ·':'');
    b.className='tabbtn'+(M.k===tab?' on':'')+(M.soon?' soon':''); if(M.soon){ b.title='Próximamente'; b.disabled=true; }
    b.onclick=()=>showTab(M.k); t.appendChild(b); }); }
function showTab(t){ tab=t;
  document.querySelectorAll('#tabs .tabbtn').forEach(b=>b.classList.toggle('on', b.textContent.startsWith(MODS.find(m=>m.k===t).lbl)));
  document.getElementById('panelC').classList.toggle('show', t==='C');
  document.getElementById('panelT').classList.toggle('show', t==='T');
  document.getElementById('panelD').classList.toggle('show', t==='D');
  if(t==='C') renderC();
  else if(t==='T'){ ensureMap(); document.getElementById('elecBtn').textContent=elecInfo(elecSel).label+' · '+elecInfo(elecSel).year;
    loadTerr(elecSel).then(()=>{ buildColorby(); setTimeout(()=>{ map.invalidateSize(); renderT(); },30); }); }
  else if(t==='D') renderD(); }

// =================== MÓDULO Características ===================
function fmtN(v){ return v==null?'—':Math.round(v).toLocaleString('es-CL'); }
function fmtP(v,d){ return v==null?'—':v.toFixed(d??1)+'%'; }
function fmtD(v,d){ return v==null?'—':v.toFixed(d??1); }
function card(v,lbl,sub){ return `<div class="kc"><div class="kv">${v}</div><div class="kl">${lbl}</div>${sub?`<div class="ks">${sub}</div>`:''}</div>`; }
function bars(items){ return `<div class="kbars">`+items.map(([lbl,pct,col])=>
  `<div class="kbar"><span class="kbl">${lbl}</span><span class="kbt"><i style="width:${Math.max(2,pct||0)}%;background:${col||'var(--accent)'}"></i></span><span class="kbp">${fmtP(pct,0)}</span></div>`).join('')+`</div>`; }
function renderC(){ const o=(KPI[level]||{})[unitId]; const p=document.getElementById('panelC');
  if(!o){ p.innerHTML='<div class="mod-pad">Sin datos para esta unidad.</div>'; return; }
  const lvlLbl=LEVELS.find(x=>x.k===level).lbl; const eje=o.eje; const ejePos=eje==null?50:(eje/10*100);
  let h=`<div class="mod-pad"><div class="c-head"><div><div class="c-name">${cap(o.nombre)}</div>
    <div class="c-meta">${lvlLbl}${o.reg_nom&&level!=='nacional'&&level!=='region'?' · '+cap(o.reg_nom):''}</div></div>
    ${o.bloque_ganador?`<span class="c-chip" style="background:${BLOQCOL[o.bloque_ganador]||'#999'}">${o.bloque_ganador}</span>`:''}</div>`;
  h+=`<div class="kblock"><div class="kbt-h">Padrón y participación <span>· ${REF_LBL}</span></div><div class="kgrid">`+
     card(fmtN(o.inscritos),'Electores inscritos')+card(fmtP(o.participacion),'Participación')+card(fmtN(o.votantes),'Votantes')+`</div></div>`;
  h+=`<div class="kblock"><div class="kbt-h">Composición del electorado</div><div class="kgrid">`+
     card(fmtP(o.pct_muj),'Mujeres','del electorado')+card(fmtP(o.pct_ext),'Extranjeros','electores no chilenos')+`</div>`+
     `<div class="ksub">Distribución etaria</div>`+bars([['18–29',o.pct_a1829,'#4A80C0'],['30–44',o.pct_a3044,'#6f9fd0'],['45–59',o.pct_a4559,'#9aa0a6'],['60+',o.pct_a60,'#C55A11']])+`</div>`;
  h+=`<div class="kblock"><div class="kbt-h">Demografía y territorio <span>· Censo 2024</span></div><div class="kgrid">`+
     card(fmtN(o.pob_2024),'Población',o.var_pct!=null?`${o.var_pct>0?'+':''}${fmtD(o.var_pct)}% vs 2017`:'')+
     card(fmtD(o.dens_hab_ha),'Densidad','hab/ha')+card(fmtP(o.pct_60mas),'60 años y más','población')+card(fmtP(o.pct_inmig),'Inmigrantes','población')+`</div></div>`;
  h+=`<div class="kblock"><div class="kbt-h">Socioeconómico <span>· CASEN / INE</span></div><div class="kgrid">`+
     card(o.casen_ing_pc?('$'+fmtN(o.casen_ing_pc)):'—','Ingreso per cápita','hogar, CASEN')+card(fmtP(o.casen_pobreza_pct),'Pobreza','por ingresos')+
     card(fmtD(o.escol),'Escolaridad','años promedio')+card(fmtP(o.pct_terciaria),'Educación superior','completa')+
     card(o.nse_label||'—','Nivel socioeconómico','grupo modal')+card(fmtP(o.pct_activa),'Ocupación','pob. económ. activa')+`</div></div>`;
  h+=`<div class="kblock"><div class="kbt-h">Color político <span>· ${REF_LBL}</span></div>`;
  if(o.ganador) h+=`<div class="cpwin">1ª mayoría: <b>${cap(o.ganador)}</b>${o.bloque_ganador?` · <span style="color:${BLOQCOL[o.bloque_ganador]||'#999'};font-weight:700">${o.bloque_ganador}</span>`:''}</div>`;
  h+=`<div class="eje-wrap"><div class="eje-track"><div class="eje-mark" style="left:${ejePos}%"></div></div>
      <div class="eje-lbl"><span>Izquierda</span><span class="eje-v">${eje==null?'—':'Eje '+fmtD(eje)+' / 10'}</span><span>Derecha</span></div></div>`;
  if(level==='comuna' && o.alcalde_partido)
    h+=`<div class="alc">Alcalde/sa vigente: <b>${cap(o.alcalde||'')}</b> · ${o.alcalde_partido} · <span style="color:${BLOQCOL[o.alcalde_bloque]||'#999'}">${o.alcalde_bloque||''}</span></div>`;
  h+=`</div><div class="c-foot">Nivel <b>${lvlLbl}</b> · ${fmtN(o.pob_2024)} habitantes. Composición del electorado según quienes votaron en la elección de referencia; socioeconómico Censo 2024 + CASEN.</div></div>`;
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
  add('winner','Ganador (1ª mayoría)'); add('part','Participación'); add('margen','Margen 1º–2º');
  const og=document.createElement('optgroup'); og.label='% por candidato';
  TERR.candidatos.slice(0,14).forEach(c=>{ const o=document.createElement('option'); o.value='cand:'+c.i; o.textContent='% '+cap(c.nombre); og.appendChild(o); });
  s.appendChild(og); s.value=colorby; }

function unitCuts(){ if(level==='comuna') return new Set([+unitId]); if(level==='nacional') return null;
  return new Set(Object.entries(CUTMAP).filter(([c,x])=> level==='region'?x.reg==unitId:level==='distrito'?x.dist==unitId:
    level==='circ_senatorial'?x.circ==unitId:level==='metro'?x.metro===unitId:false).map(([c])=>+c)); }
function terrSub(){ const cuts=unitCuts(); const useLocal=TERR.meta.has_local&&AREAS;
  if(useLocal) return {geo:'local', idp:'codigo_rec', data:TERR.local, feats:AREAS.features.filter(f=>!cuts||cuts.has(+f.properties.cut))};
  return {geo:'comuna', idp:'cut', data:TERR.comuna, feats:GEOCOM.features.filter(f=>!cuts||cuts.has(+f.properties.cut))}; }
function winnerOf(u){ if(!u||!u.val) return null; let bi=null,bv=-1; for(const i in u.v) if(u.v[i]>bv){bv=u.v[i];bi=+i;} return bi==null?null:{i:bi,pct:100*bv/u.val}; }
function candCol(i){ const c=TERR.candidatos[i]; if(!c) return '#b9c0cb'; return c.bloque?(BLOQCOL[c.bloque]||'#b9c0cb'):(OPCION_COL[(c.nombre||'').toUpperCase()]||'#b9c0cb'); }
function metricVal(u){ if(!u||!u.val) return null;
  if(colorby==='part') return u.part;
  if(colorby==='margen'){ const s=Object.values(u.v).sort((a,b)=>b-a); return s.length>=2?100*(s[0]-s[1])/u.val:100; }
  if(colorby.startsWith('cand:')){ const i=+colorby.slice(5); return 100*((u.v[i]||0))/u.val; } return null; }
function pctl(a,p){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor((s.length-1)*p)]; }
function seqCol(v){ if(v==null) return '#e5e5e5'; const r=seqRange; if(!r||r.hi===r.lo) return SEQ[2];
  const t=Math.max(0,Math.min(1,(v-r.lo)/(r.hi-r.lo))); return SEQ[Math.min(4,Math.floor(t*5))]; }
function colorFeat(u){ if(colorby==='winner'){ const w=winnerOf(u); return w?candCol(w.i):'#e5e5e5'; } return seqCol(metricVal(u)); }

function renderT(){ if(layer){ map.removeLayer(layer); layer=null; }
  const {geo,idp,data,feats}=terrSub();
  if(!feats.length){ document.getElementById('resumen').innerHTML='Sin sub-unidades para mapear.'; return; }
  if(colorby!=='winner'){ const vals=feats.map(f=>metricVal(data[String(f.properties[idp])])).filter(v=>v!=null);
    seqRange={lo:pctl(vals,.05),hi:pctl(vals,.95)}; }
  layer=L.geoJSON({type:'FeatureCollection',features:feats},{ renderer:canvas,
    style:f=>({color:'#fff',weight:geo==='local'?.7:.6,fillColor:colorFeat(data[String(f.properties[idp])]),fillOpacity:.82}),
    onEachFeature:(f,l)=>{ l.bindPopup(popupSub(f,geo,idp,data));
      l.on('mouseover',()=>l.setStyle({weight:2})); l.on('mouseout',()=>l.setStyle({weight:geo==='local'?.7:.6})); }
  }).addTo(map);
  try{ map.fitBounds(layer.getBounds(),{padding:[22,22],maxZoom:geo==='local'?14:11}); }catch(e){}
  renderSide(geo,feats,idp,data); renderResumen(geo,feats.length); renderLeg();
}
function subName(f,geo){ return geo==='local'?(f.properties.recinto||'Local'):cap(f.properties.comuna||''); }
function popupSub(f,geo,idp,data){ const u=data[String(f.properties[idp])]; const w=u&&winnerOf(u);
  let h=`<b>${subName(f,geo)}</b><br>`; if(!u||!w) return h+'sin resultado';
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
  const rows=feats.map(f=>({f,u:data[String(f.properties[idp])]})).filter(x=>x.u&&x.u.val);
  const key=x=> colorby==='winner'?(winnerOf(x.u)||{}).pct||0 : (metricVal(x.u)??-1);
  rows.sort((a,b)=>key(b)-key(a));
  h+=`<div class="ts-h2">${feats.length} ${geo==='local'?'locales':'comunas'} · ${colLabel()}</div><div class="ts-list">`;
  h+=rows.slice(0,60).map(({f,u})=>{ const w=winnerOf(u); const wc=w?TERR.candidatos[w.i]:null;
    const val= colorby==='winner'? (w?cap(wc.nombre)+' '+w.pct.toFixed(0)+'%':'—')
      : colorby==='part'? (u.part??'—')+'%' : colorby==='margen'? metricVal(u).toFixed(1)+' pp' : metricVal(u).toFixed(1)+'%';
    const dot= colorby==='winner'&&w?`<i class="ts-dot" style="background:${candCol(w.i)}"></i>`:'';
    return `<div class="ts-li"><span class="ts-liN">${dot}${subName(f,geo)}</span><span class="ts-liV">${val}</span></div>`; }).join('');
  h+=`</div>`+(rows.length>60?`<div class="ts-more">+${rows.length-60} más…</div>`:'');
  document.getElementById('terrside').innerHTML=h; }
function colLabel(){ if(colorby==='winner') return 'ganador'; if(colorby==='part') return 'participación';
  if(colorby==='margen') return 'margen 1º–2º'; return '% '+cap(TERR.candidatos[+colorby.slice(5)].nombre); }
function renderResumen(geo,n){ const o=(KPI[level]||{})[unitId]||{};
  document.getElementById('resumen').innerHTML=`<div class="r-com">${cap(o.nombre||'')}</div>`+
    `<div class="r-el">${TERR.meta.label} ${elecInfo(elecSel).year}</div>`+
    `${n} ${geo==='local'?'locales de votación':'comunas'} · coloreado por <b>${colLabel()}</b>.`+
    `<div class="r-hint">Máxima desagregación disponible para esta elección. Clic en una unidad para el detalle.</div>`; }
function renderLeg(){ const el=document.getElementById('leg2');
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
