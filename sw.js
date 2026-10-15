/* GiraAI PWA v2.5: cache somente de arquivos proprios. SDK Firebase e dados ficam na rede/Firestore. */
const CACHE='giraai-static-v3.1';
const CORE=['./','./index.html','./manifest.webmanifest','./firebase-cloud.js','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png','./assets/giraai-logo.png','./assets/giraai-preview.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('giraai-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const r=event.request;
 if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 const pathname=new URL(r.url).pathname;
 if(pathname.endsWith('/Imagem1.jpg')||/\/Imagem[2-6]\.jpg$/.test(pathname))return;
 if(r.mode==='navigate'){
  event.respondWith(fetch(r).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy))}return response}).catch(()=>caches.match('./index.html')));
  return;
 }
 event.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return response})));
});
