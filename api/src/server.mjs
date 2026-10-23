import { createFcmSender,createPushWorker } from './push-worker.mjs';
import { createRealtimeHub } from './realtime.mjs';
import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';
import { createSupabaseService } from './supabase-service.mjs';
try{
 const config=readConfig();
 const service=createSupabaseService(config);
 const realtime=createRealtimeHub({authenticate:token=>service.authenticate(token),origins:config.origins});
 const pushWorker=config.pushEnabled?createPushWorker(service.pushRepository,createFcmSender(config.firebaseCredentials)):null;
 const server=createApp(service,{...config,realtime,pushWorker}).listen(config.port,config.host,()=>console.log(`Scrabblya API disponible sur le port ${config.port}`));
 realtime.attach(server);pushWorker?.start();
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{realtime.close();await pushWorker?.stop();server.close(()=>process.exit(0));});
}catch{console.error('Configuration API invalide. Vérifiez api/.env et le fichier GOOGLE_APPLICATION_CREDENTIALS si PUSH_ENABLED=true.');process.exitCode=1;}
