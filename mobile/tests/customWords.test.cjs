const test=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const dictionary=load('src/lexicon.ts');
test('supplemental lexicon is shared by preview and move search; removal preserves base words',()=>{
 dictionary.setCustomWords([]);assert.equal(dictionary.lexicon.has('ZZZZZZZZZZZZZZZ'),false);const before=dictionary.lexicon;
 dictionary.setCustomWords(['ZZZZZZZZZZZZZZZ','bad-word']);assert.equal(dictionary.lexicon.has('ZZZZZZZZZZZZZZZ'),true);assert.equal(dictionary.lexicon.has('bad-word'),false);assert.notEqual(dictionary.lexicon,before);assert([...dictionary.lexicon.entries()].includes('ZZZZZZZZZZZZZZZ'));
 dictionary.setCustomWords([]);assert.equal(dictionary.lexicon.has('ZZZZZZZZZZZZZZZ'),false);assert.equal(dictionary.lexicon.has('CHAT'),true);
});
