const test=require('node:test'),assert=require('node:assert/strict');
const {RealtimeClient}=require('./load-ts.cjs')('src/realtime.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const sockets=[],events=[];let credentials=0;
 const client=new RealtimeClient(async()=>{credentials++;return {url:'wss://api.test/api/events',token:'private-token'};},url=>{
  const ws={url,sent:[],close(){this.closed=true;this.onclose?.();},send(value){this.sent.push(JSON.parse(value));}};sockets.push(ws);return ws;
 });client.subscribe(event=>events.push(event));return {client,sockets,events,count:()=>credentials};
}
test('websocket authenticates in a frame, ignores stale callbacks and pauses in background',async()=>{
 const {client,sockets,events,count}=fixture();client.start();await flush();
 assert.equal(sockets[0].url,'wss://api.test/api/events');assert.equal(sockets[0].url.includes('private-token'),false);
 sockets[0].onopen();assert.deepEqual(sockets[0].sent,[{type:'authenticate',token:'private-token'}]);
 sockets[0].onmessage({data:'{"type":"ready"}'});assert.deepEqual(events,[{type:'ready'}]);
 client.setActive(false);assert.equal(sockets[0].closed,true);
 sockets[0].onmessage({data:'{"type":"game.changed","gameId":"game","revision":2}'});assert.equal(events.length,1);
 client.setActive(true);await flush();assert.equal(sockets.length,2);assert.equal(count(),2);
 client.stop();assert.equal(sockets[1].closed,true);client.start();client.stop();await flush();assert.equal(sockets.length,2);
});
test('a dropped connection reconnects with new credentials and requests resynchronization on ready',async()=>{
 const {client,sockets,events,count}=fixture();
 try{
  client.start();await flush();sockets[0].onclose();
  await new Promise(resolve=>setTimeout(resolve,1600));
  assert.equal(sockets.length,2);assert.equal(count(),2);assert.deepEqual(events,[{type:'disconnected'}]);
  sockets[1].onmessage({data:'{"type":"ready"}'});assert.equal(events.at(-1).type,'ready');
 }finally{client.stop();}
});
