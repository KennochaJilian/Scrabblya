import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.mjs';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
export function createSupabaseService(config,{clientFactory=createClient}={}){
 const admin=clientFactory(config.url,config.serviceKey,options);
 const auth=()=>clientFactory(config.url,config.anonKey,options);
 async function row(id){const {data,error}=await admin.from('profiles').select('*').eq('id',id).maybeSingle();if(error)throw new ApiError(503,'Profils indisponibles.');if(!data)throw new ApiError(403,'Compte non autorisé.');return data;}
 async function dto(profile,privateFields=true){
  let avatarUrl=null;
  if(profile.avatar_path){const {data,error}=await admin.storage.from('avatars').createSignedUrl(profile.avatar_path,3600);if(error)throw new ApiError(503,'Avatar indisponible.');avatarUrl=data.signedUrl;}
  return {id:profile.id,name:profile.name,role:profile.role,avatarUrl,...(privateFields?{email:profile.email}:{})};
 }
 async function sessionDTO(session){
  if(!session)throw new ApiError(401,'Session invalide.');
  return {accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:session.expires_at,user:await dto(await row(session.user.id))};
 }
 async function createAccount({name,email,password},role='user'){
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(error){if(['email_exists','user_already_exists'].includes(error.code))throw new ApiError(409,'Un compte utilise déjà cet email.');throw new ApiError(400,'Création du compte refusée. Vérifiez l’email et le mot de passe.');}
  const profile={id:data.user.id,name,email,role};
  const inserted=await admin.from('profiles').insert(profile).select().single();
  if(inserted.error){
   const rollback=await admin.auth.admin.deleteUser(data.user.id);
   if(rollback.error)throw new ApiError(503,'Création incomplète : vérifier le compte dans Supabase avant de réessayer.');
   throw new ApiError(inserted.error.code==='23505'?409:503,'Impossible de créer le profil.');
  }
  return dto(inserted.data);
 }
 return {
  async login(email,password){const {data,error}=await auth().auth.signInWithPassword({email,password});if(error)throw new ApiError(401,'Email ou mot de passe incorrect.');return sessionDTO(data.session);},
  async refresh(refreshToken){const {data,error}=await auth().auth.refreshSession({refresh_token:refreshToken});if(error)throw new ApiError(401,'Session expirée. Reconnectez-vous.');return sessionDTO(data.session);},
  async authenticate(token){const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw new ApiError(401,'Session invalide ou expirée.');return row(data.user.id);},
  async me(id){return dto(await row(id));},
  async logout(token){const {error}=await admin.auth.admin.signOut(token,'local');if(error)throw new ApiError(401,'Session déjà expirée.');},
  async listUsers(includeEmails=false){const {data,error}=await admin.from('profiles').select('*').order('name');if(error)throw new ApiError(503,'Utilisateurs indisponibles.');return Promise.all(data.map(p=>dto(p,includeEmails)));},
  createAccount,
  async updateName(id,name){const {data,error}=await admin.from('profiles').update({name}).eq('id',id).select().single();if(error)throw new ApiError(503,'Modification impossible.');return dto(data);},
  async resetPassword(id,password){await row(id);const {error}=await admin.auth.admin.updateUserById(id,{password});if(error)throw new ApiError(400,'Modification du mot de passe refusée.');},
  async uploadAvatar(id,buffer,mime){
   const old=await row(id),extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
   const objectPath=`${id}/${randomUUID()}.${extension}`;
   const uploaded=await admin.storage.from('avatars').upload(objectPath,buffer,{contentType:mime,upsert:false});
   if(uploaded.error)throw new ApiError(503,'Envoi de l’avatar impossible.');
   const updated=await admin.from('profiles').update({avatar_path:objectPath}).eq('id',id).select().single();
   if(updated.error){await admin.storage.from('avatars').remove([objectPath]);throw new ApiError(503,'Modification de l’avatar impossible.');}
   if(old.avatar_path)await admin.storage.from('avatars').remove([old.avatar_path]);
   return dto(updated.data);
  },
  async seedAdmin(input){
   const existing=await admin.from('profiles').select('*').eq('email',input.email).maybeSingle();
   if(existing.error)throw new ApiError(503,'Profils indisponibles. Appliquez la migration SQL.');
   if(existing.data){if(existing.data.role!=='admin')throw new ApiError(409,'Cet email appartient à un utilisateur. Aucune promotion automatique.');return {created:false,user:await dto(existing.data)};}
   return {created:true,user:await createAccount(input,'admin')};
  },
 };
}

