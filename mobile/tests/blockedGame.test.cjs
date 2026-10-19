const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createGame,evaluateMove,hasLegalMove,finishIfBlocked}=load('src/engine.ts');
function dictionary(words){return {id:'search-test',has:word=>words.includes(word),entries:()=>words};}
function game(){const g=createGame(['Alice','Bob'],'search-test',()=>.4);g.bag=[];g.players.forEach(p=>p.rack=['Q']);return g;}
const tile=letter=>({letter,blank:false});
test('blocked end deducts rack values once and leaves the original game intact',()=>{
 const g=game(),lex=dictionary(['AT']);g.players[1].rack=['Z'];g.players[0].score=50;g.players[1].score=40;
 const before=JSON.stringify(g),finished=finishIfBlocked(g,lex);
 assert.equal(finished.endReason,'blocked');assert.equal(finished.status,'finished');
 assert.deepEqual(finished.players.map(p=>p.score),[42,30]);assert.equal(JSON.stringify(g),before);
 assert.equal(finishIfBlocked(finished,lex),finished);
});
test('either player or a joker can keep a game playable, including a one-tile crossing hook',()=>{
 const lex=dictionary(['AT']);const g=game();g.players[1].rack=['A','?'];
 assert.equal(finishIfBlocked(g,lex),g);
 g.board[112]=tile('A');g.players[1].rack=['T'];assert.equal(hasLegalMove(g,['T'],lex),true);
 assert.equal(hasLegalMove(g,['?'],lex),true);assert.equal(hasLegalMove(g,['Q'],lex),false);
});
test('bag can rescue via legal exchanges, but cannot combine the opponents racks',()=>{
 const lex=dictionary(['AT']);const g=game();g.players[0].rack=['A'];g.players[1].rack=['T'];
 assert.equal(finishIfBlocked(g,lex).status,'finished');
 g.bag=Array(7).fill('Q');assert.equal(finishIfBlocked(g,lex),g,'repeated exchanges may transfer A between the racks via the bag');
 g.bag=['T','Q','Q','Q','Q','Q','Q'];assert.equal(finishIfBlocked(g,lex),g);
 g.bag=['T'];assert.equal(finishIfBlocked(g,lex).status,'finished');
 g.bag=Array(7).fill('Q');g.players[0].rack=['Q'];g.players[1].rack=['Q'];assert.equal(finishIfBlocked(g,lex).status,'finished');
});
test('search respects tile multiplicities and the maximum seven newly placed letters',()=>{
 const g=game();assert.equal(hasLegalMove(g,['A','T'],dictionary(['AA'])),false);
 assert.equal(hasLegalMove(g,['A','?'],dictionary(['AA'])),true);
 assert.equal(hasLegalMove(g,[...'ABCDEFGH'],dictionary(['ABCDEFGH'])),false);
 g.board[112]=tile('A');assert.equal(hasLegalMove(g,[...'BCDEFGH'],dictionary(['ABCDEFGH'])),true);
});
// Independent oracle enumerates complete dictionary words and asks the existing
// move validator to check each placement, including all perpendicular words.
function oracle(g,rack,lex){
 for(const word of lex.entries())for(const delta of [1,15])for(let start=0;start<225;start++){
  const cells=[...word].map((_,i)=>start+i*delta);if(cells.at(-1)>=225||delta===1&&Math.floor(start/15)!==Math.floor(cells.at(-1)/15))continue;
  const available=[...rack],placements=[];let bad=false;
  for(let i=0;i<cells.length;i++){
   const cell=cells[i],letter=word[i];if(g.board[cell]){if(g.board[cell].letter!==letter){bad=true;break;}continue;}
   let rackIndex=available.indexOf(letter);if(rackIndex<0)rackIndex=available.indexOf('?');if(rackIndex<0){bad=true;break;}
   available[rackIndex]='!';placements.push({cell,rackIndex,letter});
  }
  if(bad||!placements.length)continue;
  try{evaluateMove({...g,current:0,players:[{...g.players[0],rack},g.players[1]]},placements,lex);return true;}catch{}
 }
 return false;
}
test('prefix search agrees with legal-move validation across crossings, edges and blank racks',()=>{
 const lex=dictionary(['AT','TA','AA','CAT','ACT','CA','TAC','TATA']);
 const boards=[[],[[112,'A']],[[112,'A'],[113,'T']],[[0,'C'],[1,'A'],[2,'T']],[[97,'C'],[112,'A'],[127,'T']],[[111,'A'],[113,'A'],[97,'T'],[127,'T']],[[224,'A']]];
 const racks=['Q','A','T','C','AT','CA','AA','CT','?','?T','??'];
 for(const board of boards)for(const letters of racks){const g=game();for(const [cell,letter] of board)g.board[cell]=tile(letter);
  assert.equal(hasLegalMove(g,[...letters],lex),oracle(g,[...letters],lex),JSON.stringify({board,letters}));
 }
});
