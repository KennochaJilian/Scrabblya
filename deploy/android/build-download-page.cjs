const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repository=path.resolve(__dirname,'../..');
function build({apk,output,versionCode,now=new Date()}){
 const config=JSON.parse(fs.readFileSync(path.join(repository,'mobile/app.json'),'utf8')).expo;
 if(!/^[1-9]\d*$/.test(String(versionCode))||Number(versionCode)>2100000000)throw Error('versionCode invalide.');
 if(!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(config.version))throw Error('Version invalide.');
 const bytes=fs.readFileSync(apk);if(bytes.length<4||bytes.subarray(0,4).toString('hex')!=='504b0304')throw Error('Le fichier ne ressemble pas à une APK ZIP.');
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const filename='scrabblya-'+config.version+'-'+versionCode+'.apk';
 const meta={version:config.version,versionCode:Number(versionCode),packageName:config.android.package,publishedAt:now.toISOString(),filename,sizeBytes:bytes.length,sha256};
 fs.mkdirSync(output,{recursive:true});
 const values={VERSION:meta.version,BUILD:String(meta.versionCode),DATE:new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'Europe/Paris'}).format(now),SIZE:new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(bytes.length/1048576)+' Mo',SHA256:sha256,APK_URL:'/telecharger/apk/'+filename};
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let html=fs.readFileSync(path.join(repository,'deploy/download/index.template.html'),'utf8').replace(/{{([A-Z0-9_]+)}}/g,(_,key)=>{if(!(key in values))throw Error('Champ inconnu : '+key);return escape(values[key]);});
 fs.writeFileSync(path.join(output,'index.html'),html);
 fs.copyFileSync(path.join(repository,'deploy/download/styles.css'),path.join(output,'styles.css'));
 fs.copyFileSync(path.join(repository,'mobile/assets/scrabblya-icon.png'),path.join(output,'icon.png'));
 fs.copyFileSync(apk,path.join(output,filename));
 fs.writeFileSync(path.join(output,'release.json'),JSON.stringify(meta,null,2)+'\n');
 fs.writeFileSync(path.join(output,filename+'.sha256'),sha256+'  '+filename+'\n');
 return meta;
}
module.exports={build};if(require.main===module){const [apk,output,versionCode]=process.argv.slice(2);if(!apk||!output||!versionCode)throw Error('Usage: node build-download-page.cjs app.apk output versionCode');console.log(JSON.stringify(build({apk,output,versionCode})));}
