import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGame,playMove,passTurn,exchangeTiles,resignGame,finishIfBlocked,RuleError } from '../dist/engine.mjs';
import { ApiError } from './errors.mjs';
const metadata=JSON.parse(readFileSync(new URL('../../mobile/src/data/lexicon-meta.json',import.meta.url),'utf8'));
const words=new Set(JSON.parse(readFileSync(new URL('../../mobile/src/data/words.json',import.meta.url),'utf8')).split('\n'));
export const serverLexicon={id:metadata.id,has:word=>words.has(word),entries:()=>words.values()};
const secureRandom=()=>randomInt(0x100000000)/0x100000000;
export function createGameService(repository,accounts,{random=secureRandom,lexicon=serverLexicon,onChanged=()=>{}}={}){
 async function member(userId,id){const row=await repository.get(id);if(!row||![row.inviter_id,row.invitee_id].includes(userId))throw new ApiError(404,'Partie introuvable.');return row;}
 async function profiles(rows){const ids=[...new Set(rows.flatMap(r=>[r.inviter_id,r.invitee_id]))];return new Map(await Promise.all(ids.map(async id=>[id,await accounts.me(id)])));}
 function summary(row,people){return {endReason:row.state.endReason,resignedByUserId:row.state.endReason==='resignation'?row.state.players[row.state.resignedBy]?.userId:null,id:row.id,lastActionId:row.last_action_id??null,status:row.status,revision:row.revision,inviterId:row.inviter_id,inviteeId:row.invitee_id,updatedAt:row.updated_at,currentUserId:row.state.players[row.state.current].userId,players:row.state.players.map(p=>({id:p.userId,name:people.get(p.userId).name,avatarUrl:people.get(p.userId).avatarUrl,score:p.score,rackCount:p.rack.length})),lastTurn:row.state.history.at(-1)??null};}
 async function view(row,userId){
  const people=await profiles([row]);
  const state={...row.state,bag:Array(row.state.bag.length).fill('?'),players:row.state.players.map(p=>({userId:p.userId,name:people.get(p.userId).name,avatarUrl:people.get(p.userId).avatarUrl,score:p.score,rack:p.userId===userId&&row.status!=='pending'?p.rack:Array(p.rack.length).fill('?')}))};
  return {...summary(row,people),state};
 }
 async function write(row,userId,command,patch){
  const next=await repository.replace(row.id,row.revision,{...patch,revision:row.revision+1,last_action_id:command.id,last_action_by:userId,updated_at:new Date().toISOString()});
  if(!next)throw new ApiError(409,'La partie a changé. Actualisez-la avant de rejouer.');
  onChanged(next);
  return view(next,userId);
 }
 return {
  async list(userId){const rows=await repository.list(userId),people=await profiles(rows);return rows.map(row=>summary(row,people));},
  async get(userId,id){return view(await member(userId,id),userId);},
  async invite(userId,{id,opponentId}){
   if(accounts.requireActive)await accounts.requireActive(opponentId);
   if(userId===opponentId)throw new ApiError(400,'Choisissez un autre joueur.');
   const existing=await repository.get(id);
   if(existing){if(existing.inviter_id===userId&&existing.invitee_id===opponentId)return view(existing,userId);throw new ApiError(409,'Identifiant d’invitation déjà utilisé.');}
   const people=await profiles([{inviter_id:userId,invitee_id:opponentId}]);
   const state=createGame([people.get(userId).name,people.get(opponentId).name],lexicon.id,random);
   state.players.forEach((p,i)=>p.userId=i===0?userId:opponentId);
   const now=new Date().toISOString();const inserted=await repository.insert({id,inviter_id:userId,invitee_id:opponentId,status:'pending',revision:0,state,created_at:now,updated_at:now});onChanged(inserted);return view(inserted,userId);
  },
  async act(userId,id,command){
   const row=await member(userId,id);
   if(row.last_action_id===command.id&&row.last_action_by===userId)return view(row,userId);
   if(command.revision!==row.revision)throw new ApiError(409,'La partie a changé. Actualisez-la avant de rejouer.');
   if(command.kind==='accept'||command.kind==='decline'){
    if(row.status!=='pending'||row.invitee_id!==userId)throw new ApiError(403,'Cette invitation ne peut pas être modifiée par ce joueur.');
    return write(row,userId,command,{status:command.kind==='accept'?'active':'declined'});
   }
   if(row.status!=='active')throw new ApiError(409,'Cette partie n’est pas en cours.');
   if(command.kind==='check-blocked'){const next=finishIfBlocked(row.state,lexicon);return next===row.state?view(row,userId):write(row,userId,command,{state:next,status:'finished'});}
   if(command.kind==='resign')return write(row,userId,command,{state:resignGame(row.state,row.state.players.findIndex(p=>p.userId===userId)),status:'finished'});
   if(row.state.players[row.state.current].userId!==userId)throw new ApiError(403,'Ce n’est pas votre tour.');
   let next;
   try{
    if(command.kind==='play')next=playMove(row.state,command.placements,lexicon);
    else if(command.kind==='exchange')next=exchangeTiles(row.state,command.indices,random);
    else if(command.kind==='pass')next=passTurn(row.state);
    else throw new ApiError(400,'Action inconnue.');
   }catch(error){if(error instanceof RuleError)throw new ApiError(400,error.message);throw error;}
   next=finishIfBlocked(next,lexicon);
   return write(row,userId,command,{state:next,status:next.status==='finished'?'finished':'active'});
  },
 };
}
