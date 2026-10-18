const {execFileSync}=require('node:child_process');
function selectRelease(message,target='auto'){
 if(!['auto','api','apk','all'].includes(target))throw Error('Cible de publication inconnue.');
 const firstLine=String(message??'').split(/\r?\n/,1)[0].trimStart();
 const scope=target==='auto'?(firstLine.match(/^\[(api|apk|all)\]/i)?.[1].toLowerCase()??'none'):target;
 return {scope,api:scope==='api'||scope==='all',apk:scope==='apk'||scope==='all',any:scope!=='none'};
}
module.exports={selectRelease};
if(require.main===module){
 const message=execFileSync('git',['log','-1','--format=%B'],{encoding:'utf8'});
 const result=selectRelease(message,process.env.RELEASE_TARGET??'auto');
 console.log('Publication sélectionnée : '+result.scope);
 for(const name of ['api','apk','any'])console.log('##vso[task.setvariable variable='+name+';isOutput=true]'+result[name]);
 if(!result.any)console.log('Aucun préfixe [api], [apk] ou [all] en début de commit : aucune compilation ni publication.');
}
