import type { Game,Placement,Turn } from './engine';
export type GameCommand={kind:'play';placements:Placement[]}|{kind:'exchange';indices:number[]}|{kind:'pass'|'accept'|'decline'};
export type VersionedCommand=GameCommand&{id:string;revision:number};
export type GameSummary={id:string;status:'pending'|'active'|'declined'|'finished';revision:number;inviterId:string;inviteeId:string;currentUserId:string;updatedAt:string;players:{id:string;name:string;avatarUrl:string|null;score:number;rackCount:number}[];lastTurn:Turn|null;lastActionId?:string|null};
export type OnlineSnapshot=GameSummary&{state:Game};
// Command identifiers provide retry deduplication, not authentication.
export function commandId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);});}
