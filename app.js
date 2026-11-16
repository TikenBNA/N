'use strict';
const $=id=>document.getElementById(id);
const state={section:'art',items:[],offset:0,query:'',favorites:new Set(JSON.parse(localStorage.getItem('ng-favs')||'[]')),privateFiles:[],privateFavs:new Set(),showFav:false,loading:false};
const api='https://commons.wikimedia.org/w/api.php';
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function clean(s=''){return String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
function setStatus(s){$('status').textContent=s;}
function persistFavs(){localStorage.setItem('ng-favs',JSON.stringify([...state.favorites]));}
function licenseAllowed(meta){
 const name=clean(meta.LicenseShortName?.value||'');
 const url=meta.LicenseUrl?.value||'';
 return !!name && (/creative commons|public domain|free art license/i.test(name)||/creativecommons\.org|publicdomain/i.test(url));
}
function classify(meta,title){
 const text=(title+' '+clean(meta.ImageDescription?.value||'')+' '+clean(meta.Categories?.value||'')).toLowerCase();
 if(/sculpture|statue|painting|drawing|classical|renaissance|museum|antique|ancient/.test(text))return 'Искусство';
 if(/photograph|photography|model|studio/.test(text))return 'Фотография';
 return 'Ню / искусство';
}
async function search(reset=true){
 if(state.loading)return;
 if(reset){state.items=[];state.offset=0;state.query=$('search').value.trim();state.showFav=false;}
 state.loading=true;$('moreBtn').disabled=true;setStatus('Загружаю и проверяю метаданные лицензии…');
 const q=state.query||'artistic nude photography';
 const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:q+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'30',gsroffset:String(state.offset),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640',format:'json',origin:'*'});
 try{
  const r=await fetch(api+'?'+params);if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  const found=Object.values(data.query?.pages||{}).map(p=>{
   const ii=p.imageinfo?.[0],m=ii?.extmetadata||{};
   if(!ii?.thumburl||!ii?.descriptionurl||!licenseAllowed(m))return null;
   return {id:p.pageid,title:p.title.replace(/^File:/,''),thumb:ii.thumburl,original:ii.url,source:ii.descriptionurl,license:clean(m.LicenseShortName?.value),licenseUrl:m.LicenseUrl?.value||ii.descriptionurl,artist:clean(m.Artist?.value||'Не указан'),category:classify(m,p.title)};
  }).filter(Boolean);
  const seen=new Set(state.items.map(x=>x.id));
  // Limit repeated uploads from the same credited artist so one photo session
  // cannot dominate the whole result grid.
  const artistCounts=new Map();
  for(const item of state.items){
   const key=(item.artist||'').toLowerCase().trim();
   artistCounts.set(key,(artistCounts.get(key)||0)+1);
  }
  const diversified=[];
  for(const item of found){
   if(seen.has(item.id))continue;
   const key=(item.artist||'').toLowerCase().trim();
   const count=artistCounts.get(key)||0;
   if(key && count>=2)continue;
   diversified.push(item);
   if(key)artistCounts.set(key,count+1);
  }
  state.items.push(...diversified);state.offset+=30;
  renderPublic();
  setStatus(state.items.length?`Загружено ${state.items.length}. Показаны только файлы с распознанной открытой лицензией.`:'Ничего не найдено. Попробуйте другой запрос.');
 }catch(e){setStatus('Не удалось получить данные Wikimedia Commons. Проверьте соединение и повторите попытку.');}
 finally{state.loading=false;$('moreBtn').disabled=false;$('moreBtn').classList.toggle('hidden',!state.items.length);}
}
function renderPublic(){
 let arr=state.showFav?state.items.filter(x=>state.favorites.has(String(x.id))):[...state.items];
 // Enforce variety at render time too, including results loaded before an update.
 const artistCounts=new Map();
 arr=arr.filter(item=>{
  const key=(item.artist||'').toLowerCase().replace(/\s+/g,' ').trim();
  if(!key||key==='не указан')return true;
  const count=artistCounts.get(key)||0;
  if(count>=1)return false;
  artistCounts.set(key,count+1);
  return true;
 });
 if($('sort').value==='title')arr.sort((a,b)=>a.title.localeCompare(b.title));
 $('results').innerHTML=arr.map(x=>`<article class="card"><button class="heart" data-heart="${x.id}" aria-label="Избранное">${state.favorites.has(String(x.id))?'♥':'♡'}</button><img loading="lazy" src="${esc(x.thumb)}" alt="Миниатюра из Wikimedia Commons" data-view="${x.id}"><div class="info"><div class="title">${esc(x.title)}</div><span class="badge">${esc(x.category)}</span><span class="badge">${esc(x.license)}</span><div class="muted">Автор: ${esc(x.artist)}</div><button data-view="${x.id}" style="margin-top:7px;width:100%">Подробнее</button></div></article>`).join('');
}
function openViewer(x){
 $('viewTitle').textContent=x.title;$('viewImage').src=x.original;$('viewMeta').textContent=`Автор: ${x.artist||'не указан'} · Лицензия: ${x.license||'неизвестна'}`;
 $('sourceLink').href=x.source||'#';$('licenseLink').href=x.licenseUrl||x.source||'#';$('viewer').classList.remove('hidden');
}
function renderPrivate(){
 const favOnly=state.privateFavOnly;
 const files=state.privateFiles.filter(f=>!favOnly||state.privateFavs.has(f.id));
 $('privateGrid').innerHTML=files.map(f=>`<article class="card"><button class="heart" data-pfav="${f.id}">${state.privateFavs.has(f.id)?'♥':'♡'}</button><img src="${f.url}" alt="Локальный файл"><div class="info"><div class="title">${esc(f.name)}</div><span class="badge">Локальный файл</span></div></article>`).join('');
 $('privateStatus').textContent=`Файлов: ${state.privateFiles.length}. Хранятся только в памяти этой вкладки.`;
}
$('ageCheck').addEventListener('change',()=>{$('enter').disabled=!$('ageCheck').checked});
$('enter').addEventListener('click',()=>{if(!$('ageCheck').checked)return;$('ageGate').classList.add('hidden');$('app').classList.remove('hidden');search();});
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{
 state.section=b.dataset.section;document.querySelectorAll('[data-section]').forEach(x=>x.classList.toggle('active',x===b));
 $('artPanel').classList.toggle('hidden',state.section!=='art');$('privatePanel').classList.toggle('hidden',state.section!=='private');
}));
$('searchBtn').addEventListener('click',()=>search());$('search').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
$('refreshBtn').addEventListener('click',()=>search());$('moreBtn').addEventListener('click',()=>search(false));
$('sort').addEventListener('change',renderPublic);
$('allBtn').addEventListener('click',()=>{state.showFav=false;renderPublic();setStatus('Все загруженные результаты');});
$('favBtn').addEventListener('click',()=>{state.showFav=true;renderPublic();setStatus('Избранное');});
$('results').addEventListener('click',e=>{
 const h=e.target.closest('[data-heart]');if(h){const id=String(h.dataset.heart);state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);persistFavs();renderPublic();return;}
 const v=e.target.closest('[data-view]');if(v){const x=state.items.find(y=>String(y.id)===String(v.dataset.view));if(x)openViewer(x);}
});
$('closeViewer').addEventListener('click',()=>$('viewer').classList.add('hidden'));
$('viewer').addEventListener('click',e=>{if(e.target===$('viewer'))$('viewer').classList.add('hidden');});
$('localFiles').addEventListener('change',e=>{
 const files=[...e.target.files].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
 for(const f of files){state.privateFiles.push({id:crypto.randomUUID(),name:f.name,url:URL.createObjectURL(f)});}
 renderPrivate();e.target.value='';
});
$('privateGrid').addEventListener('click',e=>{const b=e.target.closest('[data-pfav]');if(!b)return;const id=b.dataset.pfav;state.privateFavs.has(id)?state.privateFavs.delete(id):state.privateFavs.add(id);renderPrivate();});
$('privateFav').addEventListener('click',()=>{state.privateFavOnly=!state.privateFavOnly;renderPrivate();});
$('clearPrivate').addEventListener('click',()=>{state.privateFiles.forEach(f=>URL.revokeObjectURL(f.url));state.privateFiles=[];state.privateFavs.clear();state.privateFavOnly=false;renderPrivate();});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
