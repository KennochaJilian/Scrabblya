const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),Renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;const {act}=Renderer;
function harness(role){
 let user={id:'alice',name:'Alice',role,avatarUrl:null,email:'alice@example.test'};
 const source=fs.readFileSync(path.join(__dirname,'../App.tsx'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const native=Object.fromEntries(['ActivityIndicator','Image','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'].map(key=>[key,key]));native.StyleSheet={create:s=>s};native.Platform={OS:'android'};native.useWindowDimensions=()=>({width:375,height:800});
 const api={async users(){return [];}};
 const mocks={'react-native':native,'expo-status-bar':{StatusBar:()=>null},'expo-image-picker':{},'@expo/vector-icons/Ionicons':'Icon','./src/AuthContext':{AuthProvider:({children})=>children,useAuth:()=>({user,loading:false,error:'',retry(){}})},'./src/api':{api},'./src/UserAvatar':{UserAvatar:'Avatar'},'./src/LocalGame':{LocalGame:'LocalGame'},'./src/OnlineGame':{OnlineGame:'OnlineGame'},'./src/GameLobby':{GameLobby:'GameLobby'}};
 const mod={exports:{}};
 const req=id=>Object.hasOwn(mocks,id)?mocks[id]:id.endsWith('.png')?id:require(id);
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(req,mod,mod.exports);
 return {App:mod.exports.default,setRole(role){user={...user,role};}};
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
