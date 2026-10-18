import { createGame, Game } from './engine';
import type { PublicUser } from './apiClient';
export function bindProfiles(game:Game,participants?:PublicUser[]):Game{
 if(participants?.length!==2)return game;
 return {...game,players:game.players.map((p,i)=>({...p,userId:participants[i].id,name:participants[i].name,avatarUrl:participants[i].avatarUrl}))};
}
export function createProfileGame(participants:PublicUser[]|undefined,lexiconId:string):Game{
 return bindProfiles(createGame(participants?.length===2?participants.map(p=>p.name):['Joueur 1','Joueur 2'],lexiconId),participants);
}
export function profileGameKey(participants?:PublicUser[]){
 return participants?.length===2?`scrabblya.local-game.v1:${participants[0].id}:${participants[1].id}`:'scrabblya.local-game.v1';
}
