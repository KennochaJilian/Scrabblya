import { createRealtimeHub } from './realtime.mjs';
import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';
import { createSupabaseService } from './supabase-service.mjs';
try{
 const config=readConfig();
 const service=createSupabaseService(config);
 const realtime=createRealtimeHub({authenticate:token=>service.authenticate(token),origins:config.origins});
 const server=createApp(service,{...config,realtime}).listen(config.port,config.host,()=>console.log(`Scrabblya API disponible sur le port ${config.port}`));
 realtime.attach(server);
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{realtime.close();server.close(()=>process.exit(0));});
}catch{console.error('Configuration API invalide. Complétez api/.env à partir de .env.example.');process.exitCode=1;}
