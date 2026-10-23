export type PushState={status:'inactive'|'unsupported'|'registering'|'enabled'|'denied'|'error';message:string};
type Driver={supported:boolean;id:()=>Promise<string>;permission:(ask:boolean)=>Promise<boolean>;token:()=>Promise<string>;revoke:()=>Promise<void>;bind:(id:string|null)=>void;register:(id:string,token:string)=>Promise<void>;unregister:(id:string)=>Promise<void>};
export class PushRegistration{
 private userId:string|null=null;private generation=0;private queue=Promise.resolve();
 private state:PushState={status:'inactive',message:''};private listeners=new Set<()=>void>();
 constructor(private driver:Driver){}
 snapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private emit(state:PushState){this.state=state;for(const listener of this.listeners)listener();}
 private enqueue(work:()=>Promise<void>){const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
 setUser(userId:string|null){
  if(this.userId===userId)return;
  const previous=this.userId;this.userId=userId;const generation=++this.generation;
  this.driver.bind(null);
  return this.enqueue(async()=>{
   if(previous&&previous!==userId&&this.driver.supported){try{await this.driver.revoke();}catch{}}
   if(generation!==this.generation)return;
   if(!userId){this.emit({status:'inactive',message:''});return;}
   await this.register(generation,false);
  });
 }
 refresh(ask=false,token?:string){const generation=this.generation;return this.enqueue(()=>this.register(generation,ask,token));}
 private async register(generation:number,ask:boolean,providedToken?:string){
  const valid=()=>generation===this.generation&&!!this.userId;
  if(!valid())return;
  if(!this.driver.supported){this.emit({status:'unsupported',message:'Les notifications nécessitent l’APK Scrabblya sur un téléphone Android.'});return;}
  this.emit({status:'registering',message:''});
  try{
   const id=await this.driver.id();if(!valid())return;this.driver.bind(id);
   const granted=await this.driver.permission(ask);if(!valid())return;
   if(!granted){await this.driver.unregister(id);if(valid())this.emit({status:'denied',message:'Autorisez les notifications dans les réglages du téléphone.'});return;}
   const token=providedToken??await this.driver.token();if(!valid())return;
   await this.driver.register(id,token);if(valid())this.emit({status:'enabled',message:'Notifications activées.'});
  }catch(e){if(valid())this.emit({status:'error',message:e instanceof Error?e.message:'Activation des notifications impossible.'});}
 }
}
export function notificationTarget(value:unknown):{gameId:string;userId:string}|null{
 if(!value||typeof value!=='object')return null;
 const data=value as Record<string,unknown>,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(typeof data.gameId==='string'&&typeof data.userId==='string'&&uuid.test(data.gameId)&&uuid.test(data.userId))return {gameId:data.gameId,userId:data.userId};
 if(typeof data.body==='string'){try{return notificationTarget(JSON.parse(data.body));}catch{}}
 if(data.data&&typeof data.data==='object')return notificationTarget(data.data);
 return null;
}
