import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseService } from '../src/supabase-service.mjs';
function provider({profile=null,insertError=null,authError=null}={}){
 const calls=[];let selectedProfile=profile;
 const admin={auth:{getUser:async()=>({data:{user:authError?null:{id:'id'}},error:authError}),admin:{createUser:async input=>{calls.push(['auth-create',input]);return {data:{user:{id:'new-id'}},error:null};},deleteUser:async id=>{calls.push(['auth-delete',id]);return {error:null};}}},from(){
  let input;
  return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:selectedProfile,error:null};},insert(value){input=value;calls.push(['profile-create',value]);return this;},async single(){return {data:input,error:insertError};}};
 },storage:{from:()=>({createSignedUrl:async path=>{calls.push(['signed-url',path]);return {data:{signedUrl:'https://storage.test/signed'},error:null};}})}};
 const service=createSupabaseService({url:'https://project.test',serviceKey:'secret',anonKey:'public'},{clientFactory:()=>admin});
 return {service,calls,setProfile:value=>selectedProfile=value};
}
test('profile failure compensates by deleting auth user without storing its password',async()=>{
 const {service,calls}=provider({insertError:{code:'failure'}});
 await assert.rejects(()=>service.createAccount({name:'Bob',email:'bob@example.test',password:'a-long-password'}),{status:503});
 assert.deepEqual(calls.at(-1),['auth-delete','new-id']);assert.equal(calls.find(c=>c[0]==='profile-create')[1].password,undefined);assert.equal(calls.find(c=>c[0]==='profile-create')[1].role,'user');
});
test('admin seed is idempotent and refuses silently promoting an ordinary user',async()=>{
 const input={name:'A',email:'a@example.test',password:'a-long-password'};
 const {service,calls,setProfile}=provider({profile:{id:'id',name:'A',email:input.email,role:'admin'}});
 assert.equal((await service.seedAdmin(input)).created,false);assert.equal(calls.length,0);
 setProfile({id:'id',name:'A',email:input.email,role:'user'});await assert.rejects(()=>service.seedAdmin(input),{status:409});assert.equal(calls.length,0);
});
test('new admin seed writes server-controlled admin role and never returns password',async()=>{
 const {service,calls}=provider();const result=await service.seedAdmin({name:'A',email:'a@example.test',password:'a-long-password'});
 assert.equal(result.created,true);assert.equal(calls.find(c=>c[0]==='profile-create')[1].role,'admin');assert.equal(result.user.password,undefined);
});
test('authentication rejects revoked tokens and users without approved profile',async()=>{
 await assert.rejects(()=>provider({authError:{message:'revoked'}}).service.authenticate('token'),{status:401});await assert.rejects(()=>provider().service.authenticate('token'),{status:403});
});
test('private avatar response uses signed URL without storage path',async()=>{
 const {service,calls}=provider({profile:{id:'id',name:'A',email:'a@example.test',role:'user',avatar_path:'private/avatar.png'}});
 const profile=await service.me('id');assert.equal(profile.avatarUrl,'https://storage.test/signed');assert.equal(profile.avatar_path,undefined);assert.deepEqual(calls.at(-1),['signed-url','private/avatar.png']);
});

test('deleted accounts cannot authenticate, but tombstone profiles remain readable for game history',async()=>{
 const {service}=provider({profile:{id:'id',name:'Compte supprimé',role:'user',email:'deleted@example.test',deleted_at:'2026-10-23T00:00:00Z'}});
 await assert.rejects(()=>service.authenticate('token'),{status:401});
 await assert.rejects(()=>service.resetPassword('id','new-password-value'),{status:401});
 await assert.rejects(()=>service.requireActive('id'),{status:404});
 assert.equal((await service.me('id')).name,'Compte supprimé');
});
test('deletion revokes access transactionally before auth cleanup and cannot reopen on cleanup failure',async()=>{
 const calls=[];
 const admin={async rpc(name,input){calls.push(['rpc',name,input]);return {data:{avatarPath:'old/avatar.png'},error:null};},auth:{admin:{async deleteUser(id,soft){calls.push(['auth',id,soft]);return {error:{message:'temporary failure'}};}}},storage:{from(){return {async remove(paths){calls.push(['avatar',paths]);return {error:null};}}}}};
 const service=createSupabaseService({url:'https://test',serviceKey:'secret',anonKey:'public'},{clientFactory:()=>admin});
 await service.deleteAccount('admin-id','user-id');
 assert.deepEqual(calls,[['rpc','admin_delete_account',{p_actor:'admin-id',p_target:'user-id'}],['auth','user-id',true],['avatar',['old/avatar.png']]]);
 admin.rpc=async()=>({error:{message:'cannot_delete_self'}});await assert.rejects(()=>service.deleteAccount('admin-id','admin-id'),{status:409});
 admin.rpc=async()=>({error:{message:'function missing'}});await assert.rejects(()=>service.deleteAccount('admin-id','user-id'),{status:503});
 assert.equal(calls.length,3);
});
