module.exports=({config})=>{
 const value=process.env.ANDROID_VERSION_CODE??config.android?.versionCode??1;
 if(!/^[1-9]\d*$/.test(String(value))||Number(value)>2100000000)throw new Error('ANDROID_VERSION_CODE doit être un entier entre 1 et 2100000000.');
 return {...config,android:{...config.android,versionCode:Number(value)}};
};
