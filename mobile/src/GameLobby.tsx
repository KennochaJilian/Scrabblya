import React,{useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator,AppState,Modal,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from './api';
import type { PublicUser } from './apiClient';
import { commandId,GameSummary } from './onlineTypes';
import { UserAvatar } from './UserAvatar';
export function GameLobby({user,users,onOpen,onPractice}:{user:PublicUser;users:PublicUser[];onOpen:(id:string)=>void;onPractice:()=>void}){
 const [games,setGames]=useState<GameSummary[]>([]),[tab,setTab]=useState<'active'|'pending'|'finished'>('active'),[invite,setInvite]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const alive=useRef(true),fetching=useRef(false),working=useRef(false);
 const refresh=useCallback(async()=>{
  if(fetching.current||AppState.currentState==='background')return;
  fetching.current=true;
  try{const next=await api.games();if(alive.current){setGames(next);setError('');}}catch(e){if(alive.current)setError((e as Error).message);}finally{fetching.current=false;if(alive.current)setLoaded(true);}
 },[]);
 useEffect(()=>{
  alive.current=true;const initial=setTimeout(()=>{void refresh();},0);const timer=setInterval(()=>{void refresh();},10000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
  return ()=>{alive.current=false;clearTimeout(initial);clearInterval(timer);sub.remove();};
 },[refresh]);
 async function run(action:()=>Promise<void>){
  if(working.current)return;working.current=true;setBusy(true);setError('');
  try{await action();}catch(e){if(alive.current)setError((e as Error).message);}finally{working.current=false;if(alive.current)setBusy(false);}
 }
 const filtered=games.filter(g=>g.status===tab);
 return <View style={{gap:14}}>
 <View style={s.row}><Text style={s.heading}>Vos parties</Text><Pressable accessibilityRole="button" accessibilityLabel="Inviter un joueur" style={s.newButton} onPress={()=>setInvite(true)}><Ionicons name="add" size={24} color="white"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Actualiser les parties" onPress={()=>{void refresh();}}><Ionicons name="refresh-outline" size={25} color="#4b0565"/></Pressable></View>
 <View style={s.tabs}>{(['active','pending','finished'] as const).map(value=><Pressable accessibilityRole="button" accessibilityState={{selected:tab===value}} key={value} onPress={()=>setTab(value)} style={[s.tab,tab===value&&s.selected]}><Text style={{color:tab===value?'white':'#4b0565',fontWeight:'600'}}>{value==='active'?'En cours':value==='pending'?'Invitations':'Terminées'} {games.filter(g=>g.status===value).length}</Text></Pressable>)}</View>
 {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 {!loaded&&<ActivityIndicator color="#4b0565"/>}
 {loaded&&!filtered.length&&<Text style={s.muted}>{tab==='pending'?'Aucune invitation.':tab==='finished'?'Aucune partie terminée.':'Invitez un proche pour commencer une partie.'}</Text>}
 {filtered.map(game=>{
  const me=game.players.find(p=>p.id===user.id)!,other=game.players.find(p=>p.id!==user.id)!;
  return <View key={game.id} style={s.card}>
   <Pressable accessibilityRole="button" disabled={game.status==='pending'} onPress={()=>onOpen(game.id)} style={s.row}><UserAvatar name={other.name} avatarUrl={other.avatarUrl} size={46}/><View style={{flex:1,gap:4}}><Text style={s.name}>{other.name}</Text><Text style={s.muted}>{game.status==='pending'?(game.inviterId===user.id?'Invitation envoyée':'Vous invite à jouer'):game.status==='finished'?'Partie terminée':game.currentUserId===user.id?'À vous de jouer':'En attente'}</Text></View><Text style={s.score}>{me.score} · {other.score}</Text>{game.status!=='pending'&&<Ionicons name="chevron-forward" size={21} color="#4b0565"/>}</Pressable>
   {game.status==='pending'&&game.inviteeId===user.id&&<View style={s.row}><Pressable disabled={busy} accessibilityRole="button" onPress={()=>{void run(async()=>{const next=await api.gameAction(game.id,{id:commandId(),revision:game.revision,kind:'accept'});await refresh();onOpen(next.id);});}} style={s.accept}><Text style={{color:'white'}}>Accepter</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={()=>{void run(async()=>{await api.gameAction(game.id,{id:commandId(),revision:game.revision,kind:'decline'});await refresh();});}} style={s.decline}><Text style={{color:'#4b0565'}}>Refuser</Text></Pressable></View>}
  </View>;
 })}
 <Pressable accessibilityRole="button" onPress={onPractice} style={s.practice}><Ionicons name="flask-outline" size={19} color="#79568b"/><Text style={s.muted}>Partie locale et mode développeur</Text></Pressable>
 <Modal visible={invite} transparent animationType="slide" onRequestClose={()=>setInvite(false)}><View style={s.backdrop}><View style={s.dialog}><View style={s.row}><Text style={s.heading}>Inviter un joueur</Text><Pressable accessibilityRole="button" accessibilityLabel="Fermer les invitations" onPress={()=>setInvite(false)}><Ionicons name="close" size={26} color="#4b0565"/></Pressable></View><ScrollView>
 {users.filter(p=>p.id!==user.id).map(person=><Pressable accessibilityRole="button" accessibilityLabel={`Inviter ${person.name}`} key={person.id} disabled={busy} style={[s.row,{paddingVertical:14}]} onPress={()=>{void run(async()=>{await api.inviteGame(commandId(),person.id);setInvite(false);setTab('pending');await refresh();});}}><UserAvatar name={person.name} avatarUrl={person.avatarUrl}/><Text style={[s.name,{flex:1}]}>{person.name}</Text><Ionicons name="mail-outline" size={23} color="#4b0565"/></Pressable>)}
 {users.every(p=>p.id===user.id)&&<Text style={s.muted}>Créez un autre compte familial depuis la gestion des utilisateurs.</Text>}
 </ScrollView>{busy&&<ActivityIndicator color="#4b0565"/>}{!!error&&<Text style={s.error}>{error}</Text>}</View></View></Modal>
 </View>;
}
const s=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',gap:12},heading:{flex:1,fontSize:26,fontFamily:'serif',color:'#4b0565'},newButton:{backgroundColor:'#4b0565',padding:10,borderRadius:22},tabs:{flexDirection:'row',backgroundColor:'#e8dbf2',borderRadius:22,padding:3},tab:{flex:1,alignItems:'center',paddingVertical:12,borderRadius:20},selected:{backgroundColor:'#4b0565'},card:{backgroundColor:'#fff9ff',padding:16,borderRadius:22,gap:15},name:{fontSize:17,fontWeight:'700',color:'#4b0565'},score:{fontSize:22,color:'#4b0565',fontWeight:'700'},muted:{color:'#79568b',lineHeight:20,fontSize:13},error:{color:'#a51d43',padding:12,backgroundColor:'#fff0f2',borderRadius:12},accept:{backgroundColor:'#4b0565',padding:12,borderRadius:20},decline:{padding:12},practice:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:14},backdrop:{flex:1,backgroundColor:'#25103799',justifyContent:'center',padding:20},dialog:{maxHeight:'80%',backgroundColor:'#fff9ff',padding:22,borderRadius:24,gap:14}});
