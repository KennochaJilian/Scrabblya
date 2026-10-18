const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'vendor/grammalecte/lexique-grammalecte-fr-v7.7.txt'), 'utf8');
const words = new Set();
for (const line of source.split('\n')) {
 const r = line.replace(/\r$/, '').split('\t');
 if(r.length < 11) continue;
 const [form, tags, notes, subset] = [r[2], r[4], r[7], r[10]];
 if(!subset.split('/').every(s => ['*','C','M','R'].includes(s))) continue;
 if(!/^(nom|adj|adv|mg|interj|nb|nbro|negadv|v[0-3][^ ]*)( |$)/.test(tags)) continue;
 if(/(^| )(abr|sig|symb|abty)( |$)/.test(notes)) continue;
 // Exclude punctuation, uppercase names and symbols BEFORE normalization.
 if(!/^[a-zàâäéèêëîïôöùûüÿçœæ]+$/.test(form)) continue;
 const word = form.replace(/œ/g,'oe').replace(/æ/g,'ae').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 if(/^[A-Z]{2,15}$/.test(word)) words.add(word);
}
const sorted = [...words].sort();
const text = sorted.join('\n');
const hash = crypto.createHash('sha256').update(text).digest('hex');
fs.mkdirSync(path.join(root, 'src/data'), {recursive:true});
fs.writeFileSync(path.join(root, 'src/data/words.json'), JSON.stringify(text));
fs.writeFileSync(path.join(root, 'src/data/lexicon-meta.json'), JSON.stringify({id:`grammalecte-7.7-family-v1-${hash.slice(0,12)}`,count:sorted.length,sha256:hash,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),source:'https://grammalecte.net/dic/lexique-grammalecte-fr-v7.7.zip',license:'MPL-2.0'},null,2)+'\n');
console.log(`${sorted.length} mots, SHA-256 ${hash}`);
