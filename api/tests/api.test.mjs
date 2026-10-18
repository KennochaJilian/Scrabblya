import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { ApiError } from '../src/errors.mjs';
import { seedAdmin } from '../scripts/seed-admin.mjs';
const admin={id:'00000000-0000-4000-8000-000000000001',name:'Admin',email:'admin@example.test',role:'admin',avatarUrl:null};
const user={id:'00000000-0000-4000-8000-000000000002',name:'Alice',email:'alice@example.test',role:'user',avatarUrl:null};
function mockService(){const calls=[];return {calls,
 async login(email,password){if(email!==user.email||password!=='correct-password')throw new ApiError(401,'Email ou mot de passe incorrect.');return {accessToken:'user-token',refreshToken:'refresh-token',expiresAt:123,user};},
 async refresh(token){if(token!=='refresh-token')throw new ApiError(401,'Session expirée.');return {accessToken:'renewed',refreshToken:'renewed-refresh',expiresAt:234,user};},
 async authenticate(token){if(token==='admin-token')return admin;if(token==='user-token')return user;throw new ApiError(401,'Session invalide.');},
 async me(id){return id===admin.id?admin:user;},async logout(token){calls.push(['logout',token]);},
 async listUsers(privateFields){calls.push(['list',privateFields]);return [user];},
 async createAccount(input){calls.push(['create',input]);return {...user,...input,password:undefined};},
 async updateName(id,name){return {...user,id,name};},async resetPassword(id,password){calls.push(['reset',id,password]);},
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
 const large=new FormData();large.append('avatar',new Blob([Buffer.alloc(2097153)],{type:'image/png'}),'huge.png');
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

