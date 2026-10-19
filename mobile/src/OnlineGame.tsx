import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,AppState,Pressable,Text,View } from 'react-native';
import { api,realtime } from './api';
import { LocalGame } from './LocalGame';
import { commandId,GameCommand,OnlineSnapshot,VersionedCommand } from './onlineTypes';
export function OnlineGame({id,userId,onBack}:{id:string;userId:string;onBack:()=>void}){
 const [snapshot,setSnapshot]=useState<OnlineSnapshot|null>(null),[error,setError]=useState('');
 const current=useRef<OnlineSnapshot|null>(null),alive=useRef(true),sending=useRef(false),fetching=useRef(false),queued=useRef(false);
 const checked=useRef(false);
 const rematchId=useRef<string|null>(null);
 const pending=useRef<{key:string;command:VersionedCommand}|null>(null);
 const install=useCallback((next:OnlineSnapshot)=>{
  if(!alive.current)return;
  if(!current.current||next.revision>current.current.revision){current.current=next;setSnapshot(next);}
  else if(next.revision===current.current.revision&&JSON.stringify(next.players)!==JSON.stringify(current.current.players)){
   // Renew signed avatar URLs without resetting an unsubmitted draft.
   const updated={...next,state:current.current.state};current.current=updated;setSnapshot(updated);
  }
  setError('');
 },[]);
 const refresh=useCallback(async()=>{
  if(AppState.currentState!=='active')return;
  if(fetching.current||sending.current){queued.current=true;return;}
  fetching.current=true;
  try{do{queued.current=false;const next=await api.game(id);install(next);if(!checked.current&&next.status==='active'){checked.current=true;try{install(await api.gameAction(id,{id:commandId(),revision:next.revision,kind:'check-blocked'}));}catch(e){checked.current=false;throw e;}}}while(queued.current&&alive.current&&!sending.current&&AppState.currentState==='active');}catch(e){if(alive.current)setError((e as Error).message);}finally{fetching.current=false;}
 },[id,install]);
 useEffect(()=>{
  alive.current=true;const initial=setTimeout(()=>{void refresh();},0);
  const unsubscribe=realtime.subscribe(event=>{
   if(event.type==='disconnected'){setError('Connexion temps réel interrompue. Reconnexion en cours…');return;}
   if(event.type==='ready'||event.type==='users.changed'||(event.type==='game.changed'&&event.gameId===id&&event.revision>(current.current?.revision??-1)))void refresh();
  });
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
  return ()=>{alive.current=false;clearTimeout(initial);unsubscribe();subscription.remove();};
 },[id,refresh]);
 const submit=useCallback(async(action:GameCommand)=>{
  if(!current.current||sending.current)throw new Error('Patientez avant de rejouer.');
  const key=JSON.stringify({action,revision:current.current.revision});
  if(pending.current?.key!==key)pending.current={key,command:{...action,id:commandId(),revision:current.current.revision}};
  const command=pending.current.command;sending.current=true;
  try{
   const next=await api.gameAction(id,command);install(next);pending.current=null;return next.state;
  }catch(error){
   // The server may have committed even if the response was lost.
   try{const latest=await api.game(id);install(latest);if(latest.lastActionId===command.id){pending.current=null;return latest.state;}}catch{}
   throw error;
  }finally{sending.current=false;if(queued.current)void refresh();}
 },[id,install,refresh]);
 const rematch=useCallback(async()=>{
  const game=current.current;if(!game||game.status!=='finished')return;
  const opponent=game.players.find(p=>p.id!==userId);if(!opponent)throw new Error('Adversaire introuvable.');
  rematchId.current??=commandId();
  await api.inviteGame(rematchId.current,opponent.id);
 },[userId]);
 if(!snapshot)return <View style={{flex:1,justifyContent:'center',alignItems:'center',padding:24,gap:20,backgroundColor:'#f3eafa'}}>{error?<Text style={{color:'#4b0565'}}>{error}</Text>:<ActivityIndicator color="#4b0565"/>}<Pressable onPress={()=>{void refresh();}}><Text>Réessayer</Text></Pressable></View>;
 return <View style={{flex:1}}>{!!error&&<Pressable onPress={()=>{void refresh();}} style={{padding:10,backgroundColor:'#fff0dc'}}><Text accessibilityLiveRegion="polite">{error} Touchez pour actualiser.</Text></Pressable>}<LocalGame onBack={onBack} onRematch={rematch} participants={snapshot.players.map(p=>({...p,role:'user' as const}))} remote={{game:snapshot.state,viewerId:userId,onAction:submit}}/></View>;
}
