const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),Renderer=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;const {act}=Renderer;
function fixture(){
 let responseListener,handler,lastResponse=null;const calls=[],opened=[],storage=new Map();
 const notifications={AndroidImportance:{HIGH:4},setNotificationHandler(value){handler=value;},async setNotificationChannelAsync(){},async getPermissionsAsync(){return {granted:true,status:'granted'};},async requestPermissionsAsync(){return {granted:true,status:'granted'};},async getDevicePushTokenAsync(){return {data:'fcm-token'};},async unregisterForNotificationsAsync(){calls.push(['revoke']);},addPushTokenListener(){return {remove(){}};},addNotificationResponseReceivedListener(fn){responseListener=fn;return {remove(){responseListener=null;}};},async getLastNotificationResponseAsync(){return lastResponse;},async clearLastNotificationResponseAsync(){lastResponse=null;}};
 const mocks={'react-native':{Platform:{OS:'android'},AppState:{addEventListener(){return {remove(){}};}}},'expo-constants':{default:{executionEnvironment:'standalone'},ExecutionEnvironment:{StoreClient:'storeClient'},__esModule:true},'expo-device':{isDevice:true},'expo-notifications':notifications,'expo-secure-store':{async getItemAsync(key){return storage.get(key)||null;},async setItemAsync(key,value){storage.set(key,value);}},'./api':{api:{bindPushDevice(id){calls.push(['bind',id]);},async registerPushDevice(id,token){calls.push(['register',id,token]);},async unregisterPushDevice(id){calls.push(['unregister',id]);}}},'./pushRegistration':require('./load-ts.cjs')('src/pushRegistration.ts'),'./onlineTypes':{commandId:()=> '10000000-0000-4000-8000-000000000001'}};
 const mod={exports:{}},source=fs.readFileSync(path.join(__dirname,'../src/usePushNotifications.ts'),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(id=>mocks[id]??require(id),mod,mod.exports);
 function App({userId,gameId=null}){const state=mod.exports.usePushNotifications(userId,true,gameId,id=>opened.push(id));return React.createElement('State',{state});}
 return {App,calls,opened,event(value){lastResponse=value;responseListener?.(value);},setCold(value){lastResponse=value;},handler:()=>handler};
}
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',game='20000000-0000-4000-8000-000000000001';
function response(userId,id='notification'){return {notification:{request:{identifier:id,content:{data:{}},trigger:{type:'push',remoteMessage:{data:{body:JSON.stringify({gameId:game,userId})}}}}}};}
test('notification tap opens only the recipient game and foreground display is suppressed for that open game',async()=>{
 const f=fixture();let rendered;await act(async()=>{rendered=Renderer.create(React.createElement(f.App,{userId:a,gameId:game}));});
 await act(async()=>f.event(response(a)));assert.deepEqual(f.opened,[game]);
 await act(async()=>f.event(response(b,'other-account')));assert.equal(f.opened.length,1);
 assert.equal((await f.handler().handleNotification(response(a).notification)).shouldShowBanner,false);
 await act(async()=>rendered.update(React.createElement(f.App,{userId:a})));
 assert.equal((await f.handler().handleNotification(response(a).notification)).shouldShowBanner,true);
 const before=f.calls.filter(c=>c[0]==='revoke').length;await act(async()=>rendered.unmount());assert.equal(f.calls.filter(c=>c[0]==='revoke').length,before,'closing UI must retain push registration');
});
test('cold-start notification waits for login and account switch revokes the previous native registration',async()=>{
 const f=fixture();f.setCold(response(b));let rendered;await act(async()=>{rendered=Renderer.create(React.createElement(f.App,{userId:null}));});assert.equal(f.opened.length,0);
 await act(async()=>rendered.update(React.createElement(f.App,{userId:b})));assert.deepEqual(f.opened,[game]);
 await act(async()=>rendered.update(React.createElement(f.App,{userId:a})));assert.equal(f.calls.some(c=>c[0]==='revoke'),true);
 await act(async()=>rendered.unmount());
});
