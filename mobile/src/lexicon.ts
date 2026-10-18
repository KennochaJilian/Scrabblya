import data from './data/words.json';
import metadata from './data/lexicon-meta.json';
import type { Lexicon } from './engine';
let words: Set<string> | undefined;
export const lexicon: Lexicon = {
 id: metadata.id,
 has(word) { words ??= new Set((data as string).split('\n')); return words.has(word); },
};
export const lexiconMetadata = metadata;
