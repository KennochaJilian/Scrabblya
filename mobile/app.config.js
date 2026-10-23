module.exports=({config})=>{
 const fs=require('node:fs'),path=require('node:path');
 const googleServices=process.env.GOOGLE_SERVICES_FILE||path.join(__dirname,'google-services.json');
 if(fs.existsSync(googleServices)){const data=JSON.parse(fs.readFileSync(googleServices,'utf8'));if(config.android?.package&&!data.client?.some(c=>c.client_info?.android_client_info?.package_name===config.android?.package))throw Error('google-services.json ne correspond pas au package Android.');}
 else if(process.env.SCRABBLYA_REQUIRE_PUSH==='1')throw Error('Placez google-services.json dans mobile/ avant de compiler.');
 const value=process.env.ANDROID_VERSION_CODE??config.android?.versionCode??1;
 if(!/^[1-9]\d*$/.test(String(value))||Number(value)>2100000000)throw new Error('ANDROID_VERSION_CODE doit être un entier entre 1 et 2100000000.');
 return {...config,android:{...config.android,...(fs.existsSync(googleServices)?{googleServicesFile:googleServices}:{}),versionCode:Number(value)}};
};
