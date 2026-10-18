const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),Renderer=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
function harness(saved){
 const cache=new Map(),layout={rackY:520},writes=[];
 const View=React.forwardRef(function View(props,ref){
  React.useImperativeHandle(ref,()=>({measure:fn=>{
   const rect=props.testID==='game-board'?[0,100,375,375]:props.testID==='current-rack'?[0,layout.rackY,375,56]:props.testID==='game-root'?[0,0,375,800]:[175,275,25,25];
   fn(0,0,rect[2],rect[3],rect[0],rect[1]);
  }}));
  return React.createElement('View',props,props.children);
 });
 const native={View,Text:'Text',Image:'Image',Modal:props=>props.visible?React.createElement('Modal',props,props.children):null,Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'Spinner',StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:375,height:800}),PanResponder:{create:handlers=>({panHandlers:handlers})},Animated:{View,ValueXY:class{setValue(){}getTranslateTransform(){return []}}}};
 const storage={getItem:async()=>JSON.stringify(saved),setItem:async(key,value)=>{writes.push({key,value});}};
 const mocks={'react-native':native,'@react-native-async-storage/async-storage':storage,'expo-status-bar':{StatusBar:()=>null},'@expo/vector-icons/Ionicons':'Icon','react-native-safe-area-context':{SafeAreaProvider:'Provider',SafeAreaView:'SafeArea',useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}};
 function load(file){
  file=path.resolve(__dirname,'..',file);if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  function req(id){
   if(Object.hasOwn(mocks,id))return mocks[id];if(!id.startsWith('.'))return require(id);
   const target=path.resolve(path.dirname(file),id);if(target.endsWith('.png'))return target;
   if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));
   return load(fs.existsSync(target+'.tsx')?target+'.tsx':target+'.ts');
  }
  vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(req,mod,mod.exports);return mod.exports;
 }
 return {Game:load('src/LocalGame.tsx').LocalGame,layout,writes};
}
function host(root,type,label){return root.find(n=>n.type===type&&n.props.accessibilityLabel===label);}
test('draft letters return through recall button, board tap and board-to-rack drag',async()=>{
 const load=require('./load-ts.cjs'),{createGame}=load('src/engine.ts'),{lexicon}=load('src/lexicon.ts');
 const game=createGame(['Alice','Bob'],lexicon.id,()=>.4);game.players[0].rack=['C','H','A','T','E','R','S'];
 const {Game,layout}=harness(game);let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(Game,{onBack(){}}));});
 const root=rendered.root;
 await act(async()=>host(root,'Pressable','Découvrir mon chevalet').props.onPress());
 async function placeC(){
  await act(async()=>host(root,'View','Lettre C').props.onAccessibilityAction());
  await act(async()=>root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Ligne 8, colonne 8,')).props.onPress());
  assert.equal(root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,1);
 }
 function rackHasC(){const rack=root.find(n=>n.type==='View'&&n.props.testID==='current-rack');assert.equal(rack.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre C').length,1);}
 await placeC();await act(async()=>host(root,'Pressable','Reprendre toutes les lettres').props.onPress());rackHasC();
 await placeC();await act(async()=>host(root,'View','Lettre C').props.onAccessibilityAction());rackHasC();
 await placeC();
 const tile=host(root,'View','Lettre C');layout.rackY=700;
 await act(async()=>tile.props.onPanResponderGrant({nativeEvent:{pageX:187,pageY:287}}));
 await act(async()=>tile.props.onPanResponderMove({nativeEvent:{pageX:100,pageY:540}}));
 layout.rackY=520;
 await act(async()=>tile.props.onPanResponderRelease({nativeEvent:{pageX:100,pageY:540}}));
 rackHasC();assert.equal(root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,0);
 await act(async()=>rendered.unmount());
});


test('developer play never overwrites normal save and exiting restores the draft',async()=>{
 const load=require('./load-ts.cjs'),{createGame}=load('src/engine.ts'),{lexicon}=load('src/lexicon.ts');
 const saved=createGame(['Alice','Bob'],lexicon.id,()=>.4);saved.players[0].rack=['C','H','A','T','E','R','S'];
 const {Game,writes}=harness(saved);let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(Game,{onBack(){}}));});
 const root=rendered.root;
 const pressLabel=async label=>{await act(async()=>host(root,'Pressable',label).props.onPress());};
 const pressAction=async label=>{await act(async()=>root.find(n=>n.type==='Pressable'&&n.findAll(c=>c.type==='Text'&&c.props.children===label).length>0).props.onPress());};
 await pressLabel('Découvrir mon chevalet');
 await act(async()=>host(root,'View','Lettre C').props.onAccessibilityAction());
 await act(async()=>root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Ligne 8, colonne 8,')).props.onPress());
 await pressLabel('Menu de la partie');await pressAction('Mode développeur');
 await pressAction('Scrabble : prêt à valider (66 pts)');
 await pressLabel('Valider le mot');
 assert.equal(writes.length,0);
 assert.equal(root.findAll(n=>n.type==='Text'&&n.props.children==='Scrabble !').length,1);
 await pressLabel('Continuer après le Scrabble');await pressLabel('Découvrir mon chevalet');
 await pressLabel('Mode développeur actif');await pressAction('Revenir à ma partie');
 assert.equal(writes.length,0);
 const rack=root.find(n=>n.type==='View'&&n.props.testID==='current-rack');
 assert.equal(rack.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,1);
 assert.equal(root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre C').length,1);
 assert.equal(root.findAll(n=>n.type==='Text'&&n.props.children==='DEV').length,0);
 await act(async()=>rendered.unmount());
});


test('online board sends only placements, preserves a rejected draft and never writes a local save',async()=>{
 const load=require('./load-ts.cjs'),{createGame,playMove}=load('src/engine.ts'),{lexicon}=load('src/lexicon.ts');
 const real=createGame(['Alice','Bob'],lexicon.id,()=>.4);real.players[0].userId='alice';real.players[1].userId='bob';real.players[0].rack=['C','H','A','T','E','R','S'];
 function redacted(game){return {...game,bag:game.bag.map(()=>'?'),players:game.players.map((p,i)=>({...p,rack:i===0?p.rack:p.rack.map(()=>'?')}))};}
 const initial=redacted(real),{Game,writes}=harness(real);let rendered,failed=true;const calls=[];
 const remote={game:initial,viewerId:'alice',async onAction(command){calls.push(command);if(failed)throw Error('Connexion interrompue');return redacted(playMove(real,command.placements,lexicon));}};
 await act(async()=>{rendered=Renderer.create(React.createElement(Game,{onBack(){},remote}));});
 assert.equal(rendered.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Découvrir mon chevalet').length,0);
 for(const [index,letter] of [...'CHAT'].entries()){
  await act(async()=>host(rendered.root,'View','Lettre '+letter).props.onAccessibilityAction());
  await act(async()=>rendered.root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith(`Ligne 8, colonne ${7+index},`)).props.onPress());
 }
 await act(async()=>host(rendered.root,'Pressable','Valider le mot').props.onPress());
 assert.equal(calls[0].kind,'play');assert.equal(calls[0].placements.length,4);assert.deepEqual(Object.keys(calls[0]).sort(),['kind','placements']);
 assert.equal(rendered.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,4);
 await act(async()=>host(rendered.root,'Pressable','Fermer l’erreur').props.onPress());failed=false;
 await act(async()=>host(rendered.root,'Pressable','Valider le mot').props.onPress());
 assert.equal(rendered.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,0);
 assert.equal(host(rendered.root,'Pressable','Valider le mot').props.disabled,true);
 assert.equal(writes.length,0);
 await act(async()=>rendered.unmount());
});

test('waiting online player sees their own rack, cannot play and receives the next server turn',async()=>{
 const load=require('./load-ts.cjs'),{createGame,passTurn}=load('src/engine.ts'),{lexicon}=load('src/lexicon.ts');
 const game=createGame(['Alice','Bob'],lexicon.id,()=>.4);game.players[0].userId='alice';game.players[1].userId='bob';game.players[0].rack=['?','?','?'];game.players[1].rack=['Z','A','C'];game.bag=game.bag.map(()=>'?');
 const {Game,writes}=harness(game);let rendered;const remote={game,viewerId:'bob',async onAction(){throw Error('Must not send');}};
 await act(async()=>{rendered=Renderer.create(React.createElement(Game,{onBack(){},remote}));});
 const rack=rendered.root.find(n=>n.type==='View'&&n.props.testID==='current-rack');assert.equal(rack.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre Z').length,1);
 assert.equal(host(rendered.root,'Pressable','Valider le mot').props.disabled,true);
 await act(async()=>host(rendered.root,'View','Lettre Z').props.onAccessibilityAction());
 await act(async()=>rendered.root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Ligne 8, colonne 8,')).props.onPress());
 assert.equal(rendered.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,0);
 const next=passTurn(game);
 await act(async()=>rendered.update(React.createElement(Game,{onBack(){},remote:{...remote,game:next}})));
 await act(async()=>host(rendered.root,'View','Lettre Z').props.onAccessibilityAction());
 await act(async()=>rendered.root.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Ligne 8, colonne 8,')).props.onPress());
 assert.equal(rendered.root.findAll(n=>n.type==='View'&&n.props.accessibilityLabel==='Lettre posée').length,1);
 assert.equal(writes.length,0);await act(async()=>rendered.unmount());
});
