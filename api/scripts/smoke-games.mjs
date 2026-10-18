// Opt-in integration test. All temporary accounts and games are removed.
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../src/app.mjs';
import { readConfig } from '../src/config.mjs';
import { createSupabaseService } from '../src/supabase-service.mjs';
import { createGameRepository } from '../src/game-repository.mjs';
import { serverLexicon } from '../src/game-service.mjs';
if(process.env.RUN_SUPABASE_SMOKE!=='1')throw new Error('Set RUN_SUPABASE_SMOKE=1 to run.');
const config=readConfig(),service=createSupabaseService(config);
const admin=createClient(config.url,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const accounts=[],games=[],tokens=[];let server;
try{
 const password=randomBytes(24).toString('base64url');
 for(let i=0;i<2;i++)accounts.push(await service.createAccount({name:'Test intégration '+(i+1),email:'scrabblya-test-'+randomUUID()+'@example.com',password}));
 server=createApp(service,config).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(path,{actor,body,status=200}={}){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(actor!==undefined?{Authorization:'Bearer '+tokens[actor]}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,'HTTP '+path);return response.json();
 }
 for(let i=0;i<2;i++)tokens.push((await request('/auth/login',{body:{email:accounts[i].email,password}})).accessToken);
 const id=randomUUID();games.push(id);
 let game=await request('/games',{actor:0,body:{id,opponentId:accounts[1].id},status:201});
 assert(game.state.players.every(p=>p.rack.every(l=>l==='?')));
 await request('/games/'+id+'/actions',{actor:0,body:{id:randomUUID(),revision:0,kind:'accept'},status:403});
 game=await request('/games/'+id+'/actions',{actor:1,body:{id:randomUUID(),revision:0,kind:'accept'}});
 const mine=await request('/games/'+id,{actor:0});assert(mine.state.players[1].rack.every(l=>l==='?'));assert(game.state.players[0].rack.every(l=>l==='?'));
 let word,placements;const rack=mine.state.players[0].rack;
 for(let i=0;i<rack.length&&!word;i++)for(let j=0;j<rack.length&&!word;j++)if(i!==j){
  for(const x of rack[i]==='?'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':rack[i])for(const y of rack[j]==='?'?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':rack[j])if(!word&&serverLexicon.has(x+y)){word=x+y;placements=[{cell:112,rackIndex:i,letter:x},{cell:113,rackIndex:j,letter:y}];}
 }
 if(placements){game=await request('/games/'+id+'/actions',{actor:0,body:{id:randomUUID(),revision:game.revision,kind:'play',placements}});assert.equal(game.state.history[0].words[0],word);console.log('Mot validé par le lexique serveur : OK');}
 const actor=game.currentUserId===accounts[0].id?0:1,action={id:randomUUID(),revision:game.revision,kind:'pass'};
 game=await request('/games/'+id+'/actions',{actor,body:action});
 assert.equal((await request('/games/'+id+'/actions',{actor,body:action})).revision,game.revision);
 for(let i=1;i<6;i++){const actor=game.currentUserId===accounts[0].id?0:1;game=await request('/games/'+id+'/actions',{actor,body:{id:randomUUID(),revision:game.revision,kind:'pass'}});}
 assert.equal(game.status,'finished');
 const persisted=await createGameRepository(admin).get(id);assert.equal(persisted.status,'finished');assert.equal(persisted.state.history.length,game.state.history.length);
 const publicClient=createClient(config.url,config.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const direct=await publicClient.from('games').select('state').eq('id',id);assert(direct.error||direct.data.length===0);
 await publicClient.auth.signInWithPassword({email:accounts[0].email,password});
 const authenticated=await publicClient.from('games').select('state').eq('id',id);assert(authenticated.error||authenticated.data.length===0);
 await publicClient.auth.signOut();
 console.log('Supabase réel : invitations, deux comptes, coups, reprise, fin et confidentialité OK.');
}catch(error){console.error('Test intégration échoué :',error instanceof assert.AssertionError?error.message:(error.status?'statut '+error.status:'erreur de service'));process.exitCode=1;}
finally{
 let clean=true;
 if(games.length){const {error}=await admin.from('games').delete().in('id',games);if(error)clean=false;}
 for(const token of tokens){try{await service.logout(token);}catch{}}
 for(const account of accounts){const {error}=await admin.auth.admin.deleteUser(account.id);if(error)clean=false;}
 if(server)await new Promise(r=>server.close(r));
 console.log(clean?'Comptes et parties temporaires supprimés.':'Nettoyage incomplet : vérifier les fixtures Test intégration.');
 if(!clean)process.exitCode=1;
}
