const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../scripts/check-native-linking.cjs');
const publication={groupId:'expo.modules',artifactId:'font',version:'57.0.4',repository:'local-maven-repo'};
const moduleConfig=p=>({modules:[{packageName:'expo-font',packageVersion:'57.0.4',projects:[{publication:p}]}]});
test('native linking accepts complete publications and source modules',()=>{
 assert.equal(validate(moduleConfig(publication)),1);assert.equal(validate(moduleConfig(undefined)),1);
});
test('native linking reports the module with missing publication metadata before Gradle',()=>{
 const missing={...publication};delete missing.version;
 assert.throws(()=>validate(moduleConfig(missing)),/expo-font@57.0.4.*publication.version/);
 assert.throws(()=>validate({}),/invalide/);
});
