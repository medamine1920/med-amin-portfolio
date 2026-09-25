import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const password='long-test-password-12345';
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
  assert.equal((await fetch(base+'/api/admin/draft',{method:'PUT',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({content:next.content,revision:next.revision})})).status,200);
  assert.equal((await fetch(base+'/api/admin/publish',{method:'POST',headers:auth})).status,200);
  assert.equal((await fetch(base+mediaUrl)).status,200);
  const html=await (await fetch(base+'/')).text();assert.match(html,/assets\/index-/);assert.match(html,/Selected work/);
  assert.equal((await fetch(base+'/api/admin/logout',{method:'POST',headers:auth})).status,200);
  assert.equal((await fetch(base+'/api/admin/draft',{headers:auth})).status,401);
 }finally{proc.kill('SIGTERM');await rm(dir,{recursive:true,force:true})}
});
