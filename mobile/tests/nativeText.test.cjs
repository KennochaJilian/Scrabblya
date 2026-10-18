const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
test('game screen emits no raw text children outside native Text',()=>{
 for(const name of ['LocalGame.tsx','DraggableTile.tsx','TileFace.tsx','UserAvatar.tsx','../App.tsx']){
 const file=path.join(__dirname,'../src',name);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const ast=ts.createSourceFile('game.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const failures=[];let checked=0;
 function checkChild(child,tag){
  if(ts.isStringLiteral(child)||ts.isNumericLiteral(child))failures.push(tag+': '+JSON.stringify(child.text));
  if(ts.isArrayLiteralExpression(child))child.elements.forEach(c=>checkChild(c,tag));
 }
 function visit(node){
  if(ts.isCallExpression(node)&&node.arguments.length>=2&&/\.jsxs?\)/.test(node.expression.getText(ast))){
   checked++;const tag=node.arguments[0].getText(ast),props=node.arguments[1];
   if(!/(^|\.)Text$/.test(tag)&&ts.isObjectLiteralExpression(props)){
    for(const property of props.properties)if(ts.isPropertyAssignment(property)&&property.name.getText(ast)==='children')checkChild(property.initializer,tag);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);assert.ok(checked>(name==='LocalGame.tsx'?20:0),'JSX calls must actually be inspected: '+name);assert.deepEqual(failures,[],'Raw text emitted outside Text: '+failures.join('; '));
}
});
