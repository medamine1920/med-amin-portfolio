import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
const password='long-test-password-12345';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Wait for the server to exit before deleting its folder (Windows keeps the SQLite files locked until then).
const stop=proc=>new Promise(r=>{if(proc.exitCode!==null)return r();proc.once('exit',r);proc.kill('SIGTERM')});

test('telegram notifications for messages and unique visitors, admin stats',async()=>{
 const sent=[];const fake=createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{sent.push({url:req.url,body:JSON.parse(b)});res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}')})});
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 const dir=await mkdtemp(join(tmpdir(),'portfolio-test-'));const port=33000+Math.floor(Math.random()*1000);
 const proc=spawn(process.execPath,['server/index.js'],{cwd:join(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,SESSION_SECRET:'test-secret-0123456789abcdef0123456789abcdef',ADMIN_PASSWORD:password,TELEGRAM_BOT_TOKEN:'123:test',TELEGRAM_CHAT_ID:'42',TELEGRAM_API_BASE:`http://127.0.0.1:${fake.address().port}`},stdio:'pipe'});
 const base=`http://127.0.0.1:${port}`;const chrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
 const view=(ua,extra={})=>fetch(base+'/api/view',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':ua,...extra},body:JSON.stringify({path:'/',referrer:'https://www.linkedin.com/feed/?secret=1'})});
 try{
  for(let i=0;i<40;i++){try{await fetch(base+'/api/site');break}catch{await wait(50)}}
  assert.equal((await view(chrome)).status,204);
  assert.equal((await view(chrome)).status,204);
  assert.equal((await view('Googlebot/2.1')).status,204);
  assert.equal((await view('TelegramBot (like TwitterBot)')).status,204);
  const telegramInApp='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Telegram-Android/11.2.0';
  await wait(150);
  assert.equal((await view(telegramInApp)).status,204);await wait(150);
  await fetch(base+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Recruiter',email:'r@example.com',message:'Hello, are you available for a role?'})});
  await wait(300);
  assert.equal(sent.length,3,'two visitor alerts (repeat view and preview bots ignored, in-app browser counted) plus one message alert');
  assert.equal(sent[0].url,'/bot123:test/sendMessage');assert.equal(sent[0].body.chat_id,'42');
  assert.match(sent[0].body.text,/New visitor/);assert.match(sent[0].body.text,/linkedin\.com/);assert.doesNotMatch(sent[0].body.text,/secret/);
  assert.match(sent[1].body.text,/Mobile · Chrome · Android/);assert.match(sent[1].body.text,/Visitor #2 today/);
  assert.match(sent[2].body.text,/Recruiter/);assert.match(sent[2].body.text,/available for a role/);
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  const cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();
  assert.equal((await view(chrome+' admin',{Cookie:cookie})).status,204);await wait(150);
  assert.equal(sent.length,3,'admin visits are not counted');
  const stats=await (await fetch(base+'/api/admin/stats',{headers:{Cookie:cookie}})).json();
  assert.equal(stats.today.visitors,2);assert.equal(stats.today.views,3);assert.equal(stats.unread,1);assert.equal(stats.referrers[0].host,'linkedin.com');assert.equal(stats.notifications.enabled,true);
  assert.equal((await fetch(base+'/api/admin/notify-test',{method:'POST',headers:{Cookie:cookie}})).status,403);
  assert.equal((await fetch(base+'/api/admin/notify-test',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf}})).status,200);
  assert.equal(sent.length,4);
 }finally{await stop(proc);fake.close();await rm(dir,{recursive:true,force:true})}
});
test('admin draft isolation, publish, contact inbox and upload authorization',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'portfolio-test-'));const port=32000+Math.floor(Math.random()*1000);
 const proc=spawn(process.execPath,['server/index.js'],{cwd:join(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,SESSION_SECRET:'test-secret-0123456789abcdef0123456789abcdef',ADMIN_PASSWORD:password},stdio:'pipe'});
 const base=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<40;i++){try{await fetch(base+'/api/site');break}catch{await new Promise(r=>setTimeout(r,50))}}
  const pub=await (await fetch(base+'/api/site')).json();assert.equal(pub.content.projects.length,3);
  assert.equal((await fetch(base+'/api/admin/draft')).status,401);
  assert.equal((await fetch(base+'/api/admin/upload',{method:'POST'})).status,401);
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();const auth={Cookie:cookie,'X-CSRF-Token':csrf};
  const draft=await (await fetch(base+'/api/admin/draft',{headers:auth})).json();draft.content.brand='Updated brand';
  const save={method:'PUT',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({content:draft.content,revision:draft.revision})};
  assert.equal((await fetch(base+'/api/admin/draft',{...save,headers:{Cookie:cookie,'Content-Type':'application/json'}})).status,403);
  assert.equal((await fetch(base+'/api/admin/draft',save)).status,200);
  assert.equal((await fetch(base+'/api/admin/draft',save)).status,409);
  assert.notEqual((await (await fetch(base+'/api/site')).json()).content.brand,'Updated brand');
  assert.equal((await fetch(base+'/api/admin/publish',{method:'POST',headers:auth})).status,200);
  assert.equal((await (await fetch(base+'/api/site')).json()).content.brand,'Updated brand');
  const message=await fetch(base+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test',email:'test@example.com',message:'A proper message for testing.'})});assert.equal(message.status,201);
  const inbox=await (await fetch(base+'/api/admin/messages',{headers:auth})).json();assert.equal(inbox.messages.length,1);
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  const upload=await fetch(base+'/api/admin/upload',{method:'POST',headers:{...auth,'Content-Type':'image/png'},body:png});assert.equal(upload.status,201);
  const {url:mediaUrl}=await upload.json();assert.equal((await fetch(base+mediaUrl)).status,404);
  const next=await (await fetch(base+'/api/admin/draft',{headers:auth})).json();next.content.projects[0].image=mediaUrl;
  Object.assign(next.content.projects[0],{period:'Oct 2026',subtitle:'One line',domains:['Agents',''],repo:'https://github.com/x/y',problem:'Why',decisions:'How',constraints:'Limits',features:['A','B'],link:'javascript:alert(1)'});
  assert.equal((await fetch(base+'/api/admin/draft',{method:'PUT',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({content:next.content,revision:next.revision})})).status,200);
  assert.equal((await fetch(base+'/api/admin/publish',{method:'POST',headers:auth})).status,200);
  assert.equal((await fetch(base+mediaUrl)).status,200);
  const p0=(await (await fetch(base+'/api/site')).json()).content.projects[0];
  assert.deepEqual([p0.period,p0.subtitle,p0.domains,p0.repo,p0.problem,p0.decisions,p0.constraints,p0.features],['Oct 2026','One line',['Agents'],'https://github.com/x/y','Why','How','Limits',['A','B']]);
  assert.equal(p0.link,'','non-http links are dropped');
  const html=await (await fetch(base+'/')).text();assert.match(html,/assets\/index-/);assert.match(html,/Selected work/);
  assert.equal((await fetch(base+'/api/admin/logout',{method:'POST',headers:auth})).status,200);
  assert.equal((await fetch(base+'/api/admin/draft',{headers:auth})).status,401);
 }finally{await stop(proc);await rm(dir,{recursive:true,force:true})}
});
