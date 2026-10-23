import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { ApiError } from '../src/errors.mjs';
import { seedAdmin } from '../scripts/seed-admin.mjs';
const admin={id:'00000000-0000-4000-8000-000000000001',name:'Admin',email:'admin@example.test',role:'admin',avatarUrl:null};
const user={id:'00000000-0000-4000-8000-000000000002',name:'Alice',email:'alice@example.test',role:'user',avatarUrl:null};
function mockService(){const calls=[];return {calls,
 pushRepository:{async register(userId,input){calls.push(['push-register',userId,input]);},async unregister(userId,id){calls.push(['push-unregister',userId,id]);}},
 async login(email,password){if(email!==user.email||password!=='correct-password')throw new ApiError(401,'Email ou mot de passe incorrect.');return {accessToken:'user-token',refreshToken:'refresh-token',expiresAt:123,user};},
 async refresh(token){if(token!=='refresh-token')throw new ApiError(401,'Session expirée.');return {accessToken:'renewed',refreshToken:'renewed-refresh',expiresAt:234,user};},
 async authenticate(token){if(token==='admin-token')return admin;if(token==='user-token')return user;throw new ApiError(401,'Session invalide.');},
 async me(id){return id===admin.id?admin:user;},async logout(token){calls.push(['logout',token]);},
 async listUsers(privateFields){calls.push(['list',privateFields]);return [user];},
 async createAccount(input){calls.push(['create',input]);return {...user,...input,password:undefined};},
 async deleteAccount(actor,id){calls.push(['delete',actor,id]);},
 async updateName(id,name){calls.push(['rename',id,name]);return {...user,id,name};},async resetPassword(id,password){calls.push(['reset',id,password]);},
 async uploadAvatar(id,buffer,mime){calls.push(['avatar',id,buffer.length,mime]);return {...user,avatarUrl:'https://example.test/signed-avatar'};},
 async seedAdmin(input){calls.push(['seed',input]);return {created:true,user:admin};},
};}
async function withApi(run,options={}){const service=mockService(),server=createApp(service,options).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(route,{token,body,raw,...init}={})=>fetch(base+route,{...init,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...init.headers},...(body?{body:JSON.stringify(body)}:raw?{body:raw}:{})});
 try{await run(request,service);}finally{await new Promise(r=>server.close(r));}
}
test('login, refresh, current profile and logout with no password in responses',()=>withApi(async(req,service)=>{
 let r=await req('/api/auth/login',{method:'POST',body:{email:user.email,password:'wrong'}});assert.equal(r.status,401);
 r=await req('/api/auth/login',{method:'POST',body:{email:user.email,password:'correct-password'}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.user.name,'Alice');assert.equal(data.user.password,undefined);assert.match(r.headers.get('cache-control'),/no-store/);
 r=await req('/api/auth/refresh',{method:'POST',body:{refreshToken:'refresh-token'}});assert.equal((await r.json()).accessToken,'renewed');
 r=await req('/api/me',{token:'user-token'});assert.equal((await r.json()).id,user.id);
 r=await req('/api/auth/logout',{method:'POST',token:'user-token'});assert.equal(r.status,204);assert.deepEqual(service.calls.at(-1),['logout','user-token']);
}));
test('protected routes reject missing and forged tokens; ordinary users cannot create accounts',()=>withApi(async req=>{
 for(const token of [undefined,'forged-token'])assert.equal((await req('/api/users',{token})).status,401);
 assert.equal((await req('/api/admin/users',{method:'POST',token:'user-token',body:{name:'Bob',email:'bob@example.test',password:'long-enough-password'}})).status,403);
}));
test('admin creates ordinary user, validates fields and rejects role injection',()=>withApi(async(req,service)=>{
 const body={name:' Bob ',email:'BOB@example.test',password:'long-enough-password'};
 assert.equal((await req('/api/admin/users',{method:'POST',token:'admin-token',body})).status,201);
 assert.deepEqual(service.calls.at(-1),['create',{...body,name:'Bob',email:'bob@example.test'}]);
 for(const invalid of [{...body,role:'admin'},{...body,password:'short'},{...body,email:'invalid'},{...body,name:''}])assert.equal((await req('/api/admin/users',{method:'POST',token:'admin-token',body:invalid})).status,400);
}));
test('role cannot be changed through profile patch, users list uses authoritative role',()=>withApi(async(req,service)=>{
 assert.equal((await req('/api/me',{method:'PATCH',token:'user-token',body:{role:'admin'}})).status,400);
 let r=await req('/api/me',{method:'PATCH',token:'user-token',body:{name:'Alice B'}});assert.equal((await r.json()).name,'Alice B');
 await req('/api/users',{token:'user-token'});assert.deepEqual(service.calls.at(-1),['list',false]);
 await req('/api/users',{token:'admin-token'});assert.deepEqual(service.calls.at(-1),['list',true]);
}));
test('avatar checks auth, content signature, size and correct owner',()=>withApi(async(req,service)=>{
 const invalid=await req('/api/me/avatar',{method:'POST',token:'user-token'});assert.equal(invalid.status,400);
 const form=new FormData();form.append('avatar',new Blob(['not-an-image'],{type:'image/png'}),'avatar.png');
 assert.equal((await req('/api/me/avatar',{method:'POST',token:'user-token',raw:form})).status,400);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPQAAAABJRU5ErkJggg==','base64');
 const valid=new FormData();valid.append('avatar',new Blob([png],{type:'image/png'}),'avatar.png');
 const response=await req('/api/me/avatar',{method:'POST',token:'user-token',raw:valid});assert.equal(response.status,200);
 assert.deepEqual(service.calls.at(-1),['avatar',user.id,png.length,'image/png']);
 const large=new FormData();large.append('avatar',new Blob([Buffer.alloc(10485761)],{type:'image/png'}),'huge.png');
 assert.equal((await req('/api/me/avatar',{method:'POST',token:'user-token',raw:large})).status,400);
}));
test('admin password reset requires admin role and strong password',()=>withApi(async(req,service)=>{
 const route=`/api/admin/users/${user.id}/password`;
 assert.equal((await req(route,{method:'PUT',token:'user-token',body:{password:'long-enough-password'}})).status,403);
 assert.equal((await req(route,{method:'PUT',token:'admin-token',body:{password:'short'}})).status,400);
 assert.equal((await req(route,{method:'PUT',token:'admin-token',body:{password:'long-enough-password'}})).status,204);
 assert.equal(service.calls.at(-1)[1],user.id);
}));
test('login is rate-limited',()=>withApi(async req=>{
 for(let i=0;i<2;i++)assert.equal((await req('/api/auth/login',{method:'POST',body:{email:user.email,password:'wrong'}})).status,401);
 assert.equal((await req('/api/auth/login',{method:'POST',body:{email:user.email,password:'wrong'}})).status,429);
},{loginLimit:2}));
test('seed requires explicit valid credentials and asks service for admin creation',async()=>{
 const service=mockService();await assert.rejects(()=>seedAdmin(service,{name:'A',email:'a@example.test',password:'short'}));
 await seedAdmin(service,{name:'Admin',email:'ADMIN@example.test',password:'long-enough-password'});
 assert.equal(service.calls.at(-1)[0],'seed');assert.equal(service.calls.at(-1)[1].email,'admin@example.test');
});


test('only admin can change another user avatar; validates target and image before writing',()=>withApi(async(req,service)=>{
 const route=`/api/admin/users/${user.id}/avatar`;
 const form=()=>{const f=new FormData();f.append('avatar',new Blob([Buffer.from('89504e470d0a1a0a','hex')],{type:'image/png'}),'avatar.png');return f;};
 for(const [token,status] of [[undefined,401],['user-token',403]])assert.equal((await req(route,{method:'POST',token,raw:form()})).status,status);
 assert.equal(service.calls.filter(c=>c[0]==='avatar').length,0);
 assert.equal((await req('/api/admin/users/invalid/avatar',{method:'POST',token:'admin-token',raw:form()})).status,400);
 assert.equal((await req(route,{method:'POST',token:'admin-token'})).status,400);
 const invalid=new FormData();invalid.append('avatar',new Blob(['fake'],{type:'image/png'}),'avatar.png');
 assert.equal((await req(route,{method:'POST',token:'admin-token',raw:invalid})).status,400);
 const large=new FormData();large.append('avatar',new Blob([Buffer.alloc(10485761)],{type:'image/png'}),'large.png');
 assert.equal((await req(route,{method:'POST',token:'admin-token',raw:large})).status,400);
 assert.equal((await req(route,{method:'POST',token:'admin-token',raw:form()})).status,200);
 assert.deepEqual(service.calls.at(-1),['avatar',user.id,8,'image/png']);
}));

test('self and admin avatar routes accept up to 10 MiB including images larger than the old limit',()=>withApi(async(req,service)=>{
 for(const [route,token,size] of [
  ['/api/me/avatar','user-token',3*1024*1024],
  [`/api/admin/users/${user.id}/avatar`,'admin-token',10*1024*1024],
 ]){
  const bytes=Buffer.alloc(size);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);
  const form=new FormData();form.append('avatar',new Blob([bytes],{type:'image/png'}),'avatar.png');
  const response=await req(route,{method:'POST',token,raw:form});
  assert.equal(response.status,200);assert.deepEqual(service.calls.at(-1),['avatar',user.id,size,'image/png']);
 }
}));

test('admin renames and deletes users; ordinary users and self-deletion are refused',()=>withApi(async(req,service)=>{
 const route=`/api/admin/users/${user.id}`;
 for(const method of ['PATCH','DELETE'])assert.equal((await req(route,{method,token:'user-token',...(method==='PATCH'?{body:{name:'Bob'}}:{})})).status,403);
 for(const body of [{name:''},{name:'Bob',role:'admin'},{name:'Bob',email:'changed@example.test'}])assert.equal((await req(route,{method:'PATCH',token:'admin-token',body})).status,400);
 const rename=await req(route,{method:'PATCH',token:'admin-token',body:{name:'  Bob  '}});assert.equal(rename.status,200);assert.equal((await rename.json()).name,'Bob');assert.deepEqual(service.calls.at(-1),['rename',user.id,'Bob']);
 assert.equal((await req(`/api/admin/users/${admin.id}`,{method:'DELETE',token:'admin-token'})).status,409);
 assert.equal((await req('/api/admin/users/invalid',{method:'DELETE',token:'admin-token'})).status,400);
 assert.equal(service.calls.some(c=>c[0]==='delete'),false);
 assert.equal((await req(route,{method:'DELETE',token:'admin-token'})).status,204);assert.deepEqual(service.calls.at(-1),['delete',admin.id,user.id]);
}));

test('push registration binds the authenticated user, validates input and unregisters on logout',()=>withApi(async(req,service)=>{
 const id='10000000-0000-4000-8000-000000000001',route='/api/push/devices/'+id,token='fcm-token-'.repeat(10);
 assert.equal((await req(route,{method:'PUT',body:{token}})).status,401);
 assert.equal((await req(route,{method:'PUT',token:'user-token',body:{token,userId:admin.id}})).status,400);
 assert.equal((await req(route,{method:'PUT',token:'user-token',body:{token:'short'}})).status,400);
 assert.equal((await req(route,{method:'PUT',token:'user-token',body:{token}})).status,204);
 assert.deepEqual(service.calls.at(-1),['push-register',user.id,{deviceId:id,token}]);
 assert.equal((await req(route,{method:'DELETE',token:'user-token'})).status,204);assert.deepEqual(service.calls.at(-1),['push-unregister',user.id,id]);
 assert.equal((await req('/api/auth/logout',{method:'POST',token:'user-token',body:{deviceId:id}})).status,204);
 assert.deepEqual(service.calls.slice(-2),[['push-unregister',user.id,id],['logout','user-token']]);
 const status=await req('/api/push/status',{token:'user-token'});assert.deepEqual(await status.json(),{enabled:true});
},{pushEnabled:true}));
test('push registration reports disabled server without writing a device',()=>withApi(async(req,service)=>{
 const response=await req('/api/push/devices/10000000-0000-4000-8000-000000000001',{method:'PUT',token:'user-token',body:{token:'fcm-token-'.repeat(10)}});assert.equal(response.status,503);assert.equal(service.calls.length,0);
}));
