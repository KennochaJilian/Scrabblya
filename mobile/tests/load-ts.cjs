const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();
function load(file){
 file=path.resolve(__dirname,'..',file);
 if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const localRequire=id=>{
  if(!id.startsWith('.'))return require(id);
  const target=path.resolve(path.dirname(file),id);
  return target.endsWith('.json')?JSON.parse(fs.readFileSync(target,'utf8')):load(target+'.ts');
 };
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})',{filename:file})(localRequire,mod,mod.exports);
 return mod.exports;
}
module.exports=load;
