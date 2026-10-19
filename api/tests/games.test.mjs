import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGameService } from '../src/game-service.mjs';
import { createApp } from '../src/app.mjs';
import { ApiError } from '../src/errors.mjs';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003';
function setup(options={}){
 const rows=new Map();
 const repository={
  async get(id){return structuredClone(rows.get(id)??null);},
  async list(id){return structuredClone([...rows.values()].filter(r=>[r.inviter_id,r.invitee_id].includes(id)));},
  async insert(row){rows.set(row.id,structuredClone(row));return structuredClone(row);},
  async replace(id,revision,patch){const row=rows.get(id);if(!row||row.revision!==revision)return null;const next={...row,...structuredClone(patch)};rows.set(id,next);return structuredClone(next);},
 };
 const accounts={gameRepository:repository,async me(id){return {id,name:id===a?'Alice':'Bob',avatarUrl:null,email:'private@example.test',role:'user'};},async authenticate(token){if(![a,b,outsider].includes(token))throw new ApiError(401,'Connexion requise.');return {id:token,role:'user'};}};
 const service=createGameService(repository,accounts,{random:()=>.5,...options});
 const command=(kind,revision,extra={})=>({id:randomUUID(),kind,revision,...extra});
 async function active(){const row=await service.invite(a,{id:randomUUID(),opponentId:b});return service.act(b,row.id,command('accept',0));}
 return {rows,repository,accounts,service,command,active};
}
test('invitations hide both racks, are idempotent and require the invited player',async()=>{
 const {service,command}=setup();const input={id:randomUUID(),opponentId:b};
 const invitation=await service.invite(a,input);
 assert.equal(invitation.status,'pending');assert(invitation.state.players.every(p=>p.rack.every(l=>l==='?')));
 assert.deepEqual((await service.invite(a,input)).state,invitation.state);
 await assert.rejects(()=>service.act(a,input.id,command('accept',0)),{status:403});
 const accepted=await service.act(b,input.id,command('accept',0));assert.equal(accepted.status,'active');
 assert(accepted.state.players[0].rack.every(l=>l==='?'));
 assert(accepted.state.players[1].rack.some(l=>l!=='?'));
 assert(accepted.state.bag.every(l=>l==='?'));
 assert.equal(accepted.state.players[0].email,undefined);
});
test('nonmembers cannot read, list or change another family game',async()=>{
 const {service,command,active}=setup();const game=await active();
 assert.deepEqual(await service.list(outsider),[]);
 await assert.rejects(()=>service.get(outsider,game.id),{status:404});
 await assert.rejects(()=>service.act(outsider,game.id,command('pass',1)),{status:404});
 await assert.rejects(()=>service.invite(a,{id:randomUUID(),opponentId:a}),{status:400});
});
test('turn ownership, stale revisions and concurrent actions prevent double play',async()=>{
 const {service,command,active,rows}=setup();const game=await active();
 await assert.rejects(()=>service.act(b,game.id,command('pass',1)),{status:403});
 const attempts=await Promise.allSettled([service.act(a,game.id,command('pass',1)),service.act(a,game.id,command('pass',1))]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(attempts.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(rows.get(game.id).state.history.length,1);
 await assert.rejects(()=>service.act(b,game.id,command('pass',1)),{status:409});
});
test('the same accepted command can be retried after losing its response',async()=>{
 const {service,command,active,rows}=setup();const game=await active(),action=command('pass',1);
 const first=await service.act(a,game.id,action),retry=await service.act(a,game.id,action);
 assert.equal(first.revision,retry.revision);assert.equal(rows.get(game.id).state.history.length,1);
});
test('server validates the rack, dictionary, board and Scrabble bonus',async()=>{
 const {service,command,active,rows}=setup();const game=await active(),row=rows.get(game.id);
 row.state.players[0].rack='MAISONS'.split('');
 const placements='MAISONS'.split('').map((letter,rackIndex)=>({cell:112+rackIndex,rackIndex,letter}));
 await assert.rejects(()=>service.act(a,game.id,command('play',1,{placements:[{cell:112,rackIndex:0,letter:'Z'}]})),{status:400});
 await assert.rejects(()=>service.act(a,game.id,command('play',1,{placements:[{cell:112,rackIndex:0,letter:'M'},{cell:113,rackIndex:3,letter:'S'}]})),{status:400});
 assert.equal(rows.get(game.id).revision,1);
 const next=await service.act(a,game.id,command('play',1,{placements}));
 assert.equal(next.state.players[0].score,68);assert.equal(next.state.history[0].score,68);assert.equal(next.currentUserId,b);
 const other=await service.get(b,game.id);assert(other.state.players[0].rack.every(l=>l==='?'));assert.equal(other.state.board[112].letter,'M');
});
test('exchange is server controlled and six passes persist the final result',async()=>{
 const {service,command,active,rows}=setup();let game=await active();
 await assert.rejects(()=>service.act(a,game.id,command('exchange',1,{indices:[0,0]})),{status:400});
 game=await service.act(a,game.id,command('exchange',1,{indices:[0,1]}));assert.equal(game.currentUserId,b);
 for(let i=0;i<6;i++)game=await service.act(game.currentUserId,game.id,command('pass',game.revision));
 assert.equal(game.status,'finished');assert.equal(game.state.endReason,'passes');assert.equal(rows.get(game.id).state.status,'finished');
 assert.deepEqual((await service.get(a,game.id)).state.board,game.state.board);
 await assert.rejects(()=>service.act(a,game.id,command('pass',game.revision)),{status:409});
});
test('declining an invitation prevents it being accepted or played later',async()=>{
 const {service,command}=setup();let game=await service.invite(a,{id:randomUUID(),opponentId:b});
 game=await service.act(b,game.id,command('decline',0));assert.equal(game.status,'declined');
 await assert.rejects(()=>service.act(b,game.id,command('accept',1)),{status:403});
 await assert.rejects(()=>service.act(a,game.id,command('pass',1)),{status:409});
});
test('HTTP routes enforce UUIDs, membership and reject client-authored scores or game state',async()=>{
 const {accounts}=setup();const server=createApp(accounts).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/games`;
 const request=(path='',method='GET',body,token=a)=>fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('/bad')).status,400);
  let response=await request('','POST',{id:randomUUID(),opponentId:b});assert.equal(response.status,201);const game=await response.json();
  assert.equal((await request('/'+game.id,'GET',null,outsider)).status,404);
  response=await request('/'+game.id+'/actions','POST',{id:randomUUID(),kind:'accept',revision:0},b);assert.equal(response.status,200);
  response=await request('/'+game.id+'/actions','POST',{id:randomUUID(),kind:'pass',revision:1,score:999,state:{}});assert.equal(response.status,400);
  response=await request();const list=await response.json();assert.equal(list.games.length,1);assert.equal(list.games[0].state,undefined);assert.equal(list.games[0].players[0].rack,undefined);
 }finally{await new Promise(r=>server.close(r));}
});

test('either member can resign out of turn; finished result preserves scores and survives reload',async()=>{
 for(const resigning of [a,b]){
  const {service,command,active,rows}=setup();const game=await active();
  rows.get(game.id).state.players[resigning===a?0:1].score=200;
  const previous=structuredClone(rows.get(game.id).state);
  const action=command('resign',game.revision);
  const result=await service.act(resigning,game.id,action);
  assert.equal(result.status,'finished');assert.equal(result.state.status,'finished');assert.equal(result.endReason,'resignation');
  assert.equal(result.resignedByUserId,resigning);assert.equal(result.state.resignedBy,resigning===a?0:1);
  assert.deepEqual(result.state.players.map(p=>p.score),previous.players.map(p=>p.score));
  assert.equal(result.state.history.at(-1).kind,'resign');assert.equal(result.revision,game.revision+1);
  const other=resigning===a?b:a;
  const reloaded=await service.get(other,game.id);assert.equal(reloaded.status,'finished');assert.equal(reloaded.resignedByUserId,resigning);
  assert(reloaded.state.players.find(p=>p.userId===resigning).rack.every(l=>l==='?'));
  assert.equal((await service.list(other))[0].status,'finished');
  assert.equal((await service.act(resigning,game.id,action)).revision,result.revision);
  await assert.rejects(()=>service.act(other,game.id,command('pass',result.revision)),{status:409});
  await assert.rejects(()=>service.act(other,game.id,command('resign',result.revision)),{status:409});
 }
});
test('resignation rejects outsiders, pending invitations and stale revisions without finishing the game',async()=>{
 const {service,command,active,rows}=setup();const invitation=await service.invite(a,{id:randomUUID(),opponentId:b});
 await assert.rejects(()=>service.act(a,invitation.id,command('resign',0)),{status:409});
 const game=await active();
 await assert.rejects(()=>service.act(outsider,game.id,command('resign',game.revision)),{status:404});
 await assert.rejects(()=>service.act(b,game.id,command('resign',game.revision-1)),{status:409});
 assert.equal(rows.get(game.id).status,'active');
});

test('blocked games are persisted as finished and notified once, including explicit opening checks',async()=>{
 const lexicon={id:'blocked-test',has:word=>word==='AT',entries:()=>['AT']},events=[];
 const {service,active,rows,command}=setup({lexicon,onChanged:row=>events.push({id:row.id,status:row.status,revision:row.revision})});
 const game=await active(),row=rows.get(game.id);row.state.bag=[];row.state.players[0].rack=['Q'];row.state.players[1].rack=['Z'];row.state.players[0].score=50;row.state.players[1].score=40;
 const check=command('check-blocked',game.revision),ended=await service.act(b,game.id,check);
 assert.equal(ended.status,'finished');assert.equal(ended.state.endReason,'blocked');assert.deepEqual(ended.state.players.map(p=>p.score),[42,30]);
 assert.equal((await service.list(a))[0].status,'finished');assert.equal((await service.get(b,game.id)).state.endReason,'blocked');
 const count=events.length;await service.act(b,game.id,check);assert.equal(events.length,count);assert.equal(events.at(-1).status,'finished');
});
test('a pass automatically ends an impossible game, but a rescuing bag keeps it active',async()=>{
 const lexicon={id:'blocked-test',has:word=>word==='AT',entries:()=>['AT']};
 for(const rescue of [false,true]){
  const {service,active,rows,command}=setup({lexicon});const game=await active(),row=rows.get(game.id);
  row.state.players[0].rack=['A'];row.state.players[1].rack=['Q'];row.state.bag=rescue?['T','Q','Q','Q','Q','Q','Q']:[];
  const next=await service.act(a,game.id,command('pass',game.revision));assert.equal(next.status,rescue?'active':'finished');
  if(rescue){const checked=await service.act(a,game.id,command('check-blocked',next.revision));assert.equal(checked.revision,next.revision);}
 }
});
