import { WebSocket,WebSocketServer } from 'ws';

// Single API instance: only invalidations are sent, never racks or game state.
export function createRealtimeHub({authenticate,origins=[],authTimeoutMs=5000,sessionMs=300000,heartbeatMs=25000}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 const clients=new Map();
 function send(ws,event){
  if(ws.readyState!==WebSocket.OPEN)return;
  if(ws.bufferedAmount>65536){ws.terminate();return;}
  try{ws.send(JSON.stringify(event));}catch{ws.terminate();}
 }
 wss.on('connection',ws=>{
  let authenticating=false,authenticated=false,alive=true,lifetime;
  const deadline=setTimeout(()=>ws.close(4401,'Authentication required'),authTimeoutMs);
  ws.on('error',()=>{});
  ws.on('pong',()=>{alive=true;});
  const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();if(authenticated)send(ws,{type:'heartbeat'});},heartbeatMs);
  ws.on('close',code=>{if(authenticated)console.info('[Scrabblya WebSocket]',JSON.stringify({event:'disconnected',code}));clearTimeout(deadline);clearTimeout(lifetime);clearInterval(heartbeat);clients.delete(ws);});
  ws.on('message',async(data,binary)=>{
   if(authenticated||authenticating){ws.close(4400,'Unexpected message');return;}
   authenticating=true;
   try{
    const message=JSON.parse(data.toString());
    if(binary||message.type!=='authenticate'||typeof message.token!=='string'||message.token.length>4096)throw Error('Invalid authentication');
    const account=await authenticate(message.token);
    if(ws.readyState!==WebSocket.OPEN)return;
    if([...clients.values()].filter(id=>id===account.id).length>=5){ws.close(4429,'Too many connections');return;}
    clients.set(ws,account.id);authenticated=true;clearTimeout(deadline);
    // Renew authentication periodically and no later than token expiration.
    let ttl=sessionMs;
    try{const claims=JSON.parse(Buffer.from(message.token.split('.')[1],'base64url').toString());if(Number.isFinite(claims.exp))ttl=Math.min(ttl,claims.exp*1000-Date.now());}catch{}
    lifetime=setTimeout(()=>ws.close(4401,'Renew authentication'),Math.max(1,ttl));
    console.info('[Scrabblya WebSocket]',JSON.stringify({event:'authenticated'}));
    send(ws,{type:'ready'});
   }catch{ws.close(4401,'Authentication failed');}
  });
 });
 function upgrade(req,socket,head){
  if(req.url!=='/api/events'||wss.clients.size>=64||(req.headers.origin&&!origins.includes(req.headers.origin))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 }
 return {
  attach(server){server.on('upgrade',upgrade);},
  gameChanged(row){const ids=new Set([row.inviter_id,row.invitee_id]);for(const [ws,id] of clients)if(ids.has(id))send(ws,{type:'game.changed',gameId:row.id,revision:row.revision});},
  disconnectUser(userId){for(const [ws,id] of clients)if(id===userId)ws.close(4401,'Account removed');},
  usersChanged(){for(const ws of clients.keys())send(ws,{type:'users.changed'});},
  close(){for(const ws of wss.clients)ws.terminate();wss.close();},
 };
}
