import { z } from 'zod';
export function readConfig(env=process.env){
 const values=z.object({SUPABASE_URL:z.url(),SUPABASE_PUBLISHABLE_KEY:z.string().min(10),SUPABASE_SECRET_KEY:z.string().min(10),PORT:z.coerce.number().int().min(1).max(65535).default(3001),HOST:z.string().default('0.0.0.0'),TRUST_PROXY_HOPS:z.coerce.number().int().min(0).max(5).default(0),CORS_ORIGINS:z.string().default(''),PUSH_ENABLED:z.enum(['true','false']).default('false'),GOOGLE_APPLICATION_CREDENTIALS:z.string().optional()}).parse(env);
 return {pushEnabled:values.PUSH_ENABLED==='true',firebaseCredentials:values.GOOGLE_APPLICATION_CREDENTIALS,url:values.SUPABASE_URL,anonKey:values.SUPABASE_PUBLISHABLE_KEY,serviceKey:values.SUPABASE_SECRET_KEY,port:values.PORT,host:values.HOST,trustProxyHops:values.TRUST_PROXY_HOPS,origins:values.CORS_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean)};
}
