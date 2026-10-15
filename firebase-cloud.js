/* GiraAI v2.5 - Firebase CDN modular SDK. Configuracao web publica: acessos sao controlados pelas regras do Firestore. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
 apiKey:'AIzaSyD2UTu6u_oHc44dmr1AFhz6YjB-XPKiJdY',
 authDomain:'cubo3d-rsp.firebaseapp.com',
 projectId:'cubo3d-rsp',
 storageBucket:'cubo3d-rsp.firebasestorage.app',
 messagingSenderId:'1026382169408',
 appId:'1:1026382169408:web:ffd046a6b8e19c32f7a6a5'
};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider();
const $=id=>document.getElementById(id), bridge=window.GiraAICloudBridge;
let user=null, mode='both', ready=false, loading=false, syncTimer=null, syncing=false, dirty=false;
let lastHistoryString='', token=0, revision=0, currentLocation={country:'',state:'',city:''};
const activeCloud={get user(){return user},get ready(){return ready},get mode(){return mode},queueSave,publishWin,loadRanking};
window.GiraCloud=activeCloud;
function localModeKey(uid){return 'giraai_cloud_mode_'+uid}
function localDirtyKey(uid){return 'giraai_cloud_dirty_'+uid}
function localLocKey(uid){return 'giraai_public_location_'+uid}
function setText(id,value){let el=$(id);if(el)el.textContent=value}
function status(msg){setText('cloud-sync-state',msg)}
function feedback(msg){setText('login-feedback',msg)}
function showAccount(){
 let connected=!!user, display=user?.email||user?.displayName||'Conta Google conectada';
 for(const id of ['mobile-auth-status','desktop-auth-status','cloud-account-status']){
  let el=$(id);if(!el)continue;el.classList.toggle('online',connected);el.querySelector('span:last-child').textContent=connected?display:'Login não efetuado';
 }
 $('open-login-btn').classList.toggle('hidden',connected);$('logout-btn').classList.toggle('hidden',!connected);
 document.querySelectorAll('input[name="cloud-storage-mode"]').forEach(e=>e.checked=e.value===mode);
 bridge?.refreshHistory?.();
}
function explainError(err){
 const code=err?.code||'';
 const pt={
  'auth/invalid-email':'E-mail inválido.','auth/invalid-credential':'E-mail ou senha incorretos.','auth/wrong-password':'Senha incorreta.',
  'auth/email-already-in-use':'Este e-mail já está cadastrado. Entre na conta.','auth/weak-password':'Use uma senha mais forte (pelo menos 6 caracteres).',
  'auth/popup-closed-by-user':'A janela do Google foi fechada.','auth/popup-blocked':'O navegador bloqueou o login. Permita pop-ups ou tente novamente.',
  'auth/unauthorized-domain':'Domínio não autorizado. Adicione o domínio do GitHub Pages em Firebase Authentication → Configurações → Domínios autorizados.',
  'permission-denied':'Acesso bloqueado pelo Firestore. Publique firestore.rules no console do Firebase.',
  'unavailable':'Sem conexão com Firebase. O jogo continua salvo localmente.'
 };
 return pt[code]||`Operação não concluída (${code||err?.message||'erro de rede'}).`;
}
function authInputs(){return {email:$('auth-email').value.trim(),password:$('auth-password').value}}
window.openCloudSettings=()=>{$('cloud-overlay').classList.remove('hidden');showAccount()};
window.closeCloudSettings=()=>{$('cloud-overlay').classList.add('hidden')};
window.openLogin=()=>{$('cloud-overlay').classList.remove('hidden');$('login-overlay').classList.remove('hidden');feedback('');};
window.closeLogin=()=>{$('login-overlay').classList.add('hidden');feedback('')};
window.loginWithGoogle=async()=>{
 feedback('Abrindo Google...');
 try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,provider)}
 catch(e){if(e.code==='auth/popup-blocked'){feedback('Abrindo login por redirecionamento...');try{await signInWithRedirect(auth,provider)}catch(e2){feedback(explainError(e2))}}else feedback(explainError(e))}
};
window.submitEmailLogin=async(e)=>{e.preventDefault();const {email,password}=authInputs();feedback('Entrando...');try{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email,password)}catch(err){feedback(explainError(err))}};
window.createEmailAccount=async()=>{const {email,password}=authInputs();if(!email||password.length<6){feedback('Informe um e-mail e senha com pelo menos 6 caracteres.');return}feedback('Criando conta...');try{await setPersistence(auth,browserLocalPersistence);await createUserWithEmailAndPassword(auth,email,password)}catch(err){feedback(explainError(err))}};
window.sendResetEmail=async()=>{let email=$('auth-email').value.trim();if(!email){feedback('Digite o e-mail para recuperar a senha.');return}try{await sendPasswordResetEmail(auth,email);feedback('Se houver uma conta correspondente, você receberá instruções por e-mail.')}catch(err){feedback(explainError(err))}};
window.logoutGiraAI=async()=>{try{if(syncTimer)clearTimeout(syncTimer);if(user&&mode==='both'&&dirty)await pushCloud();await signOut(auth);status('Você saiu da conta. Os dados locais da conta continuam neste navegador.')}catch(e){status(explainError(e))}};
window.setCloudMode=(value)=>{if(!['local','both'].includes(value))return;mode=value;if(user)localStorage.setItem(localModeKey(user.uid),value);showAccount();if(value==='both'){status('Nuvem habilitada. Sincronizando alterações deste aparelho...');queueSave()}else{if(syncTimer)clearTimeout(syncTimer);status('Somente local: seus dados não serão enviados à nuvem.')}};
function cloudDocs(uid){return {state:doc(db,'usuarios',uid,'dados','estado'),history:doc(db,'usuarios',uid,'dados','historico'),profile:doc(db,'usuarios',uid,'dados','perfil')}}
function prepareData(){const data=bridge.getProfile();return {state:{state:data.state||null,slots:data.slots||{},mobilePrefs:data.mobilePrefs||null},history:data.history||[]}}
function queueSave(){if(!user||!ready||mode!=='both'||loading)return;revision++;dirty=true;localStorage.setItem(localDirtyKey(user.uid),'1');if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(()=>{pushCloud().catch(e=>status(explainError(e)))},2700)}
async function pushCloud(){
 if(!user||!ready||mode!=='both'||loading||syncing)return;
 const uid=user.uid,cycle=token,sentRevision=revision;syncing=true;if(syncTimer)clearTimeout(syncTimer);
 try{
  const all=prepareData(),refs=cloudDocs(uid),histStr=JSON.stringify(all.history);
  status('Enviando dados à nuvem...');
  // A partida atual e os quatro modelos ficam no documento privado estado.
  await setDoc(refs.state,{schema:1,payload:all.state,savedAt:serverTimestamp()});
  if(histStr!==lastHistoryString){await setDoc(refs.history,{schema:1,registros:all.history,savedAt:serverTimestamp()});lastHistoryString=histStr}
  if(cycle===token&&user?.uid===uid){if(sentRevision===revision){dirty=false;localStorage.removeItem(localDirtyKey(uid));status('✓ Seus jogos e configurações foram sincronizados com a nuvem.')}else status('Alterações novas aguardam a próxima sincronização.');}
 }catch(err){dirty=true;if(user?.uid===uid)localStorage.setItem(localDirtyKey(uid),'1');status(explainError(err));throw err}
 finally{syncing=false}
}
async function fetchCloud(){if(!user||mode!=='both')return null;const uid=user.uid, refs=cloudDocs(uid),[state,history,profile]=await Promise.all([getDoc(refs.state),getDoc(refs.history),getDoc(refs.profile)]);return {state:state.exists()?state.data().payload:null,history:history.exists()?(history.data().registros||[]):null,profile:profile.exists()?profile.data():null}}
function setLocation(loc){currentLocation={country:String(loc?.country||'').slice(0,48),state:String(loc?.state||'').slice(0,56),city:String(loc?.city||'').slice(0,64)};for(const k of ['country','state','city'])$('profile-'+k).value=currentLocation[k];if(user)localStorage.setItem(localLocKey(user.uid),JSON.stringify(currentLocation))}
window.saveCloudProfile=async()=>{
 let loc={country:$('profile-country').value.trim(),state:$('profile-state').value.trim(),city:$('profile-city').value.trim()};setLocation(loc);
 if(!user){setText('cloud-profile-feedback','Faça login para vincular a localização ao seu perfil.');return}
 if(mode==='local'){setText('cloud-profile-feedback','Local salvo neste aparelho. Para enviar para a nuvem, escolha Local + nuvem.');return}
 try{await setDoc(cloudDocs(user.uid).profile,{...currentLocation,savedAt:serverTimestamp()});setText('cloud-profile-feedback','Localização opcional salva. Ela aparecerá nos seus novos resultados publicados.')}catch(e){setText('cloud-profile-feedback',explainError(e))}
};
window.detectApproxLocation=async()=>{
 if(!confirm('Consultar país, estado e cidade aproximados por endereço IP usando o serviço externo ipwho.is? O endereço IP será enviado a esse serviço. Nenhum GPS será utilizado.'))return;
 setText('cloud-profile-feedback','Buscando localização aproximada...');
 try{let response=await fetch('https://ipwho.is/',{cache:'no-store'});if(!response.ok)throw Error('Serviço indisponível');let p=await response.json();if(!p.success)throw Error('Localização não disponível');setLocation({country:p.country||'',state:p.region||'',city:p.city||''});setText('cloud-profile-feedback','Preenchido aproximadamente. Confira os dados e toque em Salvar perfil.')}catch(_){setText('cloud-profile-feedback','Não foi possível detectar. Você pode preencher manualmente.')}
};
window.syncCloudNow=async()=>{if(!user){window.openCloudSettings();status('Faça login primeiro.');return}if(mode!=='both'){window.openCloudSettings();status('Ative Local + nuvem para sincronizar.');return}if(loading||!ready){status('Carregando conta...');return}dirty=true;await pushCloud().catch(()=>{})};
// Buscar explicitamente as cópias remotas, sem sobrescrever silenciosamente uma partida local.
window.pullCloudNow=async()=>{
 if(!user||mode!=='both')return;try{const remote=await fetchCloud();if(!remote?.state)return status('Não há jogo salvo na nuvem.');if(!confirm('Substituir o progresso deste aparelho pelos dados da nuvem?'))return;loading=true;bridge.applyCloud({...remote.state,history:remote.history||[]});lastHistoryString=JSON.stringify(remote.history||[]);localStorage.removeItem(localDirtyKey(user.uid));status('✓ Dados da nuvem recuperados.')}catch(e){status(explainError(e))}finally{loading=false}
};
window.publishWin=async(record)=>{
 if(!user||mode!=='both'||!record?.won||!record?.id)return;
 const uid=user.uid,ptype=record.puzzle; if(!['2','3','4','pyramid'].includes(ptype))return;
 let durationMs=Math.round(Number(record.duration)),count=Math.round(Number(record.count));
 if(!Number.isFinite(durationMs)||durationMs<1000||durationMs>86400000||!Number.isInteger(count)||count<1||count>100000)return;
 try{
  const ref=doc(db,'ranking',uid+'_'+ptype),prior=await getDoc(ref);
  if(prior.exists()){
   const past=prior.data();if(past.durationMs<durationMs||(past.durationMs===durationMs&&past.count<=count)){status('Seu resultado ficou salvo no histórico. O melhor tempo global anterior foi mantido.');return}
  }
  await setDoc(ref,{uid,puzzle:ptype,name:record.name.slice(0,36),durationMs,count,when:record.when,
   country:currentLocation.country,state:currentLocation.state,city:currentLocation.city,savedAt:serverTimestamp()});
  status('🏆 Seu melhor tempo foi publicado no ranking global!');
 }catch(e){status('Partida salva pessoalmente, mas não publicada no global: '+explainError(e))}
};
async function loadRanking(){
 const list=$('global-record-list');if(!list)return;
 const puzzle=$('global-rank-type').value,sort=$('global-rank-sort').value;
 list.replaceChildren();const p=document.createElement('p');p.textContent='Carregando ranking global...';list.append(p);
 try{
  // Firestore requer indice composto (puzzle ASC, durationMs/count ASC). Arquivo firestore.indexes.json incluido.
  const q=query(collection(db,'ranking'),where('puzzle','==',puzzle),orderBy(sort,'asc'),limit(50));
  const docs=await getDocs(q);list.replaceChildren();if(docs.empty){let none=document.createElement('p');none.textContent='Nenhum recorde publicado neste modelo.';list.append(none);return}
  docs.forEach((d,i)=>{
   const r=d.data(),row=document.createElement('div'),left=document.createElement('div'),name=document.createElement('div'),sub=document.createElement('small');row.className='record';name.className='name';
   name.textContent=(i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':`${i+1}º · `)+(r.name||'Jogador');
   let loc=[r.city,r.state,r.country].filter(Boolean).join(' · ');let s=Math.floor(r.durationMs/1000),mins=Math.floor(s/60);let dt=Date.parse(r.when||'');let date=Number.isFinite(dt)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(dt)):'';
   sub.textContent=`${String(mins).padStart(2,'0')}:${String(s%60).padStart(2,'0')} · ${r.count} mov.${loc?' · '+loc:''}${date?' · '+date:''}`;
   left.append(name,sub);row.append(left);list.append(row);
  });
 }catch(e){list.replaceChildren();let err=document.createElement('p');err.textContent='Não foi possível carregar o ranking: '+explainError(e)+' Verifique também os índices do Firestore.';list.append(err)}
}
async function handleAuth(next){
 const newToken=++token;
 if(syncTimer)clearTimeout(syncTimer);
 // Salva primeiro o perfil anterior; cada conta tem chaves locais isoladas.
 if(user?.uid===next?.uid&&ready){showAccount();return}
 ready=false;loading=true;dirty=false;revision=0;lastHistoryString='';user=next||null;
 mode=user?localStorage.getItem(localModeKey(user.uid))||'both':'both';
 // Manter cópia do convidado apenas para importação consciente na primeira entrada.
 let guestData=null;try{if(user&&!bridge.hasCache(user.uid)){
   const current=bridge.getProfile();if(!window.giraAIHadAccount)guestData=current;
 }}catch(_){ }
 const switched=bridge.useProfile(user?.uid||null);
 try{if(user)localStorage.setItem('giraai_last_uid',user.uid);else localStorage.removeItem('giraai_last_uid')}catch(_){ }
 window.giraAIHadAccount=!!user;
 if(!switched){loading=false;showAccount();return}
 setLocation(user?JSON.parse(localStorage.getItem(localLocKey(user.uid))||'null'):null);
 showAccount();
 if(!user){status('Login não efetuado. Jogo local disponível.');loading=false;ready=true;return}
 if(mode==='local'){loading=false;ready=true;status('Conta conectada. Os dados estão configurados para permanecer somente neste aparelho.');window.closeLogin();window.closeCloudSettings();window.showGiraAIWelcome?.('Bem-vindo ao GiraAI! Modo local ativado.');return}
 status('Conectado. Buscando configurações pessoais e jogos na nuvem...');
 try{
  const remote=await fetchCloud();if(newToken!==token)return;
  if(remote?.profile)setLocation(remote.profile);
  const hasRemote=!!remote?.state;
  const hasCache=bridge.hasCache(user.uid);
  const unsynced=localStorage.getItem(localDirtyKey(user.uid))==='1';
  if(hasRemote&&!unsynced){
   bridge.applyCloud({...remote.state,history:remote.history||[]});
   lastHistoryString=JSON.stringify(remote.history||[]);
   status('Bem-vindo! Seus jogos e configurações foram recuperados da nuvem.');
  }else if(hasRemote&&unsynced){status('Bem-vindo! Há alterações locais ainda não enviadas. Sincronize para enviá-las.');dirty=true}
  else if(!hasCache && guestData?.state && confirm('Você tem progresso neste dispositivo. Deseja importá-lo para esta nova conta?')){
   bridge.applyCloud(guestData);dirty=true;status('Bem-vindo! Progresso local importado para sua conta.');
  }else status('Bem-vindo! Sua conta está pronta. Misture um cubo para começar.');
  loading=false;ready=true;
  window.closeLogin();window.closeCloudSettings();window.showGiraAIWelcome?.('Bem-vindo ao GiraAI! Conta conectada.');
  if(dirty||!hasRemote)queueSave();
 }catch(e){if(newToken!==token)return;loading=false;ready=true;status('Conta conectada, mas a nuvem não foi carregada: '+explainError(e));window.closeLogin();window.showGiraAIWelcome?.('Conta conectada. Os dados locais continuam disponíveis.')}
 showAccount();
}
// Uma volta do redirecionamento Google dispara auth observer normalmente.
getRedirectResult(auth).catch(e=>feedback(explainError(e)));
onAuthStateChanged(auth,handleAuth,e=>{status('Falha na autenticação: '+explainError(e));showAccount()});
