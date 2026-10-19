// Pure game rules, shared later with the server. No UI or network dependencies.
import { bonusAt, distribution, points } from './board';
export type Tile = { letter: string; blank: boolean };
export type Placement = { cell: number; rackIndex: number; letter: string };
export type Player = { userId?:string; avatarUrl?:string|null; name: string; rack: string[]; score: number };
export type Turn = { player: number; kind: 'play' | 'pass' | 'exchange' | 'resign'; words: string[]; score: number };
export type Game = {
 version: 1; lexiconId: string; board: (Tile | null)[]; players: Player[]; bag: string[];
 current: number; passes: number; history: Turn[]; status: 'playing' | 'finished';
 endReason?: 'empty-rack' | 'passes' | 'blocked' | 'resignation'; resignedBy?: number;
};
export type Lexicon = { id: string; has: (word: string) => boolean; entries?:()=>Iterable<string> };
export class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition { if (!condition) throw new RuleError(message); }
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
export function createGame(names: string[], lexiconId: string, random: () => number = Math.random): Game {
 requireRule(names.length===2,'La partie nécessite deux joueurs.');
 const bag=shuffle(Object.entries(distribution).flatMap(([l,n])=>Array<string>(n).fill(l)),random);
 const players=names.map(name=>({name,rack:bag.splice(0,7),score:0}));
 return {version:1,lexiconId,board:Array<Tile|null>(225).fill(null),players,bag,current:0,passes:0,history:[],status:'playing'};
}
function active(game: Game) {requireRule(game.status==='playing','Cette partie est terminée.');}
function adjacent(cell: number, delta: number): number | null {
 const next=cell+delta;
 if(next<0||next>=225||(Math.abs(delta)===1&&Math.floor(next/15)!==Math.floor(cell/15)))return null;
 return next;
}
function wordCells(board: Game['board'],cell: number,delta: number): number[] {
 let start=cell;let prev=adjacent(start,-delta);
 while(prev!==null&&board[prev]){start=prev;prev=adjacent(start,-delta);}
 const result:number[]=[];let next:number|null=start;
 while(next!==null&&board[next]){result.push(next);next=adjacent(next,delta);}
 return result;
}
export function evaluateMove(game: Game, placements: Placement[], lexicon: Lexicon) {
 active(game);
 requireRule(game.lexiconId===lexicon.id,'Le lexique ne correspond pas à cette partie.');
 requireRule(placements.length>0&&placements.length<=7,'Posez entre une et sept lettres.');
 const board=[...game.board], cells=new Set<number>(), indices=new Set<number>();
 const rack=game.players[game.current].rack;
 for(const p of placements){
  requireRule(Number.isInteger(p.cell)&&p.cell>=0&&p.cell<225,'Case hors plateau.');
  requireRule(!board[p.cell]&&!cells.has(p.cell),'Cette case est déjà occupée.');
  requireRule(Number.isInteger(p.rackIndex)&&p.rackIndex>=0&&p.rackIndex<rack.length&&!indices.has(p.rackIndex),'Lettre du chevalet indisponible.');
  requireRule(/^[A-Z]$/.test(p.letter),'Choisissez une lettre de A à Z pour le joker.');
  const source=rack[p.rackIndex];
  requireRule(source==='?'||source===p.letter,'Cette lettre ne correspond pas au chevalet.');
  cells.add(p.cell);indices.add(p.rackIndex);board[p.cell]={letter:p.letter,blank:source==='?'};
 }
 const sameRow=placements.every(p=>Math.floor(p.cell/15)===Math.floor(placements[0].cell/15));
 const sameColumn=placements.every(p=>p.cell%15===placements[0].cell%15);
 requireRule(sameRow||sameColumn,'Les lettres doivent être alignées.');
 const delta=sameRow?1:15;
 if(placements.length>1){
  const line=wordCells(board,placements[0].cell,delta);
  requireRule(placements.every(p=>line.includes(p.cell)),'Le mot comporte une case vide.');
 }
 const first=game.board.every(t=>t===null);
 if(first)requireRule(cells.has(112),'Le premier mot doit passer par le centre.');
 else requireRule(placements.some(p=>[1,-1,15,-15].some(d=>{const n=adjacent(p.cell,d);return n!==null&&game.board[n]!==null;})),'Le mot doit être relié aux lettres du plateau.');
 const found=new Map<string,number[]>();
 for(const p of placements)for(const direction of [1,15]){
  const list=wordCells(board,p.cell,direction);
  if(list.length>=2)found.set(list.join(','),list);
 }
 requireRule(found.size>0,'Formez un mot d’au moins deux lettres.');
 const words=[...found.values()].map(list=>{
  const word=list.map(i=>board[i]!.letter).join('');
  requireRule(lexicon.has(word),`Mot absent du lexique : ${word}.`);
  let multiplier=1,total=0;
  for(const i of list){
   const tile=board[i]!;let value=tile.blank?0:points[tile.letter];
   if(cells.has(i)){
    const bonus=bonusAt(i);
    if(bonus==='LD')value*=2;if(bonus==='LT')value*=3;
    if(bonus==='MD'||bonus==='★')multiplier*=2;if(bonus==='MT')multiplier*=3;
   }
   total+=value;
  }
  return {word,score:total*multiplier};
 });
 return {board,words,score:words.reduce((sum,w)=>sum+w.score,0)+(placements.length===7?50:0)};
}
function copy(game: Game): Game {return {...game,board:[...game.board],bag:[...game.bag],players:game.players.map(p=>({...p,rack:[...p.rack]})),history:[...game.history]};}
function rackValue(rack: string[]) {return rack.reduce((sum,l)=>sum+points[l],0);}
function finish(game: Game, reason: 'empty-rack' | 'passes' | 'blocked') {
 game.status='finished';game.endReason=reason;
 const remainders=game.players.map(p=>rackValue(p.rack));
 game.players.forEach((p,i)=>p.score-=remainders[i]);
 if(reason==='empty-rack')game.players[game.current].score+=remainders.reduce((a,b)=>a+b,0);
 return game;
}
export function playMove(game: Game, placements: Placement[], lexicon: Lexicon): Game {
 const result=evaluateMove(game,placements,lexicon),next=copy(game),player=next.players[next.current];
 next.board=result.board;player.score+=result.score;
 const used=new Set(placements.map(p=>p.rackIndex));player.rack=player.rack.filter((_,i)=>!used.has(i));
 player.rack.push(...next.bag.splice(0,7-player.rack.length));
 next.history.push({player:next.current,kind:'play',words:result.words.map(w=>w.word),score:result.score});next.passes=0;
 if(next.bag.length===0&&player.rack.length===0)return finish(next,'empty-rack');
 next.current=1-next.current;return next;
}
export function passTurn(game: Game): Game {
 active(game);const next=copy(game);next.passes++;
 next.history.push({player:next.current,kind:'pass',words:[],score:0});
 if(next.passes===6)return finish(next,'passes');
 next.current=1-next.current;return next;
}
export function exchangeTiles(game: Game, indices: number[], random: () => number = Math.random): Game {
 active(game);requireRule(game.bag.length>=7,'Il faut au moins sept lettres dans le sac pour échanger.');
 const rack=game.players[game.current].rack;
 requireRule(indices.length>0&&indices.length<=rack.length&&new Set(indices).size===indices.length&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<rack.length),'Sélectionnez les lettres à échanger.');
 const next=copy(game),returned=indices.map(i=>rack[i]);
 // Draw before returning letters so an exchanged tile cannot be drawn immediately.
 const drawn=next.bag.splice(0,indices.length);
 indices.forEach((index,i)=>next.players[next.current].rack[index]=drawn[i]);
 next.bag=shuffle([...next.bag,...returned],random);next.passes=0;
 next.history.push({player:next.current,kind:'exchange',words:[],score:0});next.current=1-next.current;return next;
}

// A resignation is a loss regardless of scores; existing scores are preserved.
export function resignGame(game:Game,player:number):Game {
 active(game);
 requireRule(Number.isInteger(player)&&player>=0&&player<game.players.length,'Joueur invalide.');
 const next=copy(game);next.status='finished';next.endReason='resignation';next.resignedBy=player;
 next.history.push({player,kind:'resign',words:[],score:0});
 return next;
}
// A sorted dictionary index avoids a large in-memory trie on the VPS.
const dictionaryIndexes=new WeakMap<Lexicon,string[]>();
function dictionaryIndex(lexicon:Lexicon){
 let index=dictionaryIndexes.get(lexicon);
 if(!index&&lexicon.entries){index=[...lexicon.entries()].filter(w=>/^[A-Z]{2,15}$/.test(w)).sort();dictionaryIndexes.set(lexicon,index);}
 return index;
}
export function hasLegalMove(game:Game,letters:string[],lexicon:Lexicon):boolean {
 const words=dictionaryIndex(lexicon);
 requireRule(!!words,'Le lexique ne permet pas la recherche des coups.');
 const counts=new Map<string,number>();for(const l of letters)counts.set(l,(counts.get(l)??0)+1);
 const maxTiles=Math.min(7,letters.length),first=game.board.every(t=>!t);
 function lower(value:string){let lo=0,hi=words!.length;while(lo<hi){const mid=(lo+hi)>>>1;if(words![mid]<value)lo=mid+1;else hi=mid;}return lo;}
 const prefixExists=(prefix:string)=>words![lower(prefix)]?.startsWith(prefix)??false;
 const anchors=game.board.map((t,i)=>!t&&(first?i===112:[1,-1,15,-15].some(d=>{const c=adjacent(i,d);return c!==null&&!!game.board[c];})));
 for(const delta of [1,15]){
  const crossCache=new Map<number,Set<string>|null>();
  function crosses(cell:number){
   if(crossCache.has(cell))return crossCache.get(cell)!;
   const perpendicular=delta===1?15:1;let before='',after='';
   let c=adjacent(cell,-perpendicular);while(c!==null&&game.board[c]){before=game.board[c]!.letter+before;c=adjacent(c,-perpendicular);}
   c=adjacent(cell,perpendicular);while(c!==null&&game.board[c]){after+=game.board[c]!.letter;c=adjacent(c,perpendicular);}
   const allowed=before||after?new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(l=>lexicon.has(before+l+after))):null;
   crossCache.set(cell,allowed);return allowed;
  }
  for(let start=0;start<225;start++){
   const previous=adjacent(start,-delta);if(previous!==null&&game.board[previous])continue;
   // A legal word must pass an empty anchor within the available tile budget.
   let c:number|null=start,spaces=0,reachable=false;
   while(c!==null){if(!game.board[c])spaces++;if(spaces>maxTiles)break;if(anchors[c]){reachable=true;break;}c=adjacent(c,delta);}
   if(!reachable)continue;
   function search(cell:number|null,prefix:string,used:number,connected:boolean):boolean {
    if(prefix.length>=2&&used>0&&connected&&(cell===null||!game.board[cell])&&lexicon.has(prefix))return true;
    if(cell===null||prefix.length===15)return false;
    const tile=game.board[cell],next=adjacent(cell,delta);
    if(tile){const word=prefix+tile.letter;return prefixExists(word)&&search(next,word,used,connected);}
    if(used===maxTiles)return false;
    const allowed=crosses(cell);
    for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
     if(!(counts.get(letter)??0)&&!(counts.get('?')??0))continue;
     if(allowed&&!allowed.has(letter))continue;
     const word=prefix+letter;if(!prefixExists(word))continue;
     for(const source of [letter,'?']){
      const available=counts.get(source)??0;if(!available)continue;
      counts.set(source,available-1);
      const found=search(next,word,used+1,connected||anchors[cell]);
      counts.set(source,available);if(found)return true;
     }
    }
    return false;
   }
   if(search(start,'',0,false))return true;
  }
 }
 return false;
}
export function finishIfBlocked(game:Game,lexicon:Lexicon):Game {
 if(game.status!=='playing'||!lexicon.entries)return game;
 requireRule(game.lexiconId===lexicon.id,'Le lexique ne correspond pas à cette partie.');
 // With seven tiles in the bag, repeated exchanges can also transfer tiles
 // between players via the bag. Search the complete reachable pool, not just
 // one rack plus the bag, to avoid declaring a recoverable position blocked.
 if(game.bag.length>=7){
  const pool=[...game.bag,...game.players.flatMap(player=>player.rack)];
  if(hasLegalMove(game,pool,lexicon))return game;
 }else{
  for(const player of game.players)if(hasLegalMove(game,player.rack,lexicon))return game;
 }
 return finish(copy(game),'blocked');
}
