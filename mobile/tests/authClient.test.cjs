const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {ApiClient,ApiError}=load('src/apiClient.ts');
const user={id:'alice',name:'Alice',role:'user',avatarUrl:null,email:'alice@example.test'};
const session=(overrides={})=>({accessToken:'access',refreshToken:'refresh',expiresAt:Math.floor(Date.now()/1000)+3600,user,...overrides});
function memory(initial=null){let token=initial;return {writes:[],get token(){return token;},async getItemAsync(){return token;},async setItemAsync(key,value){this.writes.push([key,value]);token=value;},async deleteItemAsync(){token=null;}};}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('login stores only refresh token and attaches bearer token to protected requests',async()=>{
 const storage=memory(),calls=[];
 const client=new ApiClient('https://api.test/api',storage,async(url,opts)=>{calls.push([url,opts]);return url.endsWith('/auth/login')?json(session()):json({users:[user]});});
 await client.login(' alice@example.test ','secret-password');assert.equal(storage.token,'refresh');assert.equal(storage.writes[0][1].includes('password'),false);
 assert.equal((await client.users())[0].name,'Alice');assert.equal(calls[1][1].headers.Authorization,'Bearer access');
 assert.equal(JSON.parse(calls[0][1].body).email,'alice@example.test');
});
test('concurrent protected calls refresh an expiring session once',async()=>{
 const storage=memory();let refreshes=0;
 const client=new ApiClient('https://api.test',storage,async url=>{
  if(url.endsWith('/auth/login'))return json(session({expiresAt:1}));
  if(url.endsWith('/auth/refresh')){refreshes++;await new Promise(r=>setTimeout(r,5));return json(session({accessToken:'new',refreshToken:'new-refresh'}));}
  return json({users:[user]});
 });
 await client.login('alice@example.test','password');await Promise.all([client.users(),client.users()]);assert.equal(refreshes,1);assert.equal(storage.token,'new-refresh');
});
test('network failure preserves saved session; revoked refresh token clears it',async()=>{
 const storage=memory('saved-refresh');
 let client=new ApiClient('https://api.test',storage,async()=>{throw Error('offline');});
 await assert.rejects(()=>client.restore(),ApiError);assert.equal(storage.token,'saved-refresh');
 client=new ApiClient('https://api.test',storage,async()=>json({error:'Expired'},401));await assert.rejects(()=>client.restore(),ApiError);assert.equal(storage.token,null);
});
test('401 response renews session and retries protected request once',async()=>{
 const storage=memory();let userCalls=0,refreshes=0;
 const client=new ApiClient('https://api.test',storage,async url=>{
  if(url.endsWith('/auth/login'))return json(session());if(url.endsWith('/auth/refresh')){refreshes++;return json(session({accessToken:'new'}));}
  return ++userCalls===1?json({error:'Expired'},401):json({users:[user]});
 });
 await client.login('alice@example.test','password');await client.users();assert.equal(refreshes,1);assert.equal(userCalls,2);
});
test('logout clears secure storage even if server is unreachable',async()=>{
 const storage=memory();const client=new ApiClient('https://api.test',storage,async url=>{if(url.endsWith('/auth/login'))return json(session());throw Error('offline');});
 let current;client.onUserChanged=u=>current=u;
 await client.login('alice@example.test','password');await assert.rejects(()=>client.logout());assert.equal(storage.token,null);assert.equal(current,null);
});
test('missing API configuration gives an actionable error',async()=>{
 const client=new ApiClient('',memory());await assert.rejects(()=>client.login('a@example.test','password'),/EXPO_PUBLIC_API_URL/);
});

test('late refresh cannot restore a session after logout',async()=>{
 const storage=memory();let finishRefresh;
 const client=new ApiClient('https://api.test',storage,async url=>{
  if(url.endsWith('/auth/login'))return json(session({expiresAt:1}));
  if(url.endsWith('/auth/refresh'))return new Promise(resolve=>finishRefresh=()=>resolve(json(session({refreshToken:'late-token'}))));
  return new Response(null,{status:204});
 });
 await client.login('alice@example.test','password');
 const request=client.users();const rejected=assert.rejects(()=>request,ApiError);
 await new Promise(r=>setTimeout(r,0));await client.logout();finishRefresh();await rejected;
 assert.equal(storage.token,null);
});


test('avatar upload preserves multipart boundary and updates the authenticated profile',async()=>{
 const updated={...user,avatarUrl:'https://storage.test/signed-avatar'};let received,current;
 const client=new ApiClient('https://api.test/api',memory(),async(url,options)=>{
  if(url.endsWith('/auth/login'))return json(session());
  received={url,options};return json(updated);
 });
 client.onUserChanged=value=>current=value;
 await client.login('alice@example.test','password');
 const form=new FormData();form.append('avatar',new Blob(['image'],{type:'image/png'}),'avatar.png');
 await client.uploadAvatar(form);
 assert.equal(received.url,'https://api.test/api/me/avatar');
 assert.equal(received.options.body,form);
 assert.equal(received.options.headers.Authorization,'Bearer access');
 assert.equal(received.options.headers['Content-Type'],undefined);
 assert.equal(current.avatarUrl,updated.avatarUrl);
});
