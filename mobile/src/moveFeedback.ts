import type { Game, Lexicon, Placement } from './engine';
import { evaluateMove } from './engine';

export function cellsRectangle(cells: number[], cellSize: number) {
 const rows=cells.map(i=>Math.floor(i/15)),columns=cells.map(i=>i%15);
 return {left:Math.min(...columns)*cellSize,top:Math.min(...rows)*cellSize,width:(Math.max(...columns)-Math.min(...columns)+1)*cellSize,height:(Math.max(...rows)-Math.min(...rows)+1)*cellSize};
}
// Outline the whole word, including letters already on the board. For an invalid
// gapped line, keep the attempted span visible so the player can repair it.
export function draftOutlines(game: Game, draft: Placement[]): number[][] {
 if(!draft.length)return [];
 const occupied=new Set(game.board.flatMap((t,i)=>t?[i]:[]));draft.forEach(p=>occupied.add(p.cell));
 const sameRow=draft.every(p=>Math.floor(p.cell/15)===Math.floor(draft[0].cell/15));
 const sameCol=draft.every(p=>p.cell%15===draft[0].cell%15);
 function step(i:number,delta:number){const n=i+delta;return n>=0&&n<225&&(Math.abs(delta)!==1||Math.floor(n/15)===Math.floor(i/15))?n:null;}
 function extend(cells:number[],delta:number){
  let start=Math.min(...cells),end=Math.max(...cells),n=step(start,-delta);
  while(n!==null&&occupied.has(n)){start=n;n=step(start,-delta);}
  n=step(end,delta);while(n!==null&&occupied.has(n)){end=n;n=step(end,delta);}
  const result:number[]=[];for(let i=start;i<=end;i+=delta)result.push(i);return result;
 }
 const groups=new Map<string,number[]>();
 function add(cells:number[]){groups.set(cells.join(','),cells);}
 if(draft.length>1&&(sameRow||sameCol))add(extend(draft.map(p=>p.cell),sameRow?1:15));
 for(const p of draft)for(const delta of [1,15]){const cells=extend([p.cell],delta);if(cells.length>1)add(cells);}
 if(!groups.size)draft.forEach(p=>add([p.cell]));
 // Non-aligned drafts still need an outline around each isolated tile.
 if(!sameRow&&!sameCol)draft.forEach(p=>{if(![...groups.values()].some(c=>c.includes(p.cell)))add([p.cell]);});
 return [...groups.values()].sort((a,b)=>b.filter(i=>draft.some(p=>p.cell===i)).length-a.filter(i=>draft.some(p=>p.cell===i)).length||b.length-a.length);
}
export function moveFeedback(game:Game,draft:Placement[],lexicon:Lexicon){
 if(!draft.length)return null;
 const outlines=draftOutlines(game,draft);
 try{const result=evaluateMove(game,draft,lexicon);return {valid:true,score:result.score,reason:'',outlines,words:result.words};}
 catch(error){return {valid:false,score:0,reason:(error as Error).message,outlines,words:[]};}
}
