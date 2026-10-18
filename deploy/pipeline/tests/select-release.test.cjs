const test=require('node:test'),assert=require('node:assert/strict');
const {selectRelease}=require('../select-release.cjs');
for(const [message,scope,api,apk] of [
 ['[api] Correction de l’authentification','api',true,false],
 ['[apk] Nouveau logo','apk',false,true],
 ['[all] Nouvelle version','all',true,true],
 ['[API]fix','api',true,false],
 ['  [apk] ajustement','apk',false,true],
 ['Documentation uniquement','none',false,false],
 ['Documentation\n[all] dans le corps du message','none',false,false],
 ['[apix] mauvais préfixe','none',false,false],
 ['test ##vso[task.setvariable variable=apk]true','none',false,false],
])test('release scope: '+JSON.stringify(message),()=>assert.deepEqual(selectRelease(message),{scope,api,apk,any:scope!=='none'}));
test('manual target overrides the commit prefix',()=>{
 assert.equal(selectRelease('[api] test','apk').scope,'apk');
 assert.equal(selectRelease('Sans préfixe','all').scope,'all');
 assert.throws(()=>selectRelease('[all] test','unknown'));
});
test('APK does not depend on publishing the API image',()=>{
 const fs=require('node:fs'),path=require('node:path'),yaml=require('../../../mobile/node_modules/yaml');
 const pipeline=yaml.parse(fs.readFileSync(path.resolve(__dirname,'../../../azure-pipelines.yml'),'utf8'));
 const flatten=items=>items.flatMap(item=>item.stage?[item]:Object.values(item).flatMap(v=>Array.isArray(v)?flatten(v):[]));
 const stages=flatten(pipeline.stages),apk=stages.find(s=>s.stage==='android_release'),api=stages.find(s=>s.stage==='publish_api');
 assert.deepEqual(apk.dependsOn,['select_release','validate']);assert(api.condition.includes('scope.choose.api'));assert(apk.condition.includes('scope.choose.apk'));
});


test('Azure YAML has no unsupported anchors or aliases and explicitly triggers on main',()=>{
 const fs=require('node:fs'),path=require('node:path'),yaml=require('../../../mobile/node_modules/yaml');
 const document=yaml.parseDocument(fs.readFileSync(path.resolve(__dirname,'../../../azure-pipelines.yml'),'utf8'));
 assert.deepEqual(document.errors,[]);
 yaml.visit(document,(_key,node)=>{assert(!yaml.isAlias(node),'Azure does not support YAML aliases');assert(!node?.anchor,'Azure does not support YAML anchors');});
 const pipeline=document.toJS();assert.deepEqual(pipeline.trigger.branches.include,['main']);assert.equal(pipeline.pr,'none');
});
