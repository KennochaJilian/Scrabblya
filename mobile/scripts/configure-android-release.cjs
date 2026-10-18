const fs=require('node:fs'),path=require('node:path');
function configure(root=path.resolve(__dirname,'..'),env=process.env){
 for(const name of ['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'])if(!env[name]||env[name].startsWith('$('))throw Error('Variable de signature absente : '+name);
 if(!path.isAbsolute(env.ANDROID_KEYSTORE_FILE)||!fs.statSync(env.ANDROID_KEYSTORE_FILE).isFile())throw Error('Keystore inaccessible.');
 const file=path.join(root,'android/app/build.gradle');
 let source=fs.readFileSync(file,'utf8');
 if(!source.includes('android-signing.gradle')){source+='\napply from: new File(rootProject.projectDir, "../scripts/android-signing.gradle")\n';fs.writeFileSync(file,source);}
 console.log('Signature release configurée depuis les variables sécurisées.');
}
module.exports={configure};if(require.main===module)configure();
