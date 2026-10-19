const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),Renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__DEV__=false;const {act}=Renderer;
function harness(role){
 let user={id:'alice',name:'Alice',role,avatarUrl:null,email:'alice@example.test'};
 const source=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const native=Object.fromEntries(['ActivityIndicator','Image','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'].map(key=>[key,key]));native.StyleSheet={create:s=>s};native.Platform={OS:'android'};native.useWindowDimensions=()=>({width:375,height:800});
 let back;native.BackHandler={addEventListener(_event,handler){back=handler;return {remove(){back=null;}};}};
 const uploads=[];const people=[{id:'bob',name:'Bob',role:'user',avatarUrl:null}];
 const api={async users(){return people;}};
 const mocks={'react-native':native,'expo-status-bar':{StatusBar:()=>null},'expo-image-picker':{async launchImageLibraryAsync(){return {canceled:false,assets:[{uri:'file://avatar.png'}]};}},'@expo/vector-icons/Ionicons':'Icon','./src/AuthContext':{AuthProvider:({children})=>children,useAuth:()=>({user,loading:false,error:'',retry(){}})},'./src/api':{api,realtime:{subscribe(){return ()=>{};}},async uploadAvatar(uri,id){uploads.push({uri,id});return {...people[0],avatarUrl:'https://avatar.test/new'};}},'./src/UserAvatar':{UserAvatar:'Avatar'},'./src/LocalGame':{LocalGame:'LocalGame'},'./src/OnlineGame':{OnlineGame:'OnlineGame'},'./src/GameLobby':{GameLobby:'GameLobby'}};
 const mod={exports:{}};
 const req=id=>Object.hasOwn(mocks,id)?mocks[id]:id.endsWith('.png')?id:require(id);
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(req,mod,mod.exports);
 return {App:mod.exports.default,back:()=>back(),uploads,setRole(role){user={...user,role};}};
}
test('ordinary users cannot enter local mode even if its navigation callback is invoked',async()=>{
 const {App}=harness('user');let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(App));});
 await act(async()=>rendered.root.findByType('GameLobby').props.onPractice());
 assert.equal(rendered.root.findAllByType('LocalGame').length,0);
 await act(async()=>rendered.root.findByType('GameLobby').props.onOpen('online-game'));
 assert.equal(rendered.root.findAllByType('OnlineGame').length,1);
 await act(async()=>rendered.unmount());
});
test('admins can open local mode but lose access if their role changes',async()=>{
 const {App,setRole}=harness('admin');let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(App));});
 await act(async()=>rendered.root.findByType('GameLobby').props.onPractice());
 assert.equal(rendered.root.findAllByType('LocalGame').length,1);
 setRole('user');await act(async()=>rendered.update(React.createElement(App)));
 assert.equal(rendered.root.findAllByType('LocalGame').length,0);
 await act(async()=>rendered.unmount());
});

test('Android back follows admin to profile to admin to home, then lets Android exit',async()=>{
 const {App,back}=harness('admin');let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(App));});
 const button=title=>rendered.root.findAllByType('Pressable').find(p=>p.findAllByType('Text').some(t=>t.props.children===title));
 await act(async()=>button('Gestion des utilisateurs').props.onPress());
 assert.equal(rendered.root.findAllByProps({accessibilityLabel:'Nom du nouvel utilisateur'}).length,1);
 await act(async()=>rendered.root.findByProps({accessibilityLabel:'Mon profil'}).props.onPress());
 assert.equal(rendered.root.findAllByProps({accessibilityLabel:'Nom du profil'}).length,1);
 await act(async()=>assert.equal(back(),true));
 assert.equal(rendered.root.findAllByProps({accessibilityLabel:'Nom du nouvel utilisateur'}).length,1);
 await act(async()=>assert.equal(back(),true));
 assert.equal(rendered.root.findAllByType('GameLobby').length,1);
 assert.equal(back(),false);
 await act(async()=>rendered.root.findByType('GameLobby').props.onOpen('game-id'));
 await act(async()=>assert.equal(back(),true));
 assert.equal(rendered.root.findAllByType('GameLobby').length,1);
 await act(async()=>rendered.unmount());
});
test('admin avatar action uploads to the selected player and updates their preview',async()=>{
 const {App,uploads}=harness('admin');let rendered;
 await act(async()=>{rendered=Renderer.create(React.createElement(App));});
 const manage=rendered.root.findAllByType('Pressable').find(p=>p.findAllByType('Text').some(t=>t.props.children==='Gestion des utilisateurs'));
 await act(async()=>manage.props.onPress());
 await act(async()=>rendered.root.findByProps({accessibilityLabel:'Modifier l’avatar de Bob'}).props.onPress());
 assert.deepEqual(uploads,[{uri:'file://avatar.png',id:'bob'}]);
 assert.equal(rendered.root.findAllByType('Avatar').some(a=>a.props.name==='Bob'&&a.props.avatarUrl==='https://avatar.test/new'),true);
 await act(async()=>rendered.unmount());
});
