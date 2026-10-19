export type RealtimeEvent={type:'ready'}|{type:'game.changed';gameId:string;revision:number}|{type:'users.changed'}|{type:'disconnected'};
type Credentials={url:string;token:string};
// Shared connection for the signed-in account. No HTTP polling fallback.
export class RealtimeClient{
 private listeners=new Set<(event:RealtimeEvent)=>void>();
 private socket:WebSocket|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private watchdog:ReturnType<typeof setTimeout>|null=null;
 private running=false;private active=true;private generation=0;private attempts=0;
 constructor(private credentials:()=>Promise<Credentials>,private open:(url:string)=>WebSocket=url=>new WebSocket(url)){}
 subscribe(listener:(event:RealtimeEvent)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private emit(event:RealtimeEvent){for(const listener of this.listeners)listener(event);}
 start(){if(this.running)return;this.running=true;this.attempts=0;void this.connect();}
 stop(){this.running=false;this.cancel();}
 setActive(active:boolean){if(this.active===active)return;this.active=active;this.cancel();if(active&&this.running){this.attempts=0;void this.connect();}}
 private cancel(){this.generation++;if(this.timer)clearTimeout(this.timer);if(this.watchdog)clearTimeout(this.watchdog);this.timer=null;this.watchdog=null;const socket=this.socket;this.socket=null;socket?.close();}
 private async connect(){
  if(!this.running||!this.active)return;
  const generation=++this.generation;
  const valid=()=>this.running&&this.active&&generation===this.generation;
  const retry=()=>{
   if(!valid())return;
   this.generation++;if(this.watchdog)clearTimeout(this.watchdog);this.watchdog=null;
   const socket=this.socket;this.socket=null;socket?.close();this.emit({type:'disconnected'});
   const delay=Math.min(30000,1000*2**Math.min(this.attempts++,5))+Math.floor(Math.random()*500);
   this.timer=setTimeout(()=>{this.timer=null;void this.connect();},delay);
  };
  try{
   const {url,token}=await this.credentials();if(!valid())return;
   const socket=this.open(url);this.socket=socket;
   this.watchdog=setTimeout(retry,15000);
   socket.onopen=()=>{if(valid())socket.send(JSON.stringify({type:'authenticate',token}));};
   socket.onmessage=message=>{
    if(!valid())return;
    try{
     const event=JSON.parse(String(message.data));
     if(this.watchdog)clearTimeout(this.watchdog);this.watchdog=setTimeout(retry,65000);
     if(event.type==='ready'){this.attempts=0;this.emit({type:'ready'});}
     else if(event.type==='users.changed')this.emit({type:'users.changed'});
     else if(event.type==='game.changed'&&typeof event.gameId==='string'&&Number.isInteger(event.revision))this.emit(event);
    }catch{}
   };
   socket.onerror=retry;socket.onclose=retry;
  }catch{retry();}
 }
}
