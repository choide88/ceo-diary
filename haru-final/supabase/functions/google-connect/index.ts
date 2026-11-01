// Deploy with --no-verify-jwt: OAuth callback is public; all other actions verify the Supabase user AND allowlist.
import {createClient} from 'npm:@supabase/supabase-js@2';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error('CONFIG');return value};
const errorCode=(e:unknown)=>e instanceof Error?e.message:'';
const CAL=['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const TASK='https://www.googleapis.com/auth/tasks.readonly';
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const base64=(b:Uint8Array)=>btoa(String.fromCharCode(...b));
async function cryptKey(){const raw=bytes(env('GOOGLE_TOKEN_KEY'));if(raw.length!==32)throw Error('CONFIG');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(value:string,owner:string){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await cryptKey(),new TextEncoder().encode(value));return base64(iv)+'.'+base64(new Uint8Array(data));}
async function decrypt(value:string,owner:string){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(owner)},await cryptKey(),bytes(data)));}
async function hash(value:string){return base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
async function googleToken(params:Record<string,string>){const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET')}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error==='invalid_grant'?'RECONNECT':'GOOGLE');return data;}
Deno.serve(async request=>{
 let app:URL;try{app=new URL(env('HARU_APP_URL'));if(app.protocol!=='https:'&&app.hostname!=='localhost')throw Error();}catch{return new Response(JSON.stringify({message:'장기 연결 서버의 환경변수 설정이 필요합니다.'}),{status:503,headers:{'Content-Type':'application/json'}})}
 const origin=request.headers.get('Origin'),cors={'Access-Control-Allow-Origin':app.origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
 if(origin&&origin!==app.origin)return reply(403,{message:'허용되지 않은 사이트입니다.'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const url=new URL(request.url),callback=url.searchParams.get('callback')==='1';
 const redirect=(ok:boolean)=>{const target=new URL(app);target.searchParams.set('google_connection',ok?'connected':'failed');return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})};
 try{
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}),clientId=env('GOOGLE_CLIENT_ID');
  const redirectUri=env('SUPABASE_URL')+'/functions/v1/google-connect?callback=1';
  if(callback){
   if(request.method!=='GET')return reply(405,{message:'지원하지 않는 요청입니다.'});
   const state=url.searchParams.get('state')||'';if(!state)return redirect(false);
   // Atomic consume: only one callback can claim a state. No raw state or token logging.
   const {data:row,error}=await db.from('haru_google_oauth_states').delete().eq('state_hash',await hash(state)).gt('expires_at',new Date().toISOString()).select().maybeSingle();
   if(error||!row||url.searchParams.has('error'))return redirect(false);
   const {data:member}=await db.from('haru_members').select('user_id').eq('user_id',row.user_id).maybeSingle();if(!member)return redirect(false);
   const code=url.searchParams.get('code');if(!code)return redirect(false);
   const data=await googleToken({code,grant_type:'authorization_code',redirect_uri:redirectUri});
   const scopes=String(data.scope||'').split(' ');if(!CAL.every(s=>scopes.includes(s))||(row.enable_tasks&&!scopes.includes(TASK)))return redirect(false);
   if(!data.refresh_token)return redirect(false);
   const saved=await db.from('haru_google_connections').upsert({user_id:row.user_id,encrypted_refresh:await encrypt(data.refresh_token,row.user_id),client_id:clientId,scopes:scopes.join(' '),updated_at:new Date().toISOString()});if(saved.error)return redirect(false);return redirect(true);
  }
  if(request.method!=='POST')return reply(405,{message:'지원하지 않는 요청입니다.'});
  const bearer=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!bearer)return reply(401,{message:'로그인해주세요.'});
  const {data:{user},error}=await db.auth.getUser(bearer);if(error||!user)return reply(401,{message:'로그인이 만료되었습니다.'});
  const {data:member}=await db.from('haru_members').select('user_id').eq('user_id',user.id).maybeSingle();if(!member)return reply(403,{message:'사용 권한이 없습니다.'});
  const body=await request.json();
  if(body.action==='begin'){
   await cryptKey();env('GOOGLE_CLIENT_SECRET');
   const state=base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
   await db.from('haru_google_oauth_states').delete().lt('expires_at',new Date().toISOString());
   const stored=await db.from('haru_google_oauth_states').insert({state_hash:await hash(state),user_id:user.id,enable_tasks:body.enableTasks===true,expires_at:new Date(Date.now()+600000).toISOString()});if(stored.error)throw Error('CONFIG');
   const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');auth.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:[...CAL,...(body.enableTasks===true?[TASK]:[])].join(' '),access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',state}).toString();return reply(200,{url:auth.href});
  }
  const {data:connection,error:readError}=await db.from('haru_google_connections').select().eq('user_id',user.id).maybeSingle();if(readError)throw Error('CONFIG');
  if(body.action==='disconnect'){
   const deleted=await db.from('haru_google_connections').delete().eq('user_id',user.id);if(deleted.error)throw Error('CONFIG');await db.from('haru_google_oauth_states').delete().eq('user_id',user.id);
   if(connection){try{await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:await decrypt(connection.encrypted_refresh,user.id)}),signal:AbortSignal.timeout(10000)});}catch{ /* local grant has already been removed */ }}return reply(200,{disconnected:true});
  }
  if(body.action!=='token')return reply(400,{message:'지원하지 않는 요청입니다.'});
  if(!connection||connection.client_id!==clientId)return reply(409,{message:'Google 계정의 계속 연결하기를 한 번 완료해주세요.'});
  let data;try{data=await googleToken({grant_type:'refresh_token',refresh_token:await decrypt(connection.encrypted_refresh,user.id)});}catch(e){if(errorCode(e)==='RECONNECT'){await db.from('haru_google_connections').delete().eq('user_id',user.id);return reply(409,{message:'Google 연결 동의가 만료되거나 취소됐습니다. 계속 연결하기를 다시 눌러주세요.'});}throw e;}
  // Google may rotate the refresh token. Compare old ciphertext so disconnect/concurrent renewals cannot recreate a removed grant.
  if(data.refresh_token){const saved=await db.from('haru_google_connections').update({encrypted_refresh:await encrypt(data.refresh_token,user.id),updated_at:new Date().toISOString()}).eq('user_id',user.id).eq('encrypted_refresh',connection.encrypted_refresh).select('user_id');if(saved.error||!saved.data?.length)return reply(409,{message:'연결이 변경되었습니다. 다시 연결해주세요.'});}
  const {data:stillConnected}=await db.from('haru_google_connections').select('user_id').eq('user_id',user.id).maybeSingle();if(!stillConnected)return reply(409,{message:'Google 연결이 해제되었습니다.'});
  const scopes=String(data.scope||connection.scopes).split(' ');if(!CAL.every(s=>scopes.includes(s)))return reply(409,{message:'캘린더 읽기 권한을 다시 허용해주세요.'});return reply(200,{access_token:data.access_token,expires_in:data.expires_in,tasksAllowed:scopes.includes(TASK)});
 }catch(e){if(callback)return redirect(false);return reply(errorCode(e)==='CONFIG'?503:502,{message:errorCode(e)==='CONFIG'?'장기 연결 서버의 SQL·환경변수 설정이 필요합니다.':'Google 연결을 갱신하지 못했습니다. 잠시 후 다시 시도해주세요.'});}
});
