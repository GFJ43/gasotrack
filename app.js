const API='https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes';
const FUEL_KEYS={'G95E5':'Precio Gasolina 95 E5','G98E5':'Precio Gasolina 98 E5','GOA':'Precio Gasoleo A','GPNA':'Precio Gas Natural Comprimido','GLP':'Precio Gases licuados del petróleo'};
const FUEL_LABELS={'G95E5':'Gasolina 95','G98E5':'Gasolina 98','GOA':'Diésel','GPNA':'Gas Natural','GLP':'GLP'};

let allMunicipios=[],currentMuni=null,currentFuel='G95E5',cheapest3=[],avgPrice=0,leafMap=null,history=JSON.parse(localStorage.getItem('gsh')||'[]'),favs=JSON.parse(localStorage.getItem('gfav')||'[]'),priceHistory=JSON.parse(localStorage.getItem('gph')||'[]');

async function init(){
  renderHistory();renderFavPills();
  try{const r=await fetch(`${API}/Listados/Municipios/`);allMunicipios=await r.json();}
  catch(e){showToast('Error cargando municipios');}
}

// NAV
document.querySelectorAll('.nav-tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.page).classList.add('active');
  if(t.dataset.page==='page-map'&&cheapest3.length)setTimeout(()=>renderMap(),100);
  if(t.dataset.page==='page-hist')renderHistoryPage();
}));

// AUTOCOMPLETE
document.getElementById('cityInput').addEventListener('input',function(){
  const q=this.value.trim().toLowerCase(),list=document.getElementById('acList');
  list.innerHTML='';
  if(q.length<2)return;
  allMunicipios.filter(m=>m.Municipio.toLowerCase().includes(q)).slice(0,8).forEach(m=>{
    const d=document.createElement('div');d.className='ac-item';
    d.textContent=`${m.Municipio} (${m.Provincia})`;
    d.onclick=()=>{document.getElementById('cityInput').value=m.Municipio;currentMuni=m;list.innerHTML='';search();};
    list.appendChild(d);
  });
});
document.addEventListener('click',e=>{if(!e.target.closest('.iw'))document.getElementById('acList').innerHTML='';});
document.getElementById('cityInput').addEventListener('keydown',e=>{if(e.key==='Enter')search();});

function selectFuel(btn){
  document.querySelectorAll('.ftab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');currentFuel=btn.dataset.fuel;
  if(currentMuni)search();
}

async function search(){
  const val=document.getElementById('cityInput').value.trim();
  if(!val&&!currentMuni){showToast('Escribe una ciudad');return;}
  if(!currentMuni||currentMuni.Municipio.toLowerCase()!==val.toLowerCase()){
    const f=allMunicipios.find(m=>m.Municipio.toLowerCase()===val.toLowerCase());
    if(!f){showToast('Ciudad no encontrada');return;}
    currentMuni=f;
  }
  document.getElementById('searchBtn').disabled=true;
  showLoading();
  try{
    const r=await fetch(`${API}/EstacionesTerrestres/FiltroMunicipio/${currentMuni.IDMunicipio}`);
    const data=await r.json();
    processResults(data.ListaEESSPrecio||[]);
    addSearchHistory(currentMuni);
  }catch(e){showError('Error al obtener datos.');}
  document.getElementById('searchBtn').disabled=false;
}

function processResults(stations){
  const fk=FUEL_KEYS[currentFuel];
  const valid=stations.filter(s=>{
    const p=parseFloat((s[fk]||'').replace(',','.'));return p>0;
  }).map(s=>({
    name:s['Rótulo']||'Sin nombre',
    address:`${s['Dirección']}, ${s['Localidad']}`,
    price:parseFloat((s[fk]||'').replace(',','.')),
    schedule:s['Horario']||'',
    lat:s['Latitud']?parseFloat(s['Latitud'].replace(',','.')):null,
    lon:s['Longitud (WGS84)']?parseFloat(s['Longitud (WGS84)'].replace(',','.')):null,
    id:s['IDEESS']||''
  })).sort((a,b)=>a.price-b.price);
  if(!valid.length){showError('No hay datos de este combustible aquí.');return;}
  cheapest3=valid.slice(0,3);
  avgPrice=valid.reduce((s,x)=>s+x.price,0)/valid.length;
  savePriceHistory(cheapest3);
  document.getElementById('statCount').textContent=valid.length;
  document.getElementById('statAvg').textContent=avgPrice.toFixed(3)+' €';
  document.getElementById('statMin').textContent=valid[0].price.toFixed(3)+' €';
  document.getElementById('statMax').textContent=valid[valid.length-1].price.toFixed(3)+' €';
  document.getElementById('statsBar').style.display='flex';
  renderPodium(cheapest3);
  document.getElementById('calcSection').style.display='block';
  calcSavings();
}

function renderPodium(stations){
  const sec=document.getElementById('resultsSection');
  sec.innerHTML=`<div class="section-hd">Top 3 Más Baratas · ${currentMuni.Municipio}</div><div class="podium" id="pod"></div>`;
  const pod=document.getElementById('pod');
  stations.forEach((s,i)=>{
    const diff=(avgPrice-s.price).toFixed(3);
    const mapUrl=s.lat&&s.lon?`https://www.google.com/maps?q=${s.lat},${s.lon}`:'#';
    const isFav=favs.some(f=>f.id===s.id);
    pod.innerHTML+=`
    <div class="card${i===0?' top':''}">
      <div class="badge">${i===0?'MEJOR PRECIO':i===1?'2.ª OPCIÓN':'3.ª OPCIÓN'}</div>
      <div class="rank">#${i+1}</div>
      <div class="sname">${s.name}</div>
      <div class="saddr">${s.address}</div>
      <div class="price">${s.price.toFixed(3)}<sup>€/L</sup></div>
      <div class="diff">↓ ${diff} € vs media</div>
      ${s.schedule?`<div class="sched">${s.schedule}</div>`:''}
      <a href="${mapUrl}" target="_blank" class="maplink">↗ Cómo llegar</a>
      <button class="fav-btn${isFav?' active':''}" onclick="toggleFav(${i})" title="Favorito">★</button>
    </div>`;
  });
}

function toggleFav(idx){
  const s=cheapest3[idx];if(!s)return;
  const ei=favs.findIndex(f=>f.id===s.id);
  if(ei>=0){favs.splice(ei,1);showToast('Eliminado de favoritos');}
  else{favs.push({id:s.id,name:s.name,address:s.address,city:currentMuni.Municipio,cityId:currentMuni.IDMunicipio,fuel:currentFuel});showToast('⭐ Añadido a favoritos');}
  localStorage.setItem('gfav',JSON.stringify(favs));
  renderPodium(cheapest3);renderFavPills();
}

function renderFavPills(){
  const c=document.getElementById('favPills');
  if(!favs.length){c.innerHTML='';return;}
  c.innerHTML='<span style="font-size:.68rem;color:var(--m);text-transform:uppercase;letter-spacing:.08em">★ Favoritas:</span> '+
    favs.map(f=>`<div class="pill" onclick="loadFav('${f.cityId}')">${f.name.slice(0,18)}</div>`).join('');
}

function loadFav(cityId){
  currentMuni=allMunicipios.find(m=>m.IDMunicipio===cityId)||null;
  if(currentMuni){document.getElementById('cityInput').value=currentMuni.Municipio;search();}
}

function calcSavings(){
  if(!cheapest3.length)return;
  const l=parseFloat(document.getElementById('liters').value)||40;
  const f=parseFloat(document.getElementById('fillups').value)||4;
  const pr=(avgPrice-cheapest3[0].price)*l;
  document.getElementById('savDay').textContent=pr.toFixed(2)+' €';
  document.getElementById('savMonth').textContent=(pr*f).toFixed(2)+' €';
  document.getElementById('savYear').textContent=(pr*f*12).toFixed(2)+' €';
}

// MAP
function renderMap(){
  if(!cheapest3.length){document.getElementById('map').innerHTML='<div class="empty"><div class="ic">🗺</div><p>Busca una ciudad primero</p></div>';return;}
  if(leafMap){leafMap.remove();leafMap=null;}
  const center=[cheapest3[0].lat||40.4,cheapest3[0].lon||-3.7];
  leafMap=L.map('map',{zoomControl:true,attributionControl:false}).setView(center,14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(leafMap);
  cheapest3.forEach((s,i)=>{
    if(!s.lat||!s.lon)return;
    const cls=['best','m2','m3'][i];
    const label=`${s.price.toFixed(3)} €/L`;
    const icon=L.divIcon({className:'',html:`<div class="custom-marker ${cls}">${label}</div>`,iconSize:null,iconAnchor:[0,0]});
    const marker=L.marker([s.lat,s.lon],{icon}).addTo(leafMap);
    marker.bindPopup(`<strong>#${i+1} ${s.name}</strong><br>${s.address}<br><br>💶 ${s.price.toFixed(3)} €/L`);
    if(i===0)marker.openPopup();
  });
}

// PRICE HISTORY (localStorage)
function savePriceHistory(stations){
  const now=Date.now();
  stations.forEach((s,i)=>{
    priceHistory.push({id:s.id,name:s.name,city:currentMuni.Municipio,fuel:currentFuel,price:s.price,rank:i+1,ts:now});
  });
  // keep last 500
  if(priceHistory.length>500)priceHistory=priceHistory.slice(-500);
  localStorage.setItem('gph',JSON.stringify(priceHistory));
}

function renderHistoryPage(){
  const sec=document.getElementById('histSection');
  const filtered=priceHistory.filter(h=>h.rank===1);
  if(!filtered.length){sec.innerHTML=`<div class="empty"><div class="ic">📈</div><p>Aún no hay historial. Busca algunas ciudades primero.</p></div>`;return;}
  // Group by station id+fuel
  const map={};
  filtered.forEach(h=>{
    const key=`${h.id}_${h.fuel}`;
    if(!map[key])map[key]={id:h.id,name:h.name,city:h.city,fuel:h.fuel,prices:[],count:0};
    map[key].prices.push(h.price);map[key].count++;
  });
  const ranked=Object.values(map).map(x=>({...x,avg:x.prices.reduce((a,b)=>a+b,0)/x.prices.length}))
    .sort((a,b)=>a.avg-b.avg);
  const minAvg=ranked[0]?.avg||1,maxAvg=ranked[ranked.length-1]?.avg||2;
  sec.innerHTML=`<div class="section-hd">Estaciones históricamente más baratas (puesto #1)</div>`+
    ranked.slice(0,15).map((s,i)=>{
      const pct=((s.avg-minAvg)/(maxAvg-minAvg+.001)*80)+5;
      return `<div class="hist-card">
        <div class="hist-rank">#${i+1}</div>
        <div class="hist-info">
          <div class="hist-name">${s.name}</div>
          <div class="hist-city">${s.city} · ${FUEL_LABELS[s.fuel]||s.fuel}</div>
          <div class="bar-wrap"><div class="bar-fill" style="width:${100-pct}%"></div></div>
        </div>
        <div class="hist-stats">
          <div class="hist-avg">${s.avg.toFixed(3)} €</div>
          <div class="hist-count">${s.count} vez${s.count>1?'es':''} #1</div>
        </div>
      </div>`;
    }).join('')+
    `<div style="margin-top:1rem;text-align:right"><button class="btn btn-sm btn-outline" onclick="clearHistory()">Borrar historial</button></div>`;
}

function clearHistory(){
  if(confirm('¿Borrar todo el historial de precios?')){
    priceHistory=[];localStorage.removeItem('gph');renderHistoryPage();showToast('Historial borrado');
  }
}

// SEARCH HISTORY
function addSearchHistory(m){
  history=[m,...history.filter(h=>h.IDMunicipio!==m.IDMunicipio)].slice(0,5);
  localStorage.setItem('gsh',JSON.stringify(history));renderSearchPills();
}
function renderSearchPills(){
  const c=document.getElementById('histPills');
  if(!history.length){c.innerHTML='';return;}
  c.innerHTML=history.map(m=>
    `<div class="pill pill-del">
      <span onclick="loadPill('${m.IDMunicipio}')">${m.Municipio}</span>
      <button class="pill-x" onclick="removeHistory('${m.IDMunicipio}')" title="Eliminar">×</button>
    </div>`
  ).join('');
}
function loadPill(id){
  currentMuni=allMunicipios.find(m=>m.IDMunicipio===id)||history.find(m=>m.IDMunicipio===id);
  if(currentMuni){document.getElementById('cityInput').value=currentMuni.Municipio;search();}
}
function removeHistory(id){
  history=history.filter(h=>h.IDMunicipio!==id);
  localStorage.setItem('gsh',JSON.stringify(history));
  renderSearchPills();
}
function renderHistory(){renderSearchPills();}

// LOADING
function showLoading(){
  document.getElementById('resultsSection').innerHTML=`<div class="empty"><div class="spin"></div><p>Consultando precios...</p></div>`;
  document.getElementById('statsBar').style.display='none';
  document.getElementById('calcSection').style.display='none';
}
function showError(msg){document.getElementById('resultsSection').innerHTML=`<div class="empty"><div class="ic">⚠</div><p>${msg}</p></div>`;}

function showToast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

init();
