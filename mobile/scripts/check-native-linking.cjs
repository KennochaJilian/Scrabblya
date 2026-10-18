const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function validate(config){
 if(!Array.isArray(config.modules))throw Error('Configuration d’autolinking Expo invalide.');
 const problems=[];
 for(const module of config.modules)for(const project of module.projects??[]){
  if(project.publication)for(const key of ['groupId','artifactId','version','repository'])if(typeof project.publication[key]!=='string'||!project.publication[key].trim())problems.push(module.packageName+'@'+module.packageVersion+' : publication.'+key+' manquant');
 }
 if(problems.length)throw Error('Métadonnées natives Expo incompatibles :\n'+problems.join('\n'));
 return config.modules.length;
}
module.exports={validate};
if(require.main===module){
 const packageFile=require.resolve('expo-modules-autolinking/package.json');
 const metadata=JSON.parse(fs.readFileSync(packageFile,'utf8'));
 const bin=typeof metadata.bin==='string'?metadata.bin:metadata.bin['expo-modules-autolinking'];
 const data=execFileSync(process.execPath,[path.resolve(path.dirname(packageFile),bin),'resolve','--platform','android','--json'],{encoding:'utf8',cwd:path.resolve(__dirname,'..'),maxBuffer:10*1024*1024});
 console.log('Autolinking Android vérifié : '+validate(JSON.parse(data))+' modules, publications complètes.');
}
