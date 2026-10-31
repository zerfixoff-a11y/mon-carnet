const V='carnet-v12',F=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});

// ---- rappels (même logique que dans l'application)
const pad2=n=>String(n).padStart(2,'0');
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
 const N=S.notify||{};if(!N.on)return[];
 if(now-last>3*864e5)last=now-3*864e5;
 const NT={medical:'Médical',rdv:'Rendez-vous',admin:'Démarche',money:'Facture',home:'Maison',car:'Voiture',pet:'Animal',trip:'Voyage',contract:'Contrat',birthday:'Anniversaire',person:'Anniversaire',med:'Médicament',libre:null};
 const MON=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
 const cats={};(S.cats||[]).forEach(c=>cats[c.id]=c);
 const a=addDay(isoD(new Date(last)),-1),b=addDay(isoD(new Date(now)),2),out=[];
 (S.items||[]).forEach(i=>{const c=cats[i.cat];if(!c||!(c.type in NT)||i.done)return;
  const al=(i.al===undefined||i.al===''||i.al===null)?0:+i.al;if(al<0)return;
  const med=c.type==='med';let days=[];
  if(c.type==='birthday'||c.type==='person'){const d=+i.bd,m=MON.indexOf(i.bm);if(!d||m<0)return;
   for(let y=+a.slice(0,4);y<=+b.slice(0,4);y++){const x=y+'-'+pad2(m+1)+'-'+pad2(d);if(x>=a&&x<=b)days.push(x)}}
  else if(med)days=occIn(i.date||a,i.rep||'Chaque jour',a,b).filter(x=>!i.end||x<=i.end);
  else days=occIn(i.date,i.rep,a,b);
  let times=med?[i.t1,i.t2,i.t3,i.t4].filter(Boolean):[i.time||'09:00'];
  if(med&&!times.length)times=['08:00'];
  days.forEach(x=>{const p=x.split('-');times.forEach(tm=>{const hm=tm.split(':');
   const ev=new Date(+p[0],+p[1]-1,+p[2],+hm[0],+hm[1]).getTime(),f=ev-(med?0:al)*60000;
   if(f>last&&f<=now){
    let name=i.title||'';
    if(med&&i.dose)name+=' · '+i.dose;
    if(c.type==='birthday'||c.type==='person'){const age=+i.by>1900?+x.slice(0,4)-i.by:0;if(age)name+=' ('+age+' ans)'}
    let when=al===1440&&!med?'Demain à '+tm:(al>0&&!med?'Dans '+(al>=60?(al/60)+' h':al+' min')+' · à '+tm:tm);
    if(now-f>20*60000)when='Manqué · '+when;
    out.push({f,tag:'carnet-'+i.id+'-'+f,title:NT[c.type]||c.name,body:name+'\n'+when})}})});
 });
 return out.sort((u,v)=>u.f-v.f);
}

const idbo=()=>new Promise((res,rej)=>{const r=indexedDB.open('mon-carnet-db',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const kvG=k=>idbo().then(db=>new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}));
const kvS=(k,v)=>idbo().then(db=>new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)}));
async function swCheck(){
 const S=await kvG('state');if(!S)return;
 const now=Date.now(),last=await kvG('nlast');
 if(!last){await kvS('nlast',now);return}
 const list=carnetDue(S,last,now);await kvS('nlast',now);
 for(const n of list)await self.registration.showNotification(n.title,{body:n.body,icon:'icon-192.png',badge:'icon-192.png',tag:n.tag,renotify:true,requireInteraction:true,vibrate:[300,150,300,150,300],silent:(S.notify&&S.notify.sound)==='aucun',data:{url:'./index.html'}});
}
self.addEventListener('periodicsync',e=>{if(e.tag==='carnet-check')e.waitUntil(swCheck())});
self.addEventListener('notificationclick',e=>{e.notification.close();
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus()}return clients.openWindow('./index.html')}))});
