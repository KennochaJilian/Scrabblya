import { createGame, Game, Lexicon, passTurn, Placement } from './engine';
import { points } from './board';
export type DevScenario='tie'|'player1-wins'|'player2-wins'|'scrabble-rack'|'scrabble-ready';
export function createDevScenario(scenario:DevScenario,lexicon:Lexicon):{game:Game;draft:Placement[]}{
 let game=createGame(['Joueur 1','Joueur 2'],lexicon.id,()=>.37);
 if(scenario==='scrabble-rack'||scenario==='scrabble-ready'){
  const word='MAISONS';if(!lexicon.has(word))throw new Error('Le mot de test est absent du lexique.');
  const pool=[...game.bag,...game.players.flatMap(p=>p.rack)];
  game.players[0].rack=[...word].map(letter=>{const index=pool.indexOf(letter);if(index<0)throw new Error('Pioche de test invalide.');return pool.splice(index,1)[0];});
  game.players[1].rack=pool.splice(0,7);game.bag=pool;
  return {game,draft:scenario==='scrabble-ready'?[...word].map((letter,rackIndex)=>({cell:109+rackIndex,rackIndex,letter})):[]};
 }
 const finalScores=scenario==='tie'?[200,200]:scenario==='player1-wins'?[240,200]:[200,240];
 game.players.forEach((p,i)=>{p.score=finalScores[i]+p.rack.reduce((total,l)=>total+points[l],0);});
 // Exercise the real ending logic rather than merely setting status='finished'.
 for(let i=0;i<6;i++)game=passTurn(game);
 return {game,draft:[]};
}
