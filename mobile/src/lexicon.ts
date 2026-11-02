import data from './data/words.json';
import metadata from './data/lexicon-meta.json';
import type { Lexicon } from './engine';
let words: Set<string> | undefined;
export let lexicon: Lexicon = {
 id: metadata.id,
 entries(){words??=new Set((data as string).split('\n'));return words.values();},
 has(word) { words ??= new Set((data as string).split('\n')); return words.has(word); },
};
export const lexiconMetadata = metadata;

export function setCustomWords(extra:string[]){
 const additions=new Set(extra.filter(w=>/^[A-Z]{2,15}$/.test(w)));
 lexicon={id:metadata.id,has(word){words??=new Set((data as string).split('\n'));return words.has(word)||additions.has(word);},*entries(){words??=new Set((data as string).split('\n'));yield* words;yield* additions;}};
}
