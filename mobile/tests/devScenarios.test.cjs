const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createDevScenario}=load('src/devScenarios.ts'),{lexicon}=load('src/lexicon.ts');
const {evaluateMove,playMove}=load('src/engine.ts'),{distribution}=load('src/board.ts');
for(const [scenario,scores] of [['tie',[200,200]],['player1-wins',[240,200]],['player2-wins',[200,240]]]){
 test('developer ending '+scenario+' uses the real pass/remainder calculation',()=>{
  const {game,draft}=createDevScenario(scenario,lexicon);
  assert.equal(game.status,'finished');assert.equal(game.endReason,'passes');assert.equal(game.history.length,6);
  assert.deepEqual(game.players.map(p=>p.score),scores);assert.equal(draft.length,0);
 });
}
test('Scrabble rack fixture preserves all 102 physical letters',()=>{
 const {game,draft}=createDevScenario('scrabble-rack',lexicon),counts={};
 assert.equal(game.players[0].rack.join(''),'MAISONS');assert.equal(draft.length,0);
 for(const letter of [...game.bag,...game.players.flatMap(p=>p.rack)])counts[letter]=(counts[letter]||0)+1;
 assert.deepEqual(counts,distribution);
});
test('ready Scrabble awards 66 points including 50 bonus through production engine',()=>{
 const {game,draft}=createDevScenario('scrabble-ready',lexicon);
 const result=evaluateMove(game,draft,lexicon);assert.equal(draft.length,7);assert.equal(result.words[0].word,'MAISONS');
 assert.equal(result.words[0].score,16);assert.equal(result.score,66);
 const next=playMove(game,draft,lexicon);assert.equal(next.players[0].score,66);assert.equal(next.players[0].rack.length,7);assert.equal(next.bag.length,81);
 assert.equal(game.players[0].score,0);assert.equal(game.board.filter(Boolean).length,0);
});
