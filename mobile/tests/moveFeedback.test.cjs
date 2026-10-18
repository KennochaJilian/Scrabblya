const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createGame}=load('src/engine.ts');
const {moveFeedback,cellsRectangle,draftOutlines}=load('src/moveFeedback.ts');
const {tilePosition,cellAtPoint}=load('src/dropTarget.ts');
const dictionary=(...words)=>({id:'test',has:word=>words.includes(word)});
function game(rack='CHATERS'){const g=createGame(['A','B'],'test',()=>.4);g.players[0].rack=rack.split('');return g;}
const put=(word,start,step=1)=>[...word].map((letter,rackIndex)=>({cell:start+rackIndex*step,rackIndex,letter}));
test('touch point stays at the same place on the tile, regardless of root insets',()=>{
 const grab={offsetX:7,offsetY:41,width:43,height:53};
 assert.deepEqual(tilePosition({x:127,y:345},{x:20,y:24},grab),{x:100,y:280});
 assert.deepEqual(tilePosition({x:167,y:245},{x:20,y:24},grab),{x:140,y:180});
});
test('ghost and board target agree after a scroll and nonzero root inset',()=>{
 const touch={x:181,y:320},root={x:10,y:24},grab={offsetX:9,offsetY:31,width:42,height:53};
 const ghost=tilePosition(touch,root,grab);
 const recovered={x:ghost.x+root.x+grab.offsetX,y:ghost.y+root.y+grab.offsetY};
 assert.deepEqual(recovered,touch);
 assert.equal(cellAtPoint(recovered.x,recovered.y,{x:31,y:170,width:300,height:300}),112);
});
test('outline includes existing letters when extending a word',()=>{
 const g=game('S');[...'CHAT'].forEach((letter,i)=>g.board[111+i]={letter,blank:false});
 const feedback=moveFeedback(g,put('S',115),dictionary('CHATS'));
 assert.equal(feedback.valid,true);assert.equal(feedback.score,10);
 assert.deepEqual(feedback.outlines[0],[111,112,113,114,115]);
 assert.deepEqual(cellsRectangle(feedback.outlines[0],20),{left:120,top:140,width:100,height:20});
});
test('vertical word frame spans rows without becoming a horizontal rectangle',()=>{
 const g=game();const feedback=moveFeedback(g,put('CHAT',97,15),dictionary('CHAT'));
 assert.equal(feedback.valid,true);
 assert.deepEqual(cellsRectangle(feedback.outlines[0],20),{left:140,top:120,width:20,height:80});
});
test('invalid dictionary word is red with zero awarded score and an explanation',()=>{
 const feedback=moveFeedback(game(),put('CHAT',111),dictionary('CHIEN'));
 assert.equal(feedback.valid,false);assert.equal(feedback.score,0);assert.match(feedback.reason,/CHAT/);
 assert.deepEqual(feedback.outlines[0],[111,112,113,114]);
});
test('cross-word failure invalidates the entire preview',()=>{
 const g=game('TE');g.board[97]={letter:'A',blank:false};
 const feedback=moveFeedback(g,put('TE',112),dictionary('TE'));
 assert.equal(feedback.valid,false);assert.equal(feedback.score,0);assert.match(feedback.reason,/AT/);
 assert.equal(feedback.outlines.length,2);
});
test('gapped invalid draft keeps a red frame covering the missing cell',()=>{
 const g=game('CT'),draft=[{cell:111,rackIndex:0,letter:'C'},{cell:113,rackIndex:1,letter:'T'}];
 const feedback=moveFeedback(g,draft,dictionary('CT'));
 assert.equal(feedback.valid,false);assert.match(feedback.reason,/vide/);
 assert.deepEqual(feedback.outlines[0],[111,112,113]);
});
test('first and last board cells and isolated drafts stay inside the board',()=>{
 const g=game('C');assert.deepEqual(draftOutlines(g,put('C',0)),[[0]]);
 assert.deepEqual(cellsRectangle([224],24),{left:336,top:336,width:24,height:24});
 assert.equal(moveFeedback(g,[],dictionary()),null);
});
