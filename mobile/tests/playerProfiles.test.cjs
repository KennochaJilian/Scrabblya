const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {createProfileGame,bindProfiles,profileGameKey}=load('src/playerProfiles.ts');
const profiles=[{id:'alice',name:'Alice',role:'admin',avatarUrl:'https://example.test/alice.png'},{id:'bob',name:'Bob',role:'user',avatarUrl:null}];
test('game uses real names and avatars without altering letter distribution or scores',()=>{
 const game=createProfileGame(profiles,'test');assert.equal(game.players[0].name,'Alice');assert.equal(game.players[1].name,'Bob');assert.equal(game.players[0].userId,'alice');assert.equal(game.players[0].avatarUrl,profiles[0].avatarUrl);
 assert.equal(game.bag.length,88);assert.equal(game.players[0].score,0);
 const updated=bindProfiles(game,[{...profiles[0],name:'Alice B'},profiles[1]]);assert.equal(updated.players[0].name,'Alice B');assert.equal(game.players[0].name,'Alice');assert.deepEqual(updated.players[0].rack,game.players[0].rack);
});
test('local saves are scoped to both accounts, not shared between authenticated families',()=>{
 assert.notEqual(profileGameKey(profiles),profileGameKey([profiles[1],profiles[0]]));
 assert.notEqual(profileGameKey(profiles),profileGameKey([{...profiles[0],id:'carol'},profiles[1]]));
});
