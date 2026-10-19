import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRealtimeHub } from '../src/realtime.mjs';
import { createApp } from '../src/app.mjs';
import { randomUUID } from 'node:crypto';

async function fixture(t,options={}){
 const rows=new Map();
 const accounts={async authenticate(token){if(!['alice','bob','outsider','00000000-0000-4000-8000-000000000002'].includes(token))throw Error('Unauthorized');return {id:token,role:'user'};},async me(id){return {id,name:id,avatarUrl:null};},gameRepository:{
  async get(id){return structuredClone(rows.get(id)??null);},async list(){return [];},
  async insert(row){rows.set(row.id,structuredClone(row));return row;},
  async replace(id,revision,patch){const row=rows.get(id);if(!row||row.revision!==revision)return null;const next={...row,...patch};rows.set(id,next);return next;},
 }};
 const hub=createRealtimeHub({authenticate:token=>accounts.authenticate(token),...options});
 const server=createServer(createApp(accounts,{realtime:hub}));hub.attach(server);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{hub.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}`;
 async function connect(token){const ws=new WebSocket(base.replace('http:','ws:')+'/api/events');const messages=[];ws.on('message',data=>messages.push(JSON.parse(data)));await once(ws,'open');if(token){const ready=once(ws,'message');ws.send(JSON.stringify({type:'authenticate',token}));await ready;}return {ws,messages};}
 return {hub,server,base,connect,rows,accounts};
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
test('websocket authenticates, isolates participants and never sends hidden game state',async t=>{
 const {hub,connect}=await fixture(t);const a=await connect('alice'),b=await connect('bob'),other=await connect('outsider'),anonymous=await connect();
 hub.gameChanged({id:'game',revision:2,inviter_id:'alice',invitee_id:'bob',state:{rack:['Z']}});await pause();
 const event={type:'game.changed',gameId:'game',revision:2};
 assert.deepEqual(a.messages,[{type:'ready'},event]);assert.deepEqual(b.messages,a.messages);
 assert.deepEqual(other.messages,[{type:'ready'}]);assert.deepEqual(anonymous.messages,[]);
 hub.usersChanged();await pause();assert.deepEqual(other.messages.at(-1),{type:'users.changed'});assert.deepEqual(anonymous.messages,[]);
});
test('bad credentials and missing authentication close the socket; sessions expire',async t=>{
 const {connect}=await fixture(t,{authTimeoutMs:80,sessionMs:120});
 const invalid=await connect();let closed=once(invalid.ws,'close');invalid.ws.send(JSON.stringify({type:'authenticate',token:'forged'}));assert.equal((await closed)[0],4401);
 const anonymous=await connect();assert.equal((await once(anonymous.ws,'close'))[0],4401);
 const valid=await connect('alice');assert.equal((await once(valid.ws,'close'))[0],4401);
});
test('API invitation and accepted turn notify only after persisted writes, duplicate actions stay silent',async t=>{
 const {base,connect}=await fixture(t);const alice=await connect('alice'),bob=await connect('00000000-0000-4000-8000-000000000002');
 // HTTP uses UUIDs; map these test identities to the authenticated socket accounts.
 const bobId='00000000-0000-4000-8000-000000000002';
 const id=randomUUID();
 const response=await fetch(base+'/api/games',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:JSON.stringify({id,opponentId:bobId})});
 assert.equal(response.status,201);await pause();assert.deepEqual(alice.messages.at(-1),{type:'game.changed',gameId:id,revision:0});
 const count=alice.messages.length;
 await fetch(base+'/api/games',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:JSON.stringify({id,opponentId:bobId})});
 await pause();assert.equal(alice.messages.length,count);assert.deepEqual(bob.messages.at(-1),{type:'game.changed',gameId:id,revision:0});
 const act=async(token,command)=>fetch(base+'/api/games/'+id+'/actions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(command)});
 const accept={id:randomUUID(),kind:'accept',revision:0};
 assert.equal((await act(bobId,accept)).status,200);await pause();assert.equal(bob.messages.at(-1).revision,1);
 const pass={id:randomUUID(),kind:'pass',revision:1};
 assert.equal((await act('alice',pass)).status,200);await pause();assert.equal(bob.messages.at(-1).revision,2);
 const after=alice.messages.length;
 assert.equal((await act('alice',pass)).status,200);await pause();assert.equal(alice.messages.length,after);
 assert.equal((await act('alice',{id:randomUUID(),kind:'pass',revision:2})).status,403);await pause();assert.equal(alice.messages.length,after);
 const resign=await act('alice',{id:randomUUID(),kind:'resign',revision:2});assert.equal(resign.status,200);assert.equal((await resign.json()).status,'finished');
 await pause();assert.deepEqual(bob.messages.at(-1),{type:'game.changed',gameId:id,revision:3});
});
