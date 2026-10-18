import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';
import { createSupabaseService } from './supabase-service.mjs';
try{
 const config=readConfig();
 const server=createApp(createSupabaseService(config),config).listen(config.port,config.host,()=>console.log(`Scrabblya API disponible sur le port ${config.port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}catch{console.error('Configuration API invalide. Complétez api/.env à partir de .env.example.');process.exitCode=1;}
