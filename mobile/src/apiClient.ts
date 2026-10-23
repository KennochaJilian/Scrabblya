import type { GameSummary,OnlineSnapshot,VersionedCommand } from './onlineTypes';
export type PublicUser={id:string;name:string;role:'admin'|'user';avatarUrl:string|null;email?:string};
export type Session={accessToken:string;refreshToken:string;expiresAt:number;user:PublicUser};
export class ApiError extends Error{constructor(message:string,public status=0){super(message);}}
export interface TokenStorage{getItemAsync(key:string):Promise<string|null>;setItemAsync(key:string,value:string):Promise<void>;deleteItemAsync(key:string):Promise<void>}
function debug(event:string,details:Record<string,unknown>={}){if(typeof __DEV__!=='undefined'&&__DEV__)console.info('[Scrabblya API] '+event,details);}
const tokenKey='scrabblya.refresh.v1';
export class ApiClient{
 private session:Session|null=null;
 private pushDeviceId:string|null=null;
 private epoch=0;
 private storageQueue:Promise<void>=Promise.resolve();
 private refreshing:Promise<Session>|null=null;
 onUserChanged:(user:PublicUser|null)=>void=()=>{};
 constructor(private base:string,private storage:TokenStorage,private transport:typeof fetch=fetch){}
 private async request<T>(path:string,options:RequestInit={}):Promise<T>{
  const started=Date.now(),method=options.method??'GET';
  debug('requête',{method,path,server:this.base.split('?')[0].replace(/\/\/[^/]*@/,'//[masqué]@')});
  if(!this.base)throw new ApiError('Configurez EXPO_PUBLIC_API_URL dans mobile/.env puis redémarrez Expo.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await this.transport(this.base.replace(/\/$/,'')+path,{...options,signal:controller.signal});
   debug('réponse',{method,path,status:response.status,durationMs:Date.now()-started,requestId:response.headers?.get?.('x-request-id')??undefined});
   if(!response.ok){let message='Service indisponible.';try{message=(await response.json()).error??message;}catch{}throw new ApiError(message,response.status);}
   return response.status===204?undefined as T:await response.json();
  }catch(error){debug('échec',{method,path,status:error instanceof ApiError?error.status:0,timeout:controller.signal.aborted,durationMs:Date.now()-started});if(error instanceof ApiError)throw error;throw new ApiError(controller.signal.aborted?'Le serveur ne répond pas après 15 secondes. Vérifiez que l’API tourne et que le téléphone est sur le même Wi-Fi.':'Connexion à l’API impossible. Vérifiez le réseau et son adresse.');}
  finally{clearTimeout(timer);}
 }
 private persist(task:()=>Promise<void>){const write=this.storageQueue.then(task);this.storageQueue=write.catch(()=>{});return write;}
 private async accept(session:Session,epoch:number){
  if(epoch!==this.epoch)throw new ApiError('Session annulée.',401);
  try{await this.persist(async()=>{if(epoch===this.epoch)await this.storage.setItemAsync(tokenKey,session.refreshToken);});}catch{debug('échec stockage sécurisé');throw new ApiError('Impossible d’enregistrer la session sur ce téléphone.');}
  if(epoch!==this.epoch)throw new ApiError('Session annulée.',401);
  this.session=session;this.onUserChanged(session.user);debug('session prête');return session;
 }
 async login(email:string,password:string){const epoch=++this.epoch;this.refreshing=null;return this.accept(await this.request<Session>('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})}),epoch);}
 async restore(){const epoch=this.epoch,token=await this.storage.getItemAsync(tokenKey);if(epoch!==this.epoch)return this.session;if(!token)return null;return this.refresh(token);}
 private async refresh(token?:string):Promise<Session>{
  if(this.refreshing)return this.refreshing;
  const refreshToken=token??this.session?.refreshToken;if(!refreshToken)throw new ApiError('Reconnectez-vous.',401);
  const epoch=this.epoch;
  const pending=this.request<Session>('/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})})
   .then(session=>this.accept(session,epoch)).catch(async error=>{if(epoch===this.epoch&&error instanceof ApiError&&error.status===401)await this.clear();throw error;});
  this.refreshing=pending;
  try{return await pending;}finally{if(this.refreshing===pending)this.refreshing=null;}
 }
 private async clear(){this.epoch++;this.session=null;this.refreshing=null;this.onUserChanged(null);await this.persist(()=>this.storage.deleteItemAsync(tokenKey));}
 async logout(){const token=this.session?.accessToken,deviceId=this.pushDeviceId;this.pushDeviceId=null;await this.clear();if(token)await this.request('/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(deviceId?{deviceId}:{})});} async call<T>(path:string,options:RequestInit={}):Promise<T>{
  if(!this.session)throw new ApiError('Connexion requise.',401);
  if(this.session.expiresAt*1000<Date.now()+60000)await this.refresh();
  const send=()=>{if(!this.session)throw new ApiError('Connexion requise.',401);return this.request<T>(path,{...options,headers:{...options.headers,Authorization:'Bearer '+this.session.accessToken}});};
  try{return await send();}catch(error){if(!(error instanceof ApiError)||error.status!==401)throw error;await this.refresh();return send();}
 }
 bindPushDevice(id:string|null){this.pushDeviceId=id;}
 async registerPushDevice(id:string,token:string){await this.call<void>('/push/devices/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});}
 async unregisterPushDevice(id:string){await this.call<void>('/push/devices/'+encodeURIComponent(id),{method:'DELETE'});}
 async realtimeCredentials(){
  if(!this.session)throw new ApiError('Connexion requise.',401);
  if(this.session.expiresAt*1000<Date.now()+60000)await this.refresh();
  if(!this.session)throw new ApiError('Connexion requise.',401);
  return {url:this.base.replace(/\/$/,'').replace(/^http:/,'ws:').replace(/^https:/,'wss:')+'/events',token:this.session.accessToken};
 }
 async refreshProfile(){return this.useProfile(await this.call<PublicUser>('/me'));}
 async games(){return (await this.call<{games:GameSummary[]}>('/games')).games;}
 async game(id:string){return this.call<OnlineSnapshot>('/games/'+id);}
 async inviteGame(id:string,opponentId:string){return this.call<OnlineSnapshot>('/games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,opponentId})});}
 async gameAction(id:string,command:VersionedCommand){return this.call<OnlineSnapshot>('/games/'+id+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});}
 async users(){return (await this.call<{users:PublicUser[]}>('/users')).users;}
 private useProfile(user:PublicUser){if(!this.session||this.session.user.id!==user.id)throw new ApiError('Session annulée.',401);this.session.user=user;this.onUserChanged(user);return user;}
 async updateName(name:string){const user=await this.call<PublicUser>('/me',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});return this.useProfile(user);}
 async createUser(input:{name:string;email:string;password:string}){return this.call<PublicUser>('/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});}
 async renameUser(id:string,name:string){const user=await this.call<PublicUser>('/admin/users/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});return this.session?.user.id===user.id?this.useProfile(user):user;}
 async resetUserPassword(id:string,password:string){await this.call<void>('/admin/users/'+encodeURIComponent(id)+'/password',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});}
 async deleteUser(id:string){await this.call<void>('/admin/users/'+encodeURIComponent(id),{method:'DELETE'});}
 async uploadUserAvatar(id:string,form:FormData){
  const user=await this.call<PublicUser>('/admin/users/'+encodeURIComponent(id)+'/avatar',{method:'POST',body:form});
  return this.session?.user.id===user.id?this.useProfile(user):user;
 }
 async uploadAvatar(form:FormData){
  const user=await this.call<PublicUser>('/me/avatar',{method:'POST',body:form});return this.useProfile(user);
 }
}



