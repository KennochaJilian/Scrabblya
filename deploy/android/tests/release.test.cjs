const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {build}=require('../build-download-page.cjs');
const repository=path.resolve(__dirname,'../../..');
const {configure}=require(path.join(repository,'mobile/scripts/configure-android-release.cjs'));
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'scrabblya-release-test-'));const apk=path.join(root,'input.apk');fs.writeFileSync(apk,Buffer.concat([Buffer.from('504b0304','hex'),Buffer.from('APK test fixture')]));return {root,apk,cleanup(){fs.rmSync(root,{recursive:true,force:true});}};}
function artifact(f,code){const output=path.join(f.root,'build-'+code);const meta=build({apk:f.apk,output,versionCode:code,now:new Date('2026-10-18T12:00:00Z')});return {output,meta};}
test('release artifact links to its immutable APK and contains its real digest',()=>{
 const f=fixture();try{const {output,meta}=artifact(f,42);assert.equal(meta.versionCode,42);assert.equal(meta.packageName,'com.scrabblya.app');const html=fs.readFileSync(path.join(output,'index.html'),'utf8');assert(html.includes('/telecharger/apk/'+meta.filename));assert(html.includes(meta.sha256));assert(!html.includes('{{'));assert.equal(fs.readFileSync(path.join(output,meta.filename)).length,meta.sizeBytes);}finally{f.cleanup();}
});
test('invalid version codes and non-APK inputs fail before publication',()=>{
 const f=fixture();try{for(const versionCode of [0,-1,'1/../../x','NaN',2100000001])assert.throws(()=>build({apk:f.apk,output:path.join(f.root,'bad'),versionCode}));fs.writeFileSync(f.apk,'not an apk');assert.throws(()=>artifact(f,1),/APK ZIP/);}finally{f.cleanup();}
});
test('signing preparation requires every secret and never embeds their values',()=>{
 const f=fixture();try{const native=path.join(f.root,'android/app');fs.mkdirSync(native,{recursive:true});fs.writeFileSync(path.join(native,'build.gradle'),'android {}');const env={ANDROID_KEYSTORE_FILE:f.apk,ANDROID_KEYSTORE_PASSWORD:'private-store-pass',ANDROID_KEY_ALIAS:'scrabblya',ANDROID_KEY_PASSWORD:'private-key-pass'};for(const name of Object.keys(env)){const missing={...env};delete missing[name];assert.throws(()=>configure(f.root,missing));}configure(f.root,env);configure(f.root,env);const gradle=fs.readFileSync(path.join(native,'build.gradle'),'utf8');assert.equal(gradle.match(/apply from/g).length,1);assert(!gradle.includes('private-store-pass'));assert(!gradle.includes('private-key-pass'));}finally{f.cleanup();}
});
test('Android versionCode follows CI and rejects malformed values',()=>{
 const config=require(path.join(repository,'mobile/app.config.js')),previous=process.env.ANDROID_VERSION_CODE;
 try{process.env.ANDROID_VERSION_CODE='123';assert.equal(config({config:{android:{package:'com.scrabblya.app'}}}).android.versionCode,123);process.env.ANDROID_VERSION_CODE='bad';assert.throws(()=>config({config:{}}));}finally{if(previous===undefined)delete process.env.ANDROID_VERSION_CODE;else process.env.ANDROID_VERSION_CODE=previous;}
});
test('publication switches the page, retains old APKs and rejects downgrades or corrupt files',{skip:process.platform==='win32'},()=>{
 const f=fixture();try{
  const root=path.join(f.root,'public');fs.mkdirSync(root);const script=path.join(repository,'deploy/android/publish-download.sh');
  const publish=output=>spawnSync('bash',[script,output,root],{encoding:'utf8'});
  const first=artifact(f,40),second=artifact(f,41);
  let result=publish(first.output);assert.equal(result.status,0,result.stderr);assert.equal(fs.readlinkSync(path.join(root,'current')),'releases/40');
  result=publish(second.output);assert.equal(result.status,0,result.stderr);assert.equal(fs.readlinkSync(path.join(root,'current')),'releases/41');assert(fs.existsSync(path.join(root,'apks',first.meta.filename)));
  assert.notEqual(publish(first.output).status,0);assert.equal(fs.readlinkSync(path.join(root,'current')),'releases/41');
  const third=artifact(f,42);fs.appendFileSync(path.join(third.output,third.meta.filename),'corrupted');assert.notEqual(publish(third.output).status,0);assert.equal(fs.readlinkSync(path.join(root,'current')),'releases/41');
 }finally{f.cleanup();}
});
