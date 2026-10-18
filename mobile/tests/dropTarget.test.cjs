const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpile(fs.readFileSync(require('node:path').join(__dirname, '../src/dropTarget.ts'), 'utf8'), {module: ts.ModuleKind.CommonJS}), {exports: exportsObject});
const {cellAtPoint} = exportsObject;
const bounds = {x: 18, y: 140, width: 300, height: 300};
test('drop coordinates respect board offset and first/last cells', () => {
 assert.equal(cellAtPoint(18, 140, bounds), 0);
 assert.equal(cellAtPoint(317.9, 439.9, bounds), 224);
 assert.equal(cellAtPoint(168, 290, bounds), 112);
 assert.equal(cellAtPoint(38, 160, bounds), 16);
});
test('drops outside each edge do not wrap into the next row', () => {
 for(const [x,y] of [[17,200],[318,200],[100,139],[100,440]]) assert.equal(cellAtPoint(x,y,bounds),null);
});
test('scrolling changes the measured target origin', () => {
 assert.equal(cellAtPoint(168,190,{...bounds,y:40}),112);
});
test('unmeasured and zero-sized boards reject drops', () => {
 assert.equal(cellAtPoint(0,0,null),null);
 assert.equal(cellAtPoint(18,140,{...bounds,width:0}),null);
});
