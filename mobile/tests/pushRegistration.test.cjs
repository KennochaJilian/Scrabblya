const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {PushRegistration,notificationTarget}=load('src/pushRegistration.ts');
function fixture(){const calls=[];let permission=true;
 const driver={supported:true,async id(){return 'installation';},async permission(){return permission;},async token(){calls.push(['token']);return 'fcm-token';},async revoke(){calls.push(['revoke']);},bind(id){calls.push(['bind',id]);},async register(id,token){calls.push(['register',id,token]);},async unregister(id){calls.push(['unregister',id]);}};
 return {driver,calls,registration:new PushRegistration(driver),deny(){permission=false;}};
}
test('registration requires permission and does not disable login when denied or offline',async()=>{
 const f=fixture();f.deny();await f.registration.setUser('alice');assert.equal(f.registration.snapshot().status,'denied');assert.equal(f.calls.some(c=>c[0]==='token'),false);
 f.driver.permission=async()=>true;f.driver.register=async()=>{throw Error('Offline');};await f.registration.refresh(true);assert.equal(f.registration.snapshot().status,'error');
});
test('token update uses the supplied token without requesting it recursively; switching account revokes before registering',async()=>{
 const f=fixture();await f.registration.setUser('alice');assert.equal(f.registration.snapshot().status,'enabled');
 const requests=f.calls.filter(c=>c[0]==='token').length;await f.registration.refresh(false,'rotated-token');assert.equal(f.calls.filter(c=>c[0]==='token').length,requests);
 assert.deepEqual(f.calls.at(-1),['register','installation','rotated-token']);
 await f.registration.setUser('bob');const revoke=f.calls.findIndex(c=>c[0]==='revoke');assert(revoke>=0);assert(f.calls.slice(revoke+1).some(c=>c[0]==='register'));
 await f.registration.setUser(null);assert.equal(f.registration.snapshot().status,'inactive');
});
test('a slow registration from the previous account is cancelled before obtaining a token',async()=>{
 const f=fixture();let finish;f.driver.permission=()=>new Promise(r=>finish=r);const first=f.registration.setUser('alice');await new Promise(r=>setImmediate(r));const logout=f.registration.setUser(null);finish(true);await first;await logout;
 assert.equal(f.calls.some(c=>c[0]==='register'),false);assert.equal(f.calls.some(c=>c[0]==='revoke'),true);
});
test('notification parsing accepts only a valid game and recipient pair, including Expo body metadata',()=>{
 const target={gameId:'00000000-0000-4000-8000-000000000001',userId:'00000000-0000-4000-8000-000000000002'};
 assert.deepEqual(notificationTarget(target),target);assert.deepEqual(notificationTarget({body:JSON.stringify(target)}),target);
 for(const value of [null,{},'x',{gameId:'bad',userId:target.userId},{body:'not-json'}])assert.equal(notificationTarget(value),null);
});
