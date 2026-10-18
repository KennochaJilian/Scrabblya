import { pathToFileURL } from 'node:url';
import { accountInput } from '../src/app.mjs';
import { readConfig } from '../src/config.mjs';
import { createSupabaseService } from '../src/supabase-service.mjs';
import { ApiError } from '../src/errors.mjs';
export async function seedAdmin(service,input){return service.seedAdmin(accountInput.parse(input));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const input={name:process.env.SEED_ADMIN_NAME,email:process.env.SEED_ADMIN_EMAIL,password:process.env.SEED_ADMIN_PASSWORD};
  const result=await seedAdmin(createSupabaseService(readConfig()),input);
  console.log(result.created?'Administrateur créé.':'Administrateur déjà présent ; mot de passe inchangé.');
 }catch(error){console.error(error instanceof ApiError?error.message:'Seed impossible. Vérifiez la configuration et SEED_ADMIN_NAME / EMAIL / PASSWORD (12 caractères minimum).');process.exitCode=1;}
}

