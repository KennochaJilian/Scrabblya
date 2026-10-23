const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),Renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;const {act}=Renderer;
function snapshot(revision){return {id:'game',revision,lastActionId:null,players:[],state:{revision},status:'active'};}
function harness(api){
 let lastRead;const original=api;api={...original,async game(id){lastRead=await original.game(id);return lastRead;},async gameAction(id,command){if(command.kind==='check-blocked')return original.checkBlocked?original.checkBlocked(id,command):lastRead;return original.gameAction(id,command);}};
 const cache=new Map();let callback=()=>{};const listeners=new Set();const realtime={subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
 const native={View:'View',Text:'Text',ActivityIndicator:'Spinner',Pressable:'Pressable',AppState:{currentState:'active',addEventListener(_event,fn){callback=fn;return {remove(){callback=()=>{};}};}}};
 function load(file){
  file=path.resolve(__dirname,'..',file);if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function req(id){if(id==='react-native')return native;if(id==='./api')return {api,realtime};if(id==='./LocalGame')return {LocalGame:props=>React.createElement('Board',props)};if(!id.startsWith('.'))return require(id);return load(path.resolve(path.dirname(file),id)+'.ts');}
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,mod,mod.exports);return mod.exports;
 }
 return {OnlineGame:load('src/OnlineGame.tsx').OnlineGame,foreground(){callback('active');},event(event){for(const listener of listeners)listener(event);}};
}
async function mount(OnlineGame){let rendered;await act(async()=>{rendered=Renderer.create(React.createElement(OnlineGame,{id:'game',userId:'alice',onBack(){}}));});await act(async()=>{await new Promise(r=>setTimeout(r,5));});return rendered;}
test('a lost action response is reconciled by command ID without submitting twice',async()=>{
 let current=snapshot(1),calls=0;
 const {OnlineGame}=harness({async game(){return current;},async gameAction(_id,command){calls++;current={...snapshot(2),lastActionId:command.id};throw Error('Connection lost');}});
 const rendered=await mount(OnlineGame);let result;
 await act(async()=>{result=await rendered.root.findByType('Board').props.remote.onAction({kind:'pass'});});
 assert.equal(calls,1);assert.equal(result.revision,2);assert.equal(rendered.root.findByType('Board').props.remote.game.revision,2);
 await act(async()=>rendered.unmount());
});
test('a slow refresh cannot replace a newer committed move',async()=>{
 let reads=0,finish;
 const {OnlineGame,foreground}=harness({async game(){if(++reads===1)return snapshot(1);return new Promise(resolve=>finish=resolve);},async gameAction(){return snapshot(2);}});
 const rendered=await mount(OnlineGame);
 await act(async()=>foreground());
 await act(async()=>{await rendered.root.findByType('Board').props.remote.onAction({kind:'pass'});});
 await act(async()=>finish(snapshot(1)));
 assert.equal(rendered.root.findByType('Board').props.remote.game.revision,2);
 await act(async()=>rendered.unmount());
});
test('offline refresh keeps the current board and displays an actionable error',async()=>{
 let reads=0;const {OnlineGame,foreground}=harness({async game(){if(++reads===1)return snapshot(1);throw Error('API inaccessible');}});
 const rendered=await mount(OnlineGame);await act(async()=>foreground());
 assert.equal(rendered.root.findByType('Board').props.remote.game.revision,1);
 assert(rendered.root.findAllByType('Text').some(n=>JSON.stringify(n.props.children).includes('API inaccessible')));
 await act(async()=>rendered.unmount());
});


test('avatar URL renewal keeps the same game snapshot and therefore preserves the draft',async()=>{
 let reads=0;const first={...snapshot(1),players:[{id:'alice',name:'Alice',avatarUrl:'old'}]};
 const renewed={...snapshot(1),players:[{id:'alice',name:'Alice',avatarUrl:'renewed'}]};
 const {OnlineGame,foreground}=harness({async game(){return ++reads===1?first:renewed;}});
 const rendered=await mount(OnlineGame),before=rendered.root.findByType('Board').props.remote.game;
 await act(async()=>foreground());
 assert.equal(rendered.root.findByType('Board').props.remote.game,before);
 assert.equal(rendered.root.findByType('Board').props.participants[0].avatarUrl,'renewed');
 await act(async()=>rendered.unmount());
});

test('game events refresh the open game only, and reconnect catches missed revisions',async()=>{
 let revision=1,reads=0;const {OnlineGame,event}=harness({async game(){reads++;return snapshot(revision);}});
 const rendered=await mount(OnlineGame);const initial=reads;
 await act(async()=>event({type:'game.changed',gameId:'another',revision:9}));assert.equal(reads,initial);
 revision=2;await act(async()=>event({type:'game.changed',gameId:'game',revision:2}));
 assert.equal(rendered.root.findByType('Board').props.remote.game.revision,2);
 revision=4;await act(async()=>event({type:'ready'}));
 assert.equal(rendered.root.findByType('Board').props.remote.game.revision,4);
 await act(async()=>rendered.unmount());
});
test('an invalidation received during a slow read is not lost',async()=>{
 let reads=0,finish;const {OnlineGame,event}=harness({async game(){reads++;if(reads===2)return new Promise(resolve=>finish=resolve);return snapshot(reads===1?1:3);}});
 const rendered=await mount(OnlineGame);
 await act(async()=>event({type:'game.changed',gameId:'game',revision:2}));
 await act(async()=>event({type:'game.changed',gameId:'game',revision:3}));
 await act(async()=>finish(snapshot(2)));
 assert.equal(reads,3);assert.equal(rendered.root.findByType('Board').props.remote.game.revision,3);
 await act(async()=>rendered.unmount());
});

test('rematch invitation targets the same opponent and reuses its ID after a lost response',async()=>{
 const ended={...snapshot(3),status:'finished',players:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}]},calls=[];
 const {OnlineGame}=harness({async game(){return ended;},async inviteGame(id,opponentId){calls.push({id,opponentId});if(calls.length===1)throw Error('Lost response');}});
 const rendered=await mount(OnlineGame);const invite=rendered.root.findByType('Board').props.onRematch;
 await assert.rejects(invite, /Lost response/);await invite();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].opponentId,'bob');
 await act(async()=>rendered.unmount());
});
test('opening an active game checks for an already blocked position',async()=>{
 let checks=0;const {OnlineGame}=harness({async game(){return snapshot(1);},async checkBlocked(id,command){checks++;assert.equal(command.kind,'check-blocked');return {...snapshot(2),status:'finished',state:{status:'finished',endReason:'blocked'}};}});
 const rendered=await mount(OnlineGame);assert.equal(checks,1);assert.equal(rendered.root.findByType('Board').props.remote.game.endReason,'blocked');
 await act(async()=>rendered.unmount());
});

test('an invitation opened from a notification can be accepted directly',async()=>{
 const invitation={...snapshot(0),status:'pending',inviteeId:'alice',inviterId:'bob',players:[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}]},calls=[];
 const {OnlineGame}=harness({async game(){return invitation;},async gameAction(id,command){calls.push(command);return {...invitation,...snapshot(1),status:'active'};}});
 const rendered=await mount(OnlineGame);
 assert.equal(rendered.root.findAllByType('Board').length,0);
 const accept=rendered.root.findAllByType('Pressable').find(p=>p.findAllByType('Text').some(t=>t.props.children==='Accepter l’invitation'));
 await act(async()=>accept.props.onPress());assert.equal(calls.length,1);assert.equal(calls[0].kind,'accept');assert.equal(rendered.root.findAllByType('Board').length,1);
 await act(async()=>rendered.unmount());
});
