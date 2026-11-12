import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep, extname } from 'node:path';
import { randomUUID, randomBytes, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { notifyChat, notifyMessage, notifyVisit, sendTelegram, startDigest, notifySettings, isBot, device, referrerHost, visitorId } from './notify.js';
import { assistantAvailable, assistantModel, assistantProvider, assistantSettings, cleanChatRequest, dailyLimit, demoMode, streamReply } from './assistant.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'));
const mediaDir = join(dataDir, 'media');
const distDir = join(root, 'dist');
const secret = process.env.SESSION_SECRET || '';
const password = process.env.ADMIN_PASSWORD || '';
if (secret.length < 32 || password.length < 16 || password.startsWith('replace-')) {
  console.error('Set SESSION_SECRET (32+ characters) and ADMIN_PASSWORD (16+ characters) before starting.');
  process.exit(1);
}
const passwordSalt = randomBytes(32);
const passwordHash = scryptSync(password, passwordSalt, 64);
const cookieSecure = process.env.SECURE_COOKIES === 'true';
await mkdir(mediaDir, {recursive:true});
const db = new DatabaseSync(join(dataDir, 'portfolio.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS documents (kind TEXT PRIMARY KEY, content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, kind TEXT NOT NULL, mime TEXT NOT NULL, filename TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, visitor TEXT NOT NULL, path TEXT NOT NULL, referrer TEXT NOT NULL, device TEXT NOT NULL, country TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS visits_day ON visits(day, visitor);
CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS chats_conversation ON chats(conversation, id);`);
db.prepare('DELETE FROM chats WHERE created_at < ?').run(new Date(Date.now()-90*86400000).toISOString());
db.prepare('DELETE FROM visits WHERE day < ?').run(new Date(Date.now()-400*86400000).toISOString().slice(0,10));
const seed = JSON.parse(await readFile(join(root,'server','seed.json'),'utf8'));
for (const kind of ['published','draft']) db.prepare('INSERT OR IGNORE INTO documents(kind,content,revision,updated_at) VALUES(?,?,1,?)').run(kind,JSON.stringify(seed),new Date().toISOString());
const published = () => JSON.parse(db.prepare("SELECT content FROM documents WHERE kind='published'").get().content);
const drafts = () => db.prepare("SELECT content,revision,updated_at FROM documents WHERE kind='draft'").get();
const loginAttempts = new Map(), contactAttempts = new Map(), viewAttempts = new Map(), chatAttempts = new Map(), chatDaily = new Map();
const chatBudget = { day: '', used: 0 };
const trustProxy = process.env.TRUST_PROXY === 'true';
const ownHost = (process.env.SITE_HOST || 'medamine.work').replace(/^www\./,'');
const now = () => new Date().toISOString();
const isStr = (value,max=300) => typeof value==='string' ? value.trim().slice(0,max) : '';
const cleanUrl = value => {const s=isStr(value,500);if(!s)return '';try {const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
const mediaUrl = value => /^\/media\/[0-9a-f-]{36}$/.test(value||'')?value:'';
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
const clampList = (value,n) => Array.isArray(value)?value.slice(0,n):[];
const sanitize = input => {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid content');
  const out={};
  for(const key of ['brand','role','headline','availability','location','contactHeadline','portraitAlt'])out[key]=isStr(input[key],180);
  out.portrait=mediaUrl(input.portrait);
  const a=input.assistant&&typeof input.assistant==='object'?input.assistant:{};
  out.assistant={enabled:a.enabled!==false,avatar:a.avatar!==false,name:isStr(a.name,60),greeting:isStr(a.greeting,400),suggestions:clampList(a.suggestions,8).map(x=>isStr(x,120)).filter(Boolean),facts:isStr(a.facts,3000)};
  for(const key of ['intro','about','contactText'])out[key]=isStr(input[key],1400);
  out.email=isStr(input.email,254);if(out.email&&!validEmail(out.email))throw Error('Enter a valid contact email');
  out.linkedin=cleanUrl(input.linkedin);out.github=cleanUrl(input.github);
  out.otherLinks=clampList(input.otherLinks,10).map(x=>({id:isStr(x.id,80)||randomUUID(),label:isStr(x.label,60),url:cleanUrl(x.url)})).filter(x=>x.label&&x.url);
  out.resume=mediaUrl(input.resume)||'/resume.pdf';
  out.stats=clampList(input.stats,12).map(x=>({id:isStr(x.id,80)||randomUUID(),value:isStr(x.value,40),label:isStr(x.label,150)}));
  out.projects=clampList(input.projects,30).map(x=>({id:isStr(x.id,80)||randomUUID(),category:isStr(x.category,80),name:isStr(x.name,160),summary:isStr(x.summary,2500),result:isStr(x.result,180),tags:clampList(x.tags,16).map(t=>isStr(t,45)).filter(Boolean),image:mediaUrl(x.image),imageAlt:isStr(x.imageAlt,180),link:cleanUrl(x.link),featured:x.featured===true,flow:clampList(x.flow,6).map(t=>isStr(t,40)).filter(Boolean),details:isStr(x.details,5000),
   period:isStr(x.period,60),subtitle:isStr(x.subtitle,140),domains:clampList(x.domains,8).map(t=>isStr(t,40)).filter(Boolean),repo:cleanUrl(x.repo),
   problem:isStr(x.problem,2500),decisions:isStr(x.decisions,3000),constraints:isStr(x.constraints,2500),features:clampList(x.features,12).map(t=>isStr(t,240)).filter(Boolean)}));
  const entries=xs=>clampList(xs,40).map(x=>({id:isStr(x.id,80)||randomUUID(),period:isStr(x.period,90),role:isStr(x.role,150),company:isStr(x.company,150),description:isStr(x.description,1200)}));
  out.experience=entries(input.experience);out.education=entries(input.education);
  out.skills=clampList(input.skills,80).map(x=>isStr(x,80)).filter(Boolean);
  return out;
};
function headers(res,code=200,extra={}){res.writeHead(code,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",...extra});}
function json(res,data,code=200){headers(res,code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function fail(res,code,message){json(res,{error:message},code)}
function empty(res){headers(res,204,{'Cache-Control':'no-store'});res.end()}
async function body(req,max){const parts=[];let count=0;for await(const chunk of req){count+=chunk.length;if(count>max)throw Object.assign(Error('File or request too large'),{status:413});parts.push(chunk)}return Buffer.concat(parts)}
const parseJson = async(req,max=600000)=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('Expected JSON'),{status:415});return JSON.parse((await body(req,max)).toString('utf8'))};
function sign(value){return createHmac('sha256',secret).update(value).digest('base64url')}
function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('portfolio_session='))?.slice(18);if(!cookie)return null;const [data,mac]=cookie.split('.');if(!data||!mac||!safeEqual(mac,sign(data)))return null;try{const parsed=JSON.parse(Buffer.from(data,'base64url'));if(parsed.exp<=Date.now())return null;return db.prepare('SELECT id FROM sessions WHERE id=? AND expires_at>?').get(parsed.id,Date.now())?parsed:null}catch{return null}}
function safeEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function csrf(s){return sign('csrf:'+s.id)}
function requireAdmin(req,res,mutate=false){const s=session(req);if(!s){fail(res,401,'Sign in to continue.');return null}if(mutate&& !safeEqual(req.headers['x-csrf-token']||'',csrf(s))){fail(res,403,'Session check failed. Refresh and try again.');return null}return s}
function rate(map,key,max,windowMs){const t=Date.now();const xs=(map.get(key)||[]).filter(x=>t-x<windowMs);xs.push(t);map.set(key,xs);return xs.length<=max}
// Behind Caddy every request comes from the proxy; with TRUST_PROXY=true use the client address it appends (rightmost entry, which the client cannot forge).
let proxyWarned=false;
function clientKey(req){if(!trustProxy&&!proxyWarned&&req.headers['x-forwarded-for']){proxyWarned=true;console.warn('Requests arrive through a proxy but TRUST_PROXY is not true: all visitors share one address, so rate limits and visitor counts are wrong. Set TRUST_PROXY=true in .env.')}if(trustProxy){const fwd=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean).pop();if(fwd)return fwd}return req.socket.remoteAddress||'unknown'}
async function file(res,path,mime,extra={}){try{const info=await stat(path);headers(res,200,{'Content-Type':mime,'Content-Length':info.size,...extra});createReadStream(path).pipe(res)}catch{fail(res,404,'Not found')}}
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.pdf':'application/pdf'};
function contentMatches(buffer,mime){if(mime==='image/png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(mime==='image/jpeg')return buffer[0]===255&&buffer[1]===216&&buffer[2]===255;if(mime==='image/webp')return buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';if(mime==='application/pdf')return buffer.toString('ascii',0,5)==='%PDF-';return false}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function page(res,admin=false){
 const data=published(),template=await readFile(join(distDir,'index.html'),'utf8');
 const title=admin?'Portfolio editor':`${data.brand} — AI Engineer`;
 const description=admin?'Private portfolio editor':data.intro.slice(0,190);
 const snapshot=admin?'':`<main><h1>${escapeHtml(data.headline)}</h1><p>${escapeHtml(data.intro)}</p><h2>Selected work</h2>${data.projects.map(p=>`<article><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.summary)}</p></article>`).join('')}<h2>Experience</h2>${data.experience.map(e=>`<article><h3>${escapeHtml(e.role)} · ${escapeHtml(e.company)}</h3><p>${escapeHtml(e.description)}</p></article>`).join('')}</main>`;
 const html=template.replace(/<title>[^<]*<\/title>/,`<title>${escapeHtml(title)}</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escapeHtml(description)}">`).replace('<div id="root"></div>',`<div id="root">${snapshot}</div>`);
 headers(res,200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(admin?{'X-Robots-Tag':'noindex, nofollow'}:{})});res.end(html);
}
// Visitor chat with the assistant. Streams newline-delimited JSON: {t:"d",v:text}…, then {t:"done"} or {t:"error",v}.
async function chat(req,res){
 if(!assistantAvailable||!assistantSettings(published()).enabled)return fail(res,503,'The assistant is not available right now.');
 const ip=clientKey(req);
 if(!rate(chatAttempts,ip,20,600000)||!rate(chatDaily,ip,80,86400000))return fail(res,429,'That is a lot of questions! Please try again a bit later, or leave a message instead.');
 const {conversation,messages}=cleanChatRequest(await parseJson(req,40000));
 const day=now().slice(0,10);if(chatBudget.day!==day){chatBudget.day=day;chatBudget.used=0}
 if(chatBudget.used>=dailyLimit)return fail(res,429,'The assistant is resting for today. Please leave a message instead.');
 chatBudget.used++;
 const question=messages.at(-1).content,insert=db.prepare('INSERT INTO chats(conversation,role,content,created_at) VALUES(?,?,?,?)');
 const firstTurn=!db.prepare('SELECT 1 FROM chats WHERE conversation=? LIMIT 1').get(conversation);
 insert.run(conversation,'user',question,now());
 if(firstTurn&&!session(req))notifyChat(question);
 headers(res,200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
 const ac=new AbortController();res.on('close',()=>{if(!res.writableEnded)ac.abort()});
 const send=o=>res.write(JSON.stringify(o)+'\n');
 try{
  let {text,stopReason}=await streamReply({content:published(),messages,onText:v=>send({t:'d',v}),signal:ac.signal});
  if(stopReason==='refusal'&&!text.trim()){text='Sorry, I can’t help with that one. Ask me about the projects, experience or availability, or leave a message!';send({t:'d',v:text})}
  if(text)insert.run(conversation,'assistant',text,now());
  send({t:'done'});
 }catch(err){
  if(ac.signal.aborted)return;
  console.error('Assistant error:',err?.status||'',err?.message||err);
  send({t:'error',v:'The assistant is unavailable right now. Please try again, or leave a message.'});
 }
 res.end();
}
async function handler(req,res){try{
 const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method;
 if(path==='/api/site'&&method==='GET'){const content=published(),{facts,...settings}=assistantSettings(content);return json(res,{content,assistant:{...settings,enabled:assistantAvailable&&settings.enabled,demo:demoMode}})}
 if(path==='/api/chat'&&method==='POST')return await chat(req,res);
 if(path==='/api/contact'&&method==='POST'){
  if(!rate(contactAttempts,clientKey(req),5,3600000))return fail(res,429,'Please try again later.');
  const data=await parseJson(req,8000);if(isStr(data.website))return json(res,{ok:true});
  const name=isStr(data.name,120),email=isStr(data.email,254),message=isStr(data.message,3000);
  if(!name||!validEmail(email)||message.length<10)return fail(res,400,'Please enter your name, a valid email, and a message of at least 10 characters.');
  db.prepare('INSERT INTO messages(id,name,email,message,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),name,email,message,now());notifyMessage({name,email,message});return json(res,{ok:true},201);
 }
 if(path==='/api/view'&&method==='POST'){
  const ip=clientKey(req),ua=String(req.headers['user-agent']||'').slice(0,400);
  if(!rate(viewAttempts,ip,40,600000))return empty(res);
  const data=await parseJson(req,2000);
  if(isBot(ua)||session(req))return empty(res);
  const day=now().slice(0,10),visitor=visitorId(ip,ua,day),pagePath=isStr(data.path,120).replace(/[^\w\-/#.]/g,'')||'/',ref=referrerHost(data.referrer,ownHost),dev=device(ua),country=trustProxy?isStr(req.headers['cf-ipcountry'],2).toUpperCase().replace(/[^A-Z]/g,''):'';
  const seen=db.prepare('SELECT 1 FROM visits WHERE day=? AND visitor=? LIMIT 1').get(day,visitor);
  db.prepare('INSERT INTO visits(day,visitor,path,referrer,device,country,created_at) VALUES(?,?,?,?,?,?,?)').run(day,visitor,pagePath,ref,dev,country,now());
  if(!seen){const todayCount=db.prepare('SELECT COUNT(DISTINCT visitor) n FROM visits WHERE day=?').get(day).n;notifyVisit({path:pagePath,referrer:ref,device:dev,country,todayCount})}
  return empty(res);
 }
 if(path==='/api/admin/login'&&method==='POST'){
  const ip=clientKey(req);if(!rate(loginAttempts,ip,6,900000))return fail(res,429,'Too many attempts. Try again in 15 minutes.');
  const data=await parseJson(req,2000);const candidate=scryptSync(String(data.password||'').slice(0,500),passwordSalt,64);
  if(!timingSafeEqual(candidate,passwordHash))return fail(res,401,'Incorrect password.');
  loginAttempts.delete(ip);const s={id:randomUUID(),exp:Date.now()+12*3600000};const token=Buffer.from(JSON.stringify(s)).toString('base64url');
  db.prepare('INSERT INTO sessions(id,expires_at) VALUES(?,?)').run(s.id,s.exp);
  res.setHeader('Set-Cookie',`portfolio_session=${token}.${sign(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${cookieSecure?'; Secure':''}`);
  return json(res,{ok:true,csrf:csrf(s)});
 }
 if(path==='/api/admin/session'&&method==='GET'){const s=requireAdmin(req,res);if(s)return json(res,{ok:true,csrf:csrf(s)});return}
 if(path==='/api/admin/logout'&&method==='POST'){const s=requireAdmin(req,res,true);if(!s)return;db.prepare('DELETE FROM sessions WHERE id=?').run(s.id);res.setHeader('Set-Cookie',`portfolio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure?'; Secure':''}`);return json(res,{ok:true})}
 if(path==='/api/admin/draft'&&method==='GET'){if(!requireAdmin(req,res))return;const d=drafts();return json(res,{content:JSON.parse(d.content),revision:d.revision,updatedAt:d.updated_at})}
 if(path==='/api/admin/draft'&&method==='PUT'){
  if(!requireAdmin(req,res,true))return;const data=await parseJson(req);const clean=sanitize(data.content);const rev=Number(data.revision);if(!Number.isSafeInteger(rev))return fail(res,400,'Invalid revision.');
  const result=db.prepare('UPDATE documents SET content=?, revision=revision+1, updated_at=? WHERE kind=? AND revision=?').run(JSON.stringify(clean),now(),'draft',rev);
  if(!result.changes)return fail(res,409,'This draft changed elsewhere. Refresh before saving.');return json(res,{ok:true,revision:rev+1});
 }
 if(path==='/api/admin/publish'&&method==='POST'){
  if(!requireAdmin(req,res,true))return;const d=drafts();db.prepare("UPDATE documents SET content=?, revision=revision+1, updated_at=? WHERE kind='published'").run(d.content,now());return json(res,{ok:true});
 }
 if(path==='/api/admin/messages'&&method==='GET'){
  if(!requireAdmin(req,res))return;const rows=db.prepare('SELECT id,name,email,message,created_at,read_at FROM messages ORDER BY created_at DESC LIMIT 200').all();return json(res,{messages:rows});
 }
 if(path.startsWith('/api/admin/messages/')&&method==='PATCH'){
  if(!requireAdmin(req,res,true))return;const id=path.slice('/api/admin/messages/'.length);db.prepare('UPDATE messages SET read_at=? WHERE id=?').run(now(),id);return json(res,{ok:true});
 }
 if(path==='/api/admin/stats'&&method==='GET'){
  if(!requireAdmin(req,res))return;const today=now().slice(0,10),since=d=>new Date(Date.now()-d*86400000).toISOString().slice(0,10);
  const count=from=>db.prepare('SELECT COUNT(DISTINCT day||visitor) visitors, COUNT(*) views FROM visits WHERE day>=?').get(from);
  const daily=db.prepare('SELECT day, COUNT(DISTINCT visitor) visitors, COUNT(*) views FROM visits WHERE day>=? GROUP BY day ORDER BY day').all(since(13));
  const referrers=db.prepare(`SELECT referrer host, COUNT(DISTINCT day||visitor) n FROM visits WHERE day>=? AND referrer<>'' GROUP BY referrer ORDER BY n DESC LIMIT 6`).all(since(29));
  const recent=db.prepare('SELECT created_at, path, referrer, device, country FROM visits ORDER BY id DESC LIMIT 12').all();
  const unread=db.prepare('SELECT COUNT(*) n FROM messages WHERE read_at IS NULL').get().n;
  return json(res,{today:count(today),week:count(since(6)),month:count(since(29)),daily,referrers,recent,unread,notifications:notifySettings,assistant:{available:assistantAvailable,demo:demoMode,provider:assistantProvider,model:assistantModel,dailyLimit,usedToday:chatBudget.day===today?chatBudget.used:0,conversationsToday:db.prepare('SELECT COUNT(DISTINCT conversation) n FROM chats WHERE substr(created_at,1,10)=?').get(today).n}});
 }
 if(path==='/api/admin/chats'&&method==='GET'){
  if(!requireAdmin(req,res))return;
  const convs=db.prepare('SELECT conversation, MIN(created_at) started, MAX(created_at) last, COUNT(*) n FROM chats GROUP BY conversation ORDER BY last DESC LIMIT 40').all();
  const msgs=db.prepare('SELECT role, content, created_at FROM chats WHERE conversation=? ORDER BY id');
  return json(res,{conversations:convs.map(c=>({...c,messages:msgs.all(c.conversation)}))});
 }
 if(path==='/api/admin/notify-test'&&method==='POST'){
  if(!requireAdmin(req,res,true))return;if(!notifySettings.enabled)return fail(res,400,'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env and restart.');
  const r=await sendTelegram('✅ Test notification from your portfolio. Visits and new messages will arrive here.');return r.ok?json(res,{ok:true}):fail(res,502,'Telegram rejected the message ('+r.reason+'). Check the bot token and chat id.');
 }
 if(path==='/api/admin/upload'&&method==='POST'){
  if(!requireAdmin(req,res,true))return;const mime=req.headers['content-type']||'';
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(mime))return fail(res,415,'Use PNG, JPEG, WebP, or PDF.');
  const kind=mime==='application/pdf'?'resume':'image',bytes=await body(req,kind==='resume'?5_000_000:4_000_000);
  if(!contentMatches(bytes,mime))return fail(res,400,'File content does not match its type.');
  const id=randomUUID(),filename=id+({"image/png":'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf'}[mime]);
  await writeFile(join(mediaDir,filename),bytes,{flag:'wx'});
  db.prepare('INSERT INTO media(id,kind,mime,filename,created_at) VALUES(?,?,?,?,?)').run(id,kind,mime,filename,now());return json(res,{url:'/media/'+id,kind},201);
 }
 if(path.startsWith('/media/')&&method==='GET'){
  const id=path.slice(7);if(!/^[0-9a-f-]{36}$/.test(id))return fail(res,404,'Not found');
  const row=db.prepare('SELECT * FROM media WHERE id=?').get(id);if(!row)return fail(res,404,'Not found');
  const pub=published(),referenced=row.kind==='resume'?pub.resume===path:pub.portrait===path||pub.projects.some(p=>p.image===path);
  if(!referenced&&!session(req))return fail(res,404,'Not found');
  return file(res,join(mediaDir,row.filename),row.mime,{'Cache-Control':'private, max-age=3600'});
 }
 if(path==='/resume.pdf'&&method==='GET')return file(res,join(root,'server','seed-resume.pdf'),'application/pdf',{'Content-Disposition':'attachment; filename="Med-Amin-Gnichi-Resume.pdf"'});
 if(path.startsWith('/api/'))return fail(res,404,'Not found');
 if(method!=='GET'&&method!=='HEAD')return fail(res,405,'Method not allowed');
 if(path==='/'||path==='/admin'||path==='/admin/')return page(res,path.startsWith('/admin'));
 const asset=resolve(distDir,'.'+path);
 const relativeAsset=relative(distDir,asset);
 if(relativeAsset==='..'||relativeAsset.startsWith('..'+sep)||isAbsolute(relativeAsset))return fail(res,404,'Not found');
 const target=existsSync(asset)&&path!=='/'?asset:join(distDir,'index.html');
 return file(res,target,mimes[extname(target)]||'application/octet-stream',path.startsWith('/admin')?{'Cache-Control':'no-store'}:{});
 }catch(err){if(err instanceof SyntaxError)return fail(res,400,'Invalid request.');if(err.status)return fail(res,err.status,err.message);if(err.message==='Invalid content'||err.message.startsWith('Enter a valid'))return fail(res,400,err.message);console.error(err);return fail(res,500,'Something went wrong. Please try again.')}}
export const server=createServer(handler);
startDigest(day=>({visitors:db.prepare('SELECT COUNT(DISTINCT visitor) n FROM visits WHERE day=?').get(day).n,views:db.prepare('SELECT COUNT(*) n FROM visits WHERE day=?').get(day).n,messages:db.prepare('SELECT COUNT(*) n FROM messages WHERE substr(created_at,1,10)=?').get(day).n,referrers:db.prepare(`SELECT referrer host, COUNT(DISTINCT visitor) n FROM visits WHERE day=? AND referrer<>'' GROUP BY referrer ORDER BY n DESC LIMIT 5`).all(day)}));
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Portfolio listening on '+(process.env.PORT||3000)));
