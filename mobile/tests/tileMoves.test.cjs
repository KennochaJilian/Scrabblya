const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {rackSlotAtPoint,reorderRack,relocateDraft}=load('src/tileMoves.ts');
const bounds={x:18,y:500,width:350,height:71};
test('rack target follows measured geometry including outer padding',()=>{
 assert.equal(rackSlotAtPoint(18,520,bounds,7),0);
 assert.equal(rackSlotAtPoint(367,520,bounds,7),6);
 assert.equal(rackSlotAtPoint(190,520,bounds,7),3);
 for(const [x,y] of [[17,520],[368,520],[100,499],[100,571]])assert.equal(rackSlotAtPoint(x,y,bounds,7),null);
 assert.equal(rackSlotAtPoint(100,520,null,7),null);
});
test('rack reorder inserts a tile and shifts neighbors without changing tile identity',()=>{
 const before=[0,1,2,3,4,5,6];
 const after=reorderRack(before,1,5,7);
 assert.deepEqual(after,[0,2,3,4,5,1,6]);
 assert.deepEqual(before,[0,1,2,3,4,5,6]);
 assert.deepEqual(reorderRack(after,1,0,7),[1,0,2,3,4,5,6]);
});
test('reordering a shorter shuffled rack preserves hidden indices for future draws',()=>{
 assert.deepEqual(reorderRack([6,2,0,4,1,5,3],0,2,3),[2,1,0,6,4,5,3]);
});
test('moving a draft tile preserves its rack index and assigned joker letter',()=>{
 const draft=[{cell:112,rackIndex:3,letter:'Z'},{cell:113,rackIndex:1,letter:'A'}];
 const after=relocateDraft(draft,3,127,false);
 assert.deepEqual(after,[{cell:127,rackIndex:3,letter:'Z'},{cell:113,rackIndex:1,letter:'A'}]);
 assert.equal(draft[0].cell,112);
});
test('occupied board and other draft tiles reject relocation without losing the original',()=>{
 const draft=[{cell:112,rackIndex:3,letter:'Z'},{cell:113,rackIndex:1,letter:'A'}];
 assert.equal(relocateDraft(draft,3,113,false),draft);
 assert.equal(relocateDraft(draft,3,127,true),draft);
 assert.deepEqual(relocateDraft(draft,3,112,false),draft);
});
test('rack insertion does not change the rack indices referenced by pending placements',()=>{
 const draft=[{cell:112,rackIndex:3,letter:'A'}],order=[0,1,2,3,4,5,6];
 const after=reorderRack(order,3,0,7);
 assert.equal(after[0],3);assert.equal(draft[0].rackIndex,3);
});

test('square wooden rack uses centered fixed slots even with fewer tiles',()=>{
 const bounds={x:0,y:100,width:372,height:56},size=(372-32)/7;
 const left=(bounds.width-3*size-8)/2;
 assert.equal(rackSlotAtPoint(left+size/2,120,bounds,3,size),0);
 assert.equal(rackSlotAtPoint(left+size+4+size/2,120,bounds,3,size),1);
 assert.equal(rackSlotAtPoint(left+2*(size+4)+size/2,120,bounds,3,size),2);
});
