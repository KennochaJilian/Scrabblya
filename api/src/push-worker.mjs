import { readFileSync } from 'node:fs';
import { initializeApp,cert,deleteApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
export function createFcmSender(file){
 const key=JSON.parse(readFileSync(file,'utf8'));
 if(key.type!=='service_account'||!key.project_id||!key.private_key||!key.client_email)throw new Error('Invalid Firebase service account file');
 const app=initializeApp({credential:cert(key),projectId:key.project_id},'scrabblya-push');
 const messaging=getMessaging(app);
 return {send:message=>messaging.send(message),close:()=>deleteApp(app)};
}
export function messageFor(job,now=Date.now()){
 const body={invitation:'Vous êtes invité à une partie.',turn:'C’est à vous de jouer.',reminder6:'Votre tour vous attend depuis 6 heures.',reminder12:'Votre tour vous attend depuis 12 heures.',reminder24:'Votre tour vous attend depuis 24 heures.'}[job.kind];
 if(!body)throw new Error('unknown_notification_kind');
 return {token:job.token,notification:{title:'Scrabblya',body},data:{gameId:job.gameId,userId:job.userId,revision:String(job.revision),kind:job.kind,body:JSON.stringify({gameId:job.gameId,userId:job.userId,revision:String(job.revision),kind:job.kind})},android:{priority:'high',ttl:Math.max(0,Math.min(3600000,new Date(job.expiresAt).getTime()-now)),collapseKey:'game-'+job.gameId,notification:{channelId:'games',tag:'game-'+job.gameId,sound:'default',color:'#4b0565'}}};
}
const permanent=new Set(['messaging/registration-token-not-registered','messaging/invalid-registration-token']);
export function createPushWorker(repository,sender,{intervalMs=60000,log=console}={}){
 let running=false,stopped=false,timer=null,wakeTimer=null;
 async function tick(){
  if(running||stopped)return;running=true;
  try{
   for(const lease of await repository.claim()){
    if(stopped)break;
    const job=await repository.context(lease);
    if(!job){await repository.complete(lease,'cancelled');continue;}
    try{await sender.send(messageFor(job));await repository.complete(lease,'sent');log.info('[Scrabblya push]',JSON.stringify({event:'sent',kind:job.kind}));}
    catch(error){const code=typeof error.code==='string'?error.code:'push_send_failed';
     if(permanent.has(code)){await repository.invalidate(job);await repository.complete(lease,'failed',code);}
     else await repository.complete(lease,job.attempts>=5?'failed':'pending',code);
     log.warn('[Scrabblya push]',JSON.stringify({event:'send_failed',code}));
    }
   }
  }catch{log.warn('[Scrabblya push] Processing unavailable; check migration 005 and Firebase configuration.');}
  finally{running=false;}
 }
 return {
  tick,
  wake(){if(stopped||wakeTimer)return;wakeTimer=setTimeout(()=>{wakeTimer=null;void tick();},100);},
  start(){timer=setInterval(()=>{void tick();},intervalMs);timer.unref?.();void tick();},
  async stop(){stopped=true;if(timer)clearInterval(timer);if(wakeTimer)clearTimeout(wakeTimer);const deadline=Date.now()+5000;while(running&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));if(!running)await sender.close?.();},
 };
}
