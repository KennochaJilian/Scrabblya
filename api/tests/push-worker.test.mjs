import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushWorker,messageFor } from '../src/push-worker.mjs';
const job={id:'job',leaseId:'lease',deviceId:'device',gameId:'game',userId:'player',revision:7,kind:'turn',token:'private-token',attempts:1,expiresAt:new Date(Date.now()+7200000).toISOString()};
function fixture({valid=true,error,attempts=1}={}){
 const calls=[],logs=[],repo={async claim(){return [{id:'job',leaseId:'lease'}];},async context(){return valid?{...job,attempts}:null;},async complete(...args){calls.push(['complete',...args]);},async invalidate(...args){calls.push(['invalidate',...args]);}};
 const sender={async send(message){calls.push(['send',message]);if(error)throw error;}};
 return {calls,logs,worker:createPushWorker(repo,sender,{log:{info(...args){logs.push(args);},warn(...args){logs.push(args);}}})};
}
test('FCM payload contains navigation metadata, a bounded TTL and no game state',()=>{
 const message=messageFor(job);assert.equal(message.token,'private-token');assert.equal(message.android.notification.channelId,'games');assert.equal(message.android.ttl,3600000);
 assert.deepEqual(JSON.parse(message.data.body),{gameId:'game',userId:'player',revision:'7',kind:'turn'});
 assert.equal('state' in message,false);assert.equal('rack' in message.data,false);
});
test('stale jobs are cancelled without sending, successful jobs are acknowledged without logging the token',async()=>{
 const stale=fixture({valid:false});await stale.worker.tick();assert.equal(stale.calls.some(c=>c[0]==='send'),false);assert.equal(stale.calls[0][2],'cancelled');
 const current=fixture();await current.worker.tick();assert.equal(current.calls[0][0],'send');assert.equal(current.calls[1][2],'sent');assert.equal(JSON.stringify(current.logs).includes(job.token),false);
});
test('invalid tokens are disabled; temporary errors retry with a finite attempt budget',async()=>{
 const invalid=fixture({error:{code:'messaging/registration-token-not-registered'}});await invalid.worker.tick();assert.equal(invalid.calls[1][0],'invalidate');assert.equal(invalid.calls[2][2],'failed');
 const temporary=fixture({error:{code:'messaging/server-unavailable'}});await temporary.worker.tick();assert.equal(temporary.calls[1][2],'pending');
 const exhausted=fixture({error:{code:'messaging/server-unavailable'},attempts:5});await exhausted.worker.tick();assert.equal(exhausted.calls[1][2],'failed');
});
test('overlapping ticks never send the same leased batch twice',async()=>{
 let release,claims=0,sent=0;
 const repo={async claim(){claims++;return [{id:'job',leaseId:'lease'}];},async context(){await new Promise(r=>release=r);return job;},async complete(){}};
 const worker=createPushWorker(repo,{async send(){sent++;}},{log:{info(){},warn(){}}});const first=worker.tick();await new Promise(r=>setImmediate(r));await worker.tick();release();await first;assert.equal(claims,1);assert.equal(sent,1);
});
