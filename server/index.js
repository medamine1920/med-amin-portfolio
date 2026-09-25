import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep, extname } from 'node:path';
import { randomUUID, randomBytes, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);`);
const seed = JSON.parse(await readFile(join(root,'server','seed.json'),'utf8'));
for (const kind of ['published','draft']) db.prepare('INSERT OR IGNORE INTO documents(kind,content,revision,updated_at) VALUES(?,?,1,?)').run(kind,JSON.stringify(seed),new Date().toISOString());
const published = () => JSON.parse(db.prepare("SELECT content FROM documents WHERE kind='published'").get().content);
const drafts = () => db.prepare("SELECT content,revision,updated_at FROM documents WHERE kind='draft'").get();
const loginAttempts = new Map(), contactAttempts = new Map();
const now = () => new Date().toISOString();
const isStr = (value,max=300) => typeof value==='string' ? value.trim().slice(0,max) : '';
const cleanUrl = value => {const s=isStr(value,500);if(!s)return '';try {const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
const mediaUrl = value => /^\/media\/[0-9a-f-]{36}$/.test(value||'')?value:'';
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
const clampList = (value,n) => Array.isArray(value)?value.slice(0,n):[];
const sanitize = input => {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid content');
  const out={};
  for(const key of ['brand','role','headline','availability','location','contactHeadline'])out[key]=isStr(input[key],180);
  for(const key of ['intro','about','contactText'])out[key]=isStr(input[key],1400);
  out.email=isStr(input.email,254);if(out.email&&!validEmail(out.email))throw Error('Enter a valid contact email');
  out.linkedin=cleanUrl(input.linkedin);out.github=cleanUrl(input.github);
  out.otherLinks=clampList(input.otherLinks,10).map(x=>({id:isStr(x.id,80)||randomUUID(),label:isStr(x.label,60),url:cleanUrl(x.url)})).filter(x=>x.label&&x.url);
  out.resume=mediaUrl(input.resume)||'/resume.pdf';
  out.stats=clampList(input.stats,12).map(x=>({id:isStr(x.id,80)||randomUUID(),value:isStr(x.value,40),label:isStr(x.label,150)}));
  out.projects=clampList(input.projects,30).map(x=>({id:isStr(x.id,80)||randomUUID(),category:isStr(x.category,80),name:isStr(x.name,160),summary:isStr(x.summary,2500),result:isStr(x.result,180),tags:clampList(x.tags,16).map(t=>isStr(t,45)).filter(Boolean),image:mediaUrl(x.image),imageAlt:isStr(x.imageAlt,180),link:cleanUrl(x.link),featured:x.featured===true}));
  const entries=xs=>clampList(xs,40).map(x=>({id:isStr(x.id,80)||randomUUID(),period:isStr(x.period,90),role:isStr(x.role,150),company:isStr(x.company,150),description:isStr(x.description,1200)}));
  out.experience=entries(input.experience);out.education=entries(input.education);
  out.skills=clampList(input.skills,80).map(x=>isStr(x,80)).filter(Boolean);
  return out;
};
function headers(res,code=200,extra={}){res.writeHead(code,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",...extra});}
function json(res,data,code=200){headers(res,code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function fail(res,code,message){json(res,{error:message},code)}
async function body(req,max){const parts=[];let count=0;for await(const chunk of req){count+=chunk.length;if(count>max)throw Object.assign(Error('File or request too large'),{status:413});parts.push(chunk)}return Buffer.concat(parts)}
const parseJson = async(req,max=600000)=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('Expected JSON'),{status:415});return JSON.parse((await body(req,max)).toString('utf8'))};
function sign(value){return createHmac('sha256',secret).update(value).digest('base64url')}
function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('portfolio_session='))?.slice(18);if(!cookie)return null;const [data,mac]=cookie.split('.');if(!data||!mac||!safeEqual(mac,sign(data)))return null;try{const parsed=JSON.parse(Buffer.from(data,'base64url'));if(parsed.exp<=Date.now())return null;return db.prepare('SELECT id FROM sessions WHERE id=? AND expires_at>?').get(parsed.id,Date.now())?parsed:null}catch{return null}}
function safeEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function csrf(s){return sign('csrf:'+s.id)}
function requireAdmin(req,res,mutate=false){const s=session(req);if(!s){fail(res,401,'Sign in to continue.');return null}if(mutate&& !safeEqual(req.headers['x-csrf-token']||'',csrf(s))){fail(res,403,'Session check failed. Refresh and try again.');return null}return s}
function rate(map,key,max,windowMs){const t=Date.now();const xs=(map.get(key)||[]).filter(x=>t-x<windowMs);xs.push(t);map.set(key,xs);return xs.length<=max}
function clientKey(req){return req.socket.remoteAddress||'unknown'}
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
async function handler(req,res){try{
 const url=new URL(req.url,'http://localhost');const path=url.pathname;const method=req.method;
 if(path==='/api/site'&&method==='GET')return json(res,{content:published()});
 if(path==='/api/contact'&&method==='POST'){
  if(!rate(contactAttempts,clientKey(req),5,3600000))return fail(res,429,'Please try again later.');
  const data=await parseJson(req,8000);if(isStr(data.website))return json(res,{ok:true});
  const name=isStr(data.name,120),email=isStr(data.email,254),message=isStr(data.message,3000);
  if(!name||!validEmail(email)||message.length<10)return fail(res,400,'Please enter your name, a valid email, and a message of at least 10 characters.');
  db.prepare('INSERT INTO messages(id,name,email,message,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),name,email,message,now());return json(res,{ok:true},201);
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
  const pub=published(),referenced=row.kind==='resume'?pub.resume===path:pub.projects.some(p=>p.image===path);
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
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Portfolio listening on '+(process.env.PORT||3000)));
