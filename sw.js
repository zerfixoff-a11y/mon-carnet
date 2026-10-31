const V='carnet-v9',F=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});

// ---- rappels (lecture de la mémoire du carnet, même application fermée si le navigateur le permet)
const REPS=['Jamais','Chaque jour','Chaque semaine','Chaque mois','Chaque année'];
const RR={'Chaque jour':'DAILY','Chaque semaine':'WEEKLY','Chaque mois':'MONTHLY','Chaque année':'YEARLY'};
const isoD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const addDay=(s,n)=>{const d=new Date(s+'T12:00');d.setDate(d.getDate()+n);return isoD(d)};
const dimo=(y,m)=>new Date(y,m+1,0).getDate();
function repNext(date,rep,from){
 if(!date||!rep||rep==='Jamais'||date>=from)return date;
 const d=new Date(date+'T12:00'),f=new Date(from+'T12:00');
 if(rep==='Chaque jour')return from;
 if(rep==='Chaque semaine'){const days=Math.round((f-d)/864e5);return addDay(date,Math.ceil(days/7)*7)}
 const day=d.getDate();let y=d.getFullYear(),m=d.getMonth(),c;
 const mk=()=>new Date(y,m,Math.min(day,dimo(y,m)),12);
 if(rep==='Chaque mois'){c=mk();while(c<f){m++;if(m>11){m=0;y++}c=mk()}}
 else{c=mk();while(c<f){y++;c=mk()}}
 return isoD(c);
}
function occIn(date,rep,a,b){
 if(!date)return[];
 if(!rep||rep==='Jamais')return date>=a&&date<=b?[date]:[];
 const out=[];let x=repNext(date,rep,a),k=0;
 while(x&&x<=b&&k++<400){out.push(x);x=repNext(date,rep,addDay(x,1))}
 return out;
}
function carnetDue(S,last,now){
 const N=S.notify||{};if(!N.on||!(N.rem||[]).length)return[];
 const MON=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
 const cats={};(S.cats||[]).forEach(c=>cats[c.id]=c);
 const t0=new Date(now);t0.setHours(0,0,0,0);
 const ev=[];
 (S.items||[]).forEach(i=>{const c=cats[i.cat];if(!c||i.done)return;
  if(c.type==='birthday'||c.type==='person'){const d=+i.bd,m=MON.indexOf(i.bm);if(!d||m<0)return;
   [t0.getFullYear(),t0.getFullYear()+1].forEach(y=>ev.push({d:new Date(y,m,d),i,c,b:1}))}
  else if(i.date){occIn(i.date,i.rep,isoD(t0),addDay(isoD(t0),60)).forEach(x=>{const p=x.split('-');ev.push({d:new Date(+p[0],+p[1]-1,+p[2]),i,c})})}});
 const G={};
 ev.forEach(e=>{if(e.d<t0)return;N.rem.forEach(r=>{const hm=(r.t||'09:00').split(':');
  const f=new Date(e.d.getFullYear(),e.d.getMonth(),e.d.getDate()-(+r.d||0),+hm[0],+hm[1]).getTime();
  if(f>last&&f<=now){const k=f+'|'+r.d;(G[k]=G[k]||{f,d:+r.d||0,l:[]}).l.push(e)}})});
 return Object.keys(G).map(k=>{const g=G[k],n=g.l.length,lab=g.d===0?'Aujourd’hui':g.d===1?'Demain':'Dans '+g.d+' jours',late=now-g.f>20*60000;
  const lines=g.l.map(e=>{const i=e.i;if(e.b){const age=+i.by>1900?' ('+(e.d.getFullYear()-i.by)+' ans)':'';return 'Anniversaire de '+i.title+age}
   return i.title+(i.time?' à '+i.time:'')+' · '+e.c.name});
  return{tag:'carnet-'+k,title:(late?'Rappel manqué · ':'')+lab+(n>1?' : '+n+' choses':''),body:lines.join('\n')}})}

const idbo=()=>new Promise((res,rej)=>{const r=indexedDB.open('mon-carnet-db',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const kvG=k=>idbo().then(db=>new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
const kvS=(k,v)=>idbo().then(db=>new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)}));
async function swCheck(){
 const S=await kvG('state');if(!S)return;
 const now=Date.now(),last=await kvG('nlast');
 if(!last){await kvS('nlast',now);return}
 const list=carnetDue(S,last,now);await kvS('nlast',now);
 for(const n of list)await self.registration.showNotification(n.title,{body:n.body,icon:'icon-192.png',badge:'icon-192.png',tag:n.tag,data:{url:'./index.html'}});
}
self.addEventListener('periodicsync',e=>{if(e.tag==='carnet-check')e.waitUntil(swCheck())});
self.addEventListener('notificationclick',e=>{e.notification.close();
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus()}return clients.openWindow('./index.html')}))});
