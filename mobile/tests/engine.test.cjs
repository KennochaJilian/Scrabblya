const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createGame,evaluateMove,playMove,passTurn,exchangeTiles}=load('src/engine.ts');
const {distribution}=load('src/board.ts');
const {lexicon}=load('src/lexicon.ts');
const dictionary=(...words)=>({id:'test',has:w=>words.includes(w)});
function fixture(rack='CHATERS'){const g=createGame(['Alice','Bob'],'test',()=>.4);g.players[0].rack=rack.split('');return g;}
const put=(word,start,indices=word.split('').map((_,i)=>i),step=1)=>word.split('').map((letter,i)=>({cell:start+i*step,rackIndex:indices[i],letter}));
const tile=letter=>({letter,blank:false});
test('102 tiles distributed once, 7 per player, no mutation on creation',()=>{
 const g=createGame(['A','B'],'test',()=>.3),counts={};
 for(const l of [...g.bag,...g.players.flatMap(p=>p.rack)])counts[l]=(counts[l]||0)+1;
 assert.deepEqual(counts,distribution);assert.equal(g.bag.length,88);assert.equal(g.players[0].rack.length,7);
});
test('first word covers center, scores double, refills rack and switches turn',()=>{
 const g=fixture(),before=JSON.stringify(g),n=playMove(g,put('CHAT',111),dictionary('CHAT'));
 assert.equal(n.players[0].score,18);assert.equal(n.players[0].rack.length,7);assert.equal(n.bag.length,84);assert.equal(n.current,1);assert.equal(n.history[0].words[0],'CHAT');assert.equal(JSON.stringify(g),before);
});
test('first word off center and one-letter opening rejected',()=>{
 assert.throws(()=>evaluateMove(fixture(),put('CHAT',0),dictionary('CHAT')),/centre/);
 assert.throws(()=>evaluateMove(fixture(),put('C',112),dictionary('C')),/deux lettres/);
});
test('vertical play supported and row wrapping prohibited',()=>{
 assert.equal(evaluateMove(fixture(),put('CHAT',97,undefined,15),dictionary('CHAT')).score,18);
 assert.throws(()=>evaluateMove(fixture(),put('CHAT',118),dictionary('CHAT')),/case vide|alignées|centre/);
});
test('rejects gaps, diagonal placement, duplicate rack slot and occupied cell',()=>{
 const g=fixture();
 assert.throws(()=>evaluateMove(g,[{cell:112,rackIndex:0,letter:'C'},{cell:114,rackIndex:1,letter:'H'}],dictionary('CH')),/vide/);
 assert.throws(()=>evaluateMove(g,[{cell:112,rackIndex:0,letter:'C'},{cell:128,rackIndex:1,letter:'H'}],dictionary('CH')),/alignées/);
 assert.throws(()=>evaluateMove(g,[{cell:112,rackIndex:0,letter:'C'},{cell:113,rackIndex:0,letter:'C'}],dictionary('CC')),/indisponible/);
 g.board[112]=tile('A');assert.throws(()=>evaluateMove(g,put('CHAT',111),dictionary('CHAT')),/occupée/);
});
test('rejects wrong letter, out-of-range rack and cell, invalid joker',()=>{
 const g=fixture();
 for(const p of [{cell:-1,rackIndex:0,letter:'C'},{cell:225,rackIndex:0,letter:'C'},{cell:112,rackIndex:-1,letter:'C'},{cell:112,rackIndex:0,letter:'Z'},{cell:112,rackIndex:0,letter:'É'}])assert.throws(()=>evaluateMove(g,[p],dictionary()));
});
test('disconnected word rejected, diagonal contact does not count',()=>{
 const g=fixture();g.board[96]=tile('A');
 assert.throws(()=>evaluateMove(g,put('CHAT',112),dictionary('CHAT')),/relié/);
});
test('all cross words validated and new double-word applies to both words',()=>{
 const g=fixture('TE');g.board[97]=tile('A');
 const r=evaluateMove(g,put('TE',112),dictionary('TE','AT'));
 assert.equal(r.score,8);assert.deepEqual(r.words.map(w=>w.word).sort(),['AT','TE']);
 assert.throws(()=>evaluateMove(g,put('TE',112),dictionary('TE')),/AT/);
});
test('one tile extends existing word and old bonuses are not applied twice',()=>{
 const g=fixture('S');for(const [i,l] of [...'CHAT'].entries())g.board[111+i]=tile(l);
 assert.equal(evaluateMove(g,put('S',115),dictionary('CHATS')).score,10);
});
test('new tiles can bridge existing letters in one continuous word',()=>{
 const g=fixture('CT');g.board[112]=tile('A');
 assert.equal(evaluateMove(g,[{cell:111,rackIndex:0,letter:'C'},{cell:113,rackIndex:1,letter:'T'}],dictionary('CAT')).score,5);
});
test('blank chosen letter scores zero now and in later words',()=>{
 const g=fixture('?HAT');const r=playMove(g,put('CHAT',111),dictionary('CHAT'));
 assert.equal(r.players[0].score,12);assert.equal(r.board[111].blank,true);
 r.players[1].rack=['S'];assert.equal(evaluateMove(r,put('S',115),dictionary('CHATS')).score,7);
});
test('double-letter and triple-letter multipliers apply only to new tiles',()=>{
 const g=fixture('AT');g.board[107]=tile('C');
 assert.equal(evaluateMove(g,put('AT',108),dictionary('CAT')).score,6);
 const h=fixture('AT');h.board[19]=tile('C');
 assert.equal(evaluateMove(h,put('AT',20),dictionary('CAT')).score,7);
});
test('multiple word multipliers stack and 7 played tiles award 50',()=>{
 const g=fixture('AAAAAAA');g.board[3]=tile('A');
 const ps=[0,1,2,4,5,6,7].map((cell,rackIndex)=>({cell,rackIndex,letter:'A'}));
 assert.equal(evaluateMove(g,ps,dictionary('AAAAAAAA')).score,122);
});
test('failed word leaves entire game unchanged',()=>{
 const g=fixture(),snapshot=JSON.stringify(g);
 assert.throws(()=>playMove(g,put('CHAT',111),dictionary('CHIEN')),/CHAT/);assert.equal(JSON.stringify(g),snapshot);
});
test('empty bag + emptied rack transfers opponent remainder and ends once',()=>{
 const g=fixture('CHAT');g.bag=[];g.players[1].rack=['Z','?'];g.players[1].score=20;
 const n=playMove(g,put('CHAT',111),dictionary('CHAT'));
 assert.equal(n.status,'finished');assert.equal(n.endReason,'empty-rack');assert.equal(n.players[0].score,28);assert.equal(n.players[1].score,10);
 assert.throws(()=>passTurn(n),/terminée/);
});
test('six passes end game and deduct both racks, without transfer',()=>{
 let g=fixture('A');g.players[0].score=10;g.players[1].score=20;g.players[1].rack=['Z'];
 for(let i=0;i<5;i++){g=passTurn(g);assert.equal(g.status,'playing');}
 g=passTurn(g);assert.equal(g.status,'finished');assert.equal(g.players[0].score,9);assert.equal(g.players[1].score,10);
});
test('exchange draws before returning tiles, consumes turn, resets passes, preserves counts',()=>{
 const g=fixture('CHATERS');g.passes=3;const original=JSON.stringify(g);
 const n=exchangeTiles(g,[0,2],()=>.2);
 assert.equal(n.players[0].rack[0],g.bag[0]);assert.equal(n.players[0].rack[2],g.bag[1]);assert.equal(n.bag.length,g.bag.length);assert.equal(n.current,1);assert.equal(n.passes,0);assert.equal(JSON.stringify(g),original);
 const letters=x=>[...x.bag,...x.players.flatMap(p=>p.rack)].sort().join('');assert.equal(letters(g),letters(n));
});
test('exchange rejects fewer than 7 tiles in bag, empty or duplicated selection',()=>{
 const g=fixture();assert.throws(()=>exchangeTiles(g,[]));assert.throws(()=>exchangeTiles(g,[0,0]));g.bag=['A'];assert.throws(()=>exchangeTiles(g,[0]),/sept/);
});
test('play resets pass counter, lexicon version pinned to game',()=>{
 const g=fixture();g.passes=5;assert.equal(playMove(g,put('CHAT',111),dictionary('CHAT')).passes,0);
 assert.throws(()=>evaluateMove(g,put('CHAT',111),{id:'other',has:()=>true}),/lexique/);
});
test('generated French lexicon contains plurals, conjugations, normalized ligatures',()=>{
 for(const word of ['CHAT','CHATS','MANGEAIENT','ETAIENT','OEUFS','LIVRE','REVE'])assert.equal(lexicon.has(word),true,word);
 for(const word of ['NATHALIE','ONU','KG','BON-JOUR','ZZZZZZZ','A'])assert.equal(lexicon.has(word),false,word);
});
test('engine works with production lexicon',()=>{
 const g=fixture();g.lexiconId=lexicon.id;assert.equal(playMove(g,put('CHAT',111),lexicon).players[0].score,18);
});

