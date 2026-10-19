import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { bonusAt, points } from './board';
import { exchangeTiles, Game, passTurn, resignGame, finishIfBlocked, Placement, playMove, shuffle } from './engine';
import { lexicon, lexiconMetadata } from './lexicon';
import { BoardBounds, cellAtPoint, TileGrab, tilePosition } from './dropTarget';
import { cellsRectangle, moveFeedback } from './moveFeedback';
import { DraggableTile } from './DraggableTile';
import { TileFace } from './TileFace';
import { UserAvatar } from './UserAvatar';
import type { GameCommand } from './onlineTypes';
import type { PublicUser } from './apiClient';
import { bindProfiles, createProfileGame, profileGameKey } from './playerProfiles';
import { createDevScenario, DevScenario } from './devScenarios';
import { rackSlotAtPoint, relocateDraft, reorderRack } from './tileMoves';

const purple='#4b0565';
let saveQueue=Promise.resolve();
type IconName=React.ComponentProps<typeof Ionicons>['name'];
type ButtonIcon=IconName|'recover-tiles';
function IconButton({icon,label,onPress,disabled=false,primary=false,count}:{icon:ButtonIcon;label:string;onPress:()=>void;disabled?:boolean;primary?:boolean;count?:number}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} hitSlop={2} disabled={disabled} onPress={onPress} style={({pressed})=>[s.iconButton,primary&&s.primaryButton,disabled&&{opacity:.3},pressed&&{opacity:.6}]}>{icon==='recover-tiles'?<View pointerEvents="none" style={{flexDirection:'row'}}><Ionicons name="arrow-down-outline" size={21} color={purple}/><Ionicons name="arrow-down-outline" size={21} color={purple}/></View>:<Ionicons name={icon} size={primary?30:27} color={primary?'white':purple}/>}{count!==undefined&&<Text style={s.countBadge}>{count}</Text>}</Pressable>;
}
function Action({label,onPress,disabled=false,icon='checkmark-outline'}:{label:string;onPress:()=>void;disabled?:boolean;icon?:IconName}) {
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action,disabled&&{opacity:.35}]}><Ionicons name={icon} size={22} color={purple}/><Text style={s.actionText}>{label}</Text></Pressable>;
}
type GameProps={onBack:()=>void;onRematch?:()=>Promise<void>;participants?:PublicUser[];remote?:{game:Game;viewerId:string;onAction:(command:GameCommand)=>Promise<Game>}};
export function LocalGame({onBack,onRematch,participants,remote}:GameProps) {
 return <SafeAreaProvider><GameScreen onBack={onBack} onRematch={onRematch} participants={participants} remote={remote}/></SafeAreaProvider>;
}
function GameScreen({onBack,onRematch,participants,remote}:GameProps) {
 const participantSnapshot=useRef(participants);
 const storageKey=profileGameKey(participants);
 const online=!!remote,remoteGame=remote?.game;
 const [previousRemoteGame,setPreviousRemoteGame]=useState(remoteGame);
 const [game,setGame]=useState<Game|null>(remoteGame??null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[revealed,setRevealed]=useState(false);
 const [draft,setDraft]=useState<Placement[]>([]),[selected,setSelected]=useState<number|null>(null);
 const [exchange,setExchange]=useState(false),[exchangeSelection,setExchangeSelection]=useState<number[]>([]);
 const [joker,setJoker]=useState<{cell:number;rackIndex:number}|null>(null),[confirmNew,setConfirmNew]=useState(false);
 const [order,setOrder]=useState<number[]>([0,1,2,3,4,5,6]);
 const rootRef=useRef<View>(null),boardRef=useRef<View>(null),rackRef=useRef<View>(null),rackBounds=useRef<BoardBounds|null>(null),bounds=useRef<BoardBounds|null>(null),origin=useRef({x:0,y:0});
 const dragRef=useRef<{index:number;letter:string;sourceCell:number|null;value:number;grab:TileGrab;x:number;y:number;ready:boolean}|null>(null); const [dragPoint]=useState(()=>new Animated.ValueXY());
 const [drag,setDrag]=useState<{index:number;letter:string;sourceCell:number|null;value:number;grab:TileGrab}|null>(null),[hover,setHover]=useState<number|null>(null);
 const [rackHover,setRackHover]=useState<number|null>(null);
 const [dragReady,setDragReady]=useState(false),[feedbackDetails,setFeedbackDetails]=useState(false);
 const [rematchBusy,setRematchBusy]=useState(false),[inviteSent,setInviteSent]=useState(false),[rematchError,setRematchError]=useState('');
 const [confirmResign,setConfirmResign]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false),[resultDismissed,setResultDismissed]=useState(false);
 const [devOpen,setDevOpen]=useState(false),[devActive,setDevActive]=useState(false);
 const devBackup=useRef<{game:Game;draft:Placement[];order:number[];revealed:boolean}|null>(null);
 const [celebration,setCelebration]=useState<{score:number}|null>(null);
 const insets=useSafeAreaInsets();
 const {width,height}=useWindowDimensions(),boardWidth=Math.max(0,width-insets.left-insets.right-2),cellSize=boardWidth/15,rackTileSize=Math.max(20,(boardWidth-32)/7);
 useEffect(()=>{
  if(online)return;
  let cancelled=false;
  saveQueue.then(()=>AsyncStorage.getItem(storageKey)).then(raw=>{
   if(cancelled)return;
   if(raw){const saved=JSON.parse(raw) as Game;
    if(saved.version!==1||saved.lexiconId!==lexicon.id||saved.board.length!==225||saved.players.length!==2)throw new Error('Sauvegarde incompatible.');
    const restored=bindProfiles(saved,participantSnapshot.current);const checked=finishIfBlocked(restored,lexicon);setGame(checked);if(checked!==restored){const write=saveQueue.then(()=>AsyncStorage.setItem(storageKey,JSON.stringify(checked)));saveQueue=write.catch(()=>{});return write;}
   }else{
    const created=createProfileGame(participantSnapshot.current,lexicon.id);
    const write=saveQueue.then(()=>AsyncStorage.setItem(storageKey,JSON.stringify(created)));
    saveQueue=write.catch(()=>{});
    return write.then(()=>{if(!cancelled)setGame(created);});
   }
  }).catch(()=>{if(!cancelled)setError('Impossible de lire la sauvegarde. Vous pouvez démarrer une nouvelle partie.');});
  return ()=>{cancelled=true;};
 },[storageKey,online]);
 // Reset a stale draft only when a newer server snapshot arrives.
 if(remoteGame&&remoteGame!==previousRemoteGame){
  setPreviousRemoteGame(remoteGame);setGame(remoteGame);setDraft([]);setSelected(null);setExchange(false);setExchangeSelection([]);setOrder([0,1,2,3,4,5,6]);setRevealed(true);setResultDismissed(false);
 }
 // All writes are serialized, including writes from a previously unmounted screen.
 async function commit(next:Game){
  setSaving(true);setError('');
  const write=devActive||remote?Promise.resolve():saveQueue.then(()=>AsyncStorage.setItem(storageKey,JSON.stringify(next)));
  if(!devActive&&!remote)saveQueue=write.catch(()=>{});
  try{await write;
   if(draft.length===7&&next.history.length>0&&next.history[next.history.length-1].kind==='play')setCelebration({score:next.history[next.history.length-1].score});
   setResultDismissed(false);setGame(next);setDraft([]);setSelected(null);setExchange(false);setExchangeSelection([]);setRevealed(false);setOrder([0,1,2,3,4,5,6]);}
  catch{setError('Sauvegarde impossible : le tour n’a pas été validé. Réessayez.');}
  finally{setSaving(false);}
 }
 const preview=useMemo(()=>game?moveFeedback(game,draft,lexicon):null,[game,draft]);
 const mainOutline=preview?.outlines[0];
 const mainRect=mainOutline?cellsRectangle(mainOutline,cellSize):null;
 const viewer=remote?game?.players.findIndex(p=>p.userId===remote.viewerId)??-1:game?.current??0;
 const playable=!!game&&game.status==='playing'&&(remote?viewer===game.current:revealed)&&!saving;
 const rack=game?.players[viewer]?.rack??[];
 const used=new Set(draft.map(p=>p.rackIndex));
 const visiblePlayers=game?(devActive?game.players:bindProfiles(game,participants).players):[];
 const opponent=game?visiblePlayers[1-viewer]:undefined;
 const lastTurn=game?.history[game.history.length-1];
 function cancelDrag(){dragRef.current=null;setDrag(null);setDragReady(false);setHover(null);setRackHover(null);}
 function moveDrag(x:number,y:number){
  const active=dragRef.current;if(!active)return;active.x=x;active.y=y;
  if(active.ready)dragPoint.setValue(tilePosition({x,y},origin.current,active.grab));
  setHover(cellAtPoint(x,y,bounds.current));
  setRackHover(rackSlotAtPoint(x,y,rackBounds.current,rack.length,rackTileSize));
 }
 function startDrag(index:number,x:number,y:number,grab:TileGrab,sourceCell:number|null=null){
  if(!playable||exchange||(sourceCell===null&&used.has(index)))return;
  const pending=sourceCell===null?undefined:draft.find(p=>p.cell===sourceCell&&p.rackIndex===index);
  if(sourceCell!==null&&!pending)return;
  const ghostWidth=Math.max(80,grab.width*1.6),ghostHeight=ghostWidth;
  const enlargedGrab={offsetX:grab.offsetX*ghostWidth/grab.width,offsetY:grab.offsetY*ghostHeight/grab.height,width:ghostWidth,height:ghostHeight};
  const active={index,letter:pending?.letter??rack[index],sourceCell,value:rack[index]==='?'?0:points[rack[index]],grab:enlargedGrab,x,y,ready:false};dragRef.current=active;
  setDrag({...active});setDragReady(false);setSelected(null);bounds.current=null;rackBounds.current=null;
  rootRef.current?.measure((_x,_y,_w,_h,pageX,pageY)=>{
   if(dragRef.current!==active)return;
   origin.current={x:pageX,y:pageY};active.ready=true;
   moveDrag(active.x,active.y);setDragReady(true);
  });
  rackRef.current?.measure((_x,_y,rw,rh,pageX,pageY)=>{
   if(dragRef.current!==active)return;
   rackBounds.current={x:pageX,y:pageY,width:rw,height:rh};moveDrag(active.x,active.y);
  });
  boardRef.current?.measure((_x,_y,bw,bh,pageX,pageY)=>{
   if(dragRef.current!==active)return;
   bounds.current={x:pageX,y:pageY,width:bw,height:bh};moveDrag(active.x,active.y);
  });
 }
 function propose(cell:number,rackIndex:number){
  if(!playable||exchange||game?.board[cell]||draft.some(p=>p.cell===cell)||used.has(rackIndex))return;
  if(rack[rackIndex]==='?'){setJoker({cell,rackIndex});return;}
  setDraft(d=>[...d,{cell,rackIndex,letter:rack[rackIndex]}]);setSelected(null);
 }
 function recoverDraft(index?:number){
  cancelDrag();setSelected(null);setJoker(null);
  setDraft(d=>index===undefined?[]:d.filter(p=>p.rackIndex!==index));
 }
 function dropDrag(x:number,y:number){
  const active=dragRef.current;if(!active)return;
  const finishDrop=(rackRect:BoardBounds|null)=>{
   if(dragRef.current!==active)return;
   const rackTarget=rackSlotAtPoint(x,y,rackRect,rack.length,rackTileSize);
   const cell=cellAtPoint(x,y,bounds.current);
   if(rackTarget!==null){
    if(active.sourceCell!==null)recoverDraft(active.index);
    setOrder(o=>reorderRack(o,active.index,rackTarget,rack.length));
   }else if(cell!==null){
    if(active.sourceCell!==null)setDraft(d=>relocateDraft(d,active.index,cell,!!game?.board[cell]));
    else propose(cell,active.index);
   }
   cancelDrag();
  }
  // Re-measure at release: scrolling, layout changes and the keyboard can make
  // the rectangle captured at pickup stale. Never discard a tile on rejection.
  if(rackRef.current)rackRef.current.measure((_x,_y,width,height,pageX,pageY)=>finishDrop({x:pageX,y:pageY,width,height}));
  else finishDrop(rackBounds.current);
 }
 function place(cell:number){
  if(!playable||exchange)return;
  const pending=draft.find(p=>p.cell===cell);if(pending){recoverDraft(pending.rackIndex);return;}
  if(selected!==null)propose(cell,selected);
 }
 function select(index:number){
  if(!playable)return;
  if(exchange){setExchangeSelection(a=>a.includes(index)?a.filter(i=>i!==index):[...a,index]);return;}
  setSelected(index);
 }
 function loadDevScenario(scenario:DevScenario){
  if(!game||saving)return;
  try{
   const fixture=createDevScenario(scenario,lexicon);
   if(!devBackup.current)devBackup.current={game,draft:[...draft],order:[...order],revealed};
   cancelDrag();setDevActive(true);setDevOpen(false);setMenuOpen(false);setGame(fixture.game);setDraft(fixture.draft);
   setOrder([0,1,2,3,4,5,6]);setRevealed(true);setSelected(null);setExchange(false);setExchangeSelection([]);setJoker(null);setError('');setFeedbackDetails(false);setCelebration(null);setResultDismissed(false);
  }catch(e){setError((e as Error).message);}
 }
 function leaveDevMode(){
  const backup=devBackup.current;if(!backup)return;
  cancelDrag();setGame(backup.game);setDraft(backup.draft);setOrder(backup.order);setRevealed(backup.revealed);
  setDevActive(false);setDevOpen(false);setMenuOpen(false);setSelected(null);setExchange(false);setExchangeSelection([]);setJoker(null);setError('');setFeedbackDetails(false);setCelebration(null);setResultDismissed(false);devBackup.current=null;
 }
 function perform(action:()=>Game,command?:GameCommand){
  if(remote){
   if(!command||!game||saving||game.status!=='playing'||(command.kind==='resign'?viewer<0:!playable))return;
   setSaving(true);setError('');
   remote.onAction(command).then(next=>commit(next)).catch(e=>setError((e as Error).message)).finally(()=>setSaving(false));
  }else try{void commit(finishIfBlocked(action(),lexicon));}catch(e){setError((e as Error).message);}
 }
 return <SafeAreaView edges={['top','bottom','left','right']} style={s.safe}><ScrollView scrollEnabled={!drag} showsVerticalScrollIndicator={false} contentContainerStyle={{flexGrow:1}}><View testID="game-root" ref={rootRef} collapsable={false} style={[s.root,{minHeight:Math.max(height-insets.top-insets.bottom,boardWidth+349)}]}><StatusBar style="dark"/>
 <Image accessible={false} source={require('../assets/floral-corner-left.png')} style={s.flowers}/>
 {devActive&&<View style={s.devBadge}><Text style={s.devBadgeText}>DEV</Text></View>}
 <View style={s.header}>
 {visiblePlayers.map((p,i)=>{const active=game?.current===i&&game?.status==='playing',inactive=game?.status==='playing'&&!active;return <React.Fragment key={i}><View style={[s.player,active&&s.active,inactive&&s.inactivePlayer]}><UserAvatar name={p.name} avatarUrl={p.avatarUrl} size={active?38:inactive?26:34}/><View style={s.playerDetails}><Text numberOfLines={1} style={[s.name,active&&{fontSize:16},inactive&&{fontSize:12}]}>{p.name}</Text><Text style={[s.score,active&&{fontSize:31},inactive&&{fontSize:21}]}>{p.score}</Text></View>{active&&<View style={s.turnDot}/>}</View>{i===0&&<IconButton icon={devActive?"flask-outline":"time-outline"} label={devActive?"Mode développeur actif":"Historique des coups"} onPress={()=>devActive?setDevOpen(true):setHistoryOpen(true)}/>}</React.Fragment>;})}
 </View>
 {game?<><View style={s.boardStage}>
 <View style={s.opponentZone} accessible accessibilityLabel={`${opponent?.name} : ${opponent?.rack.length??0} lettres restantes, faces cachées`}><View style={[s.opponentRack,{width:boardWidth}]}>{Array.from({length:opponent?.rack.length??0},(_,i)=><TileFace key={i} size={rackTileSize} back/>)}</View></View>
 <View style={s.boardFrame}><View testID="game-board" ref={boardRef} collapsable={false} style={[s.board,{width:boardWidth,height:boardWidth}]}>{Array.from({length:225},(_,i)=>{
  const bonus=bonusAt(i),pending=draft.find(p=>p.cell===i),tile=pending?{letter:pending.letter,blank:rack[pending.rackIndex]==='?'}:game.board[i];
  const colors:Record<string,string>={MT:'#cf287d',MD:'#f38b9c',LT:'#7853b4',LD:'#99b8f7','★':'#be85db'};
  const value=tile?(tile.blank?0:points[tile.letter]):null;
  if(pending)return <DraggableTile key={i} compact size={cellSize-2} letter={pending.letter} value={value??0} selected={false} dragging={drag?.sourceCell===i} style={[s.cell,{left:(i%15)*cellSize+1,top:Math.floor(i/15)*cellSize+1,width:cellSize-2,height:cellSize-2,backgroundColor:'transparent'}]} onStart={(x,y,grab)=>startDrag(pending.rackIndex,x,y,grab,i)} onMove={moveDrag} onDrop={dropDrag} onCancel={cancelDrag} onSelect={()=>place(i)}/>;
  return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Ligne ${Math.floor(i/15)+1}, colonne ${i%15+1}, ${tile?tile.letter+(tile.blank?' joker':'')+', '+value+' points':bonus||'vide'}`} onPress={()=>place(i)} style={[s.cell,{left:(i%15)*cellSize+1,top:Math.floor(i/15)*cellSize+1,width:cellSize-2,height:cellSize-2,backgroundColor:tile?'transparent':colors[bonus]||'#ebe5f1'}]}>
   {tile?<TileFace size={cellSize-2} letter={tile.letter} value={value??0}/>:<Text pointerEvents="none" style={{fontSize:Math.max(8,cellSize*.35),fontWeight:'700',color:'white'}}>{bonus}</Text>}
  </Pressable>;
 })}
 {preview?.outlines.map((outline,i)=><View key={outline.join(',')} pointerEvents="none" style={[s.wordOutline,cellsRectangle(outline,cellSize),{borderColor:preview.valid?'#157a48':'#c5354f',backgroundColor:preview.valid?'#157a4808':'#c5354f08',zIndex:2+i}]}/>)}
 {preview&&mainRect&&<Pressable accessibilityRole="button" accessibilityLiveRegion="polite" accessibilityLabel={preview.valid?`Coup valide, ${preview.score} points. Afficher le détail.`:`Coup invalide, zéro point. ${preview.reason}`} onPress={()=>setFeedbackDetails(true)} style={[s.scoreBadge,{left:Math.max(0,Math.min(boardWidth-96,mainRect.left+mainRect.width-72)),top:Math.max(0,mainRect.top-30),backgroundColor:preview.valid?'#157a48':'#c5354f'}]}><Text style={s.scoreBadgeText}>{preview.valid?'✓':'✕'} {preview.score} pt{preview.score>1?'s':''}</Text></Pressable>}
 {hover!==null&&drag&&<View pointerEvents="none" style={s.targetLayer}>
  <View style={[s.dropTarget,{left:(hover%15)*cellSize-3,top:Math.floor(hover/15)*cellSize-3,width:cellSize+6,height:cellSize+6,borderColor:game.board[hover]||draft.some(p=>p.cell===hover&&p.rackIndex!==drag.index)?'#c5354f':'#4b0565',backgroundColor:game.board[hover]||draft.some(p=>p.cell===hover)?'#ffdde088':'#ffe69a99'}]}/>
 </View>}
 </View></View>
 <View style={[s.lastMoveZone,!lastTurn&&{flex:0,minHeight:8}]}>{lastTurn&&<Pressable accessibilityRole="button" accessibilityLabel="Dernier coup. Ouvrir l’historique" onPress={()=>setHistoryOpen(true)} style={s.lastMove}><Ionicons name={lastTurn.kind==='resign'?'flag-outline':lastTurn.kind==='play'?'text-outline':lastTurn.kind==='pass'?'play-skip-forward-outline':'swap-horizontal-outline'} size={19} color={purple}/><Text numberOfLines={1} style={s.lastMoveText}>{visiblePlayers[lastTurn.player].name} · {lastTurn.kind==='play'?lastTurn.words.join(', '):lastTurn.kind==='resign'?'Abandon':lastTurn.kind==='pass'?'Passe':'Échange'}</Text>{lastTurn.kind==='play'&&<Text style={s.lastMoveScore}>+{lastTurn.score}</Text>}<Ionicons name="chevron-forward" size={15} color="#9b78b0"/></Pressable>}</View>
 </View>
 {!playable&&remote&&game.status==='playing'&&<Text accessibilityLiveRegion="polite" style={{textAlign:'center',color:purple,padding:6}}>Au tour de {visiblePlayers[game.current].name}</Text>}
 <View style={s.bottom}>
 {playable||remote?<><View testID="current-rack" ref={rackRef} collapsable={false} style={[s.rack,{width:boardWidth}]}>{order.filter(i=>i<rack.length).map((i,slot)=>exchange?<Pressable key={i} onPress={()=>select(i)} style={[s.exchangeTile,{width:rackTileSize,height:rackTileSize},exchangeSelection.includes(i)&&s.chosen]}><TileFace size={rackTileSize} letter={rack[i]} value={points[rack[i]]}/></Pressable>:<DraggableTile key={(used.has(i)?'placed-':'rack-')+i} size={rackTileSize} style={rackHover===slot?{backgroundColor:'#ffe69a',borderColor:'#ac743b'}:undefined} letter={used.has(i)?null:rack[i]} selected={selected===i} dragging={drag?.index===i} onStart={(x,y,grab)=>startDrag(i,x,y,grab)} onMove={moveDrag} onDrop={dropDrag} onCancel={cancelDrag} onSelect={()=>select(i)}/>)}</View></>:<View style={[s.hiddenRack,{width:boardWidth}]}>{Array.from({length:7},(_,i)=><TileFace key={i} size={rackTileSize} back/>)}</View>}
 <View style={s.toolbar}>
 <View style={s.toolbarSide}><IconButton icon="menu-outline" label="Menu de la partie" disabled={saving} onPress={()=>setMenuOpen(true)}/>
 <IconButton icon={exchange?'close-outline':'recover-tiles'} label={exchange?'Annuler l’échange':'Reprendre toutes les lettres'} disabled={!playable||(!exchange&&!draft.length)} onPress={()=>{if(exchange){setExchange(false);setExchangeSelection([]);}else recoverDraft();}}/>
 </View>
 {saving?<View style={s.primaryButton}><ActivityIndicator color="white"/></View>:<IconButton primary icon={game.status==='finished'?'trophy-outline':exchange?'checkmark-outline':'paper-plane-outline'} label={game.status==='finished'?'Résultat de la partie':exchange?'Confirmer l’échange':'Valider le mot'} count={exchange?exchangeSelection.length:undefined} disabled={game.status!=='finished'&&(!playable||(exchange?!exchangeSelection.length:!preview?.valid))} onPress={()=>{if(game.status==='finished')setResultDismissed(false);else perform(()=>exchange?exchangeTiles(game,exchangeSelection):playMove(game,draft,lexicon),exchange?{kind:'exchange',indices:exchangeSelection}:{kind:'play',placements:draft});}}/>}
 <View style={s.toolbarSide}><IconButton icon="shuffle-outline" label="Mélanger le chevalet" disabled={!playable||!!draft.length||exchange} onPress={()=>{setOrder(shuffle(order));setSelected(null);}}/>
 <IconButton icon="swap-horizontal-outline" label="Choisir les lettres à échanger" disabled={!playable||!!draft.length||game.bag.length<7||exchange} onPress={()=>{setExchange(true);setSelected(null);}}/>
 <IconButton icon="bag-handle-outline" label={game.bag.length+' lettres restantes dans le sac'} count={game.bag.length} onPress={()=>setInfoOpen(true)}/>
 </View></View></View>
 </>:<View style={s.loading}><ActivityIndicator size="large" color={purple}/></View>}
 {drag&&dragReady&&<Animated.View pointerEvents="none" style={[s.dragTile,{width:drag.grab.width,height:drag.grab.height,transform:dragPoint.getTranslateTransform()}]}><TileFace size={drag.grab.width} letter={drag.letter} value={drag.value}/></Animated.View>}
 <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={()=>setMenuOpen(false)}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Text style={s.title}>Scrabblya</Text><IconButton icon="close-outline" label="Fermer le menu" onPress={()=>setMenuOpen(false)}/></View>

 {game?.status==='playing'&&<Action icon="flag-outline" label="Abandonner la partie" disabled={saving} onPress={()=>{setMenuOpen(false);setConfirmResign(true);}}/>}
 <Action icon="time-outline" label="Historique" onPress={()=>{setMenuOpen(false);setHistoryOpen(true);}}/>
 <Action icon="play-skip-forward-outline" label="Passer mon tour" disabled={!playable||!!draft.length} onPress={()=>{setMenuOpen(false);perform(()=>passTurn(game!),{kind:'pass'});}}/>
 {!remote&&<Action icon="refresh-outline" label="Nouvelle partie" onPress={()=>{setMenuOpen(false);setConfirmNew(true);}}/>}
 {!remote&&<Action icon="flask-outline" label="Mode développeur" disabled={saving||!game} onPress={()=>{setMenuOpen(false);setDevOpen(true);}}/>}
 <Action icon="information-circle-outline" label="Informations" onPress={()=>{setMenuOpen(false);setInfoOpen(true);}}/>
 </View></View></Modal>
 <Modal visible={confirmResign} transparent animationType="fade" onRequestClose={()=>setConfirmResign(false)}><View style={s.backdrop}><View style={s.modal}><Text style={s.title}>Abandonner la partie ?</Text><Text style={s.text}>Votre adversaire remportera la partie. Elle sera conservée dans les parties terminées.</Text><Action icon="flag-outline" label="Confirmer l’abandon" disabled={saving||game?.status!=='playing'} onPress={()=>{setConfirmResign(false);perform(()=>resignGame(game!,viewer),{kind:'resign'});}}/><Action icon="close-outline" label="Continuer la partie" onPress={()=>setConfirmResign(false)}/></View></View></Modal>
 <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={()=>setHistoryOpen(false)}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Text style={s.title}>Historique</Text><IconButton icon="close-outline" label="Fermer l’historique" onPress={()=>setHistoryOpen(false)}/></View><ScrollView style={{maxHeight:420}}>{game?.history.length?[...game.history].reverse().map((t,i)=><View key={game.history.length-i} style={s.historyItem}><Ionicons name={t.kind==='resign'?'flag-outline':t.kind==='play'?'text-outline':t.kind==='pass'?'play-skip-forward-outline':'swap-horizontal-outline'} size={22} color={purple}/><View style={{flex:1}}><Text style={s.name}>{visiblePlayers[t.player].name}</Text><Text style={s.subtitle}>{t.kind==='play'?t.words.join(', '):t.kind==='resign'?'Abandon':t.kind==='pass'?'Passe':'Échange'}</Text></View><Text style={s.name}>{t.kind==='play'?'+'+t.score:'—'}</Text></View>):<Text style={s.subtitle}>Aucun coup joué.</Text>}</ScrollView></View></View></Modal>
 <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={()=>setInfoOpen(false)}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Text style={s.title}>La partie</Text><IconButton icon="close-outline" label="Fermer les informations" onPress={()=>setInfoOpen(false)}/></View><Text style={s.text}>{game?.bag.length??0} lettres dans le sac · {game?.passes??0}/6 passes consécutives.</Text><Text style={s.text}>Glissez les lettres pour jouer ou organiser le chevalet. Les deux flèches vers le bas reprennent votre brouillon ; les flèches croisées mélangent les lettres. L’échange utilise votre tour.</Text><Text style={s.subtitle}>{remote?'Partie sauvegardée en ligne.':'Partie locale sauvegardée sur ce téléphone.'} Lexique familial Grammalecte 7.7 · {lexiconMetadata.count.toLocaleString('fr-FR')} mots · MPL 2.0 · différent de l’ODS.</Text></View></View></Modal>
 <Modal visible={!remote&&!!game&&game.status==='playing'&&!revealed&&!saving&&!menuOpen&&!historyOpen&&!infoOpen&&!confirmNew&&!confirmResign&&!devOpen&&!celebration} transparent animationType="fade" onRequestClose={onBack}><View style={s.backdrop}><View style={s.handoff}><Ionicons name="phone-portrait-outline" size={38} color={purple}/><Text style={s.title}>{visiblePlayers[game?.current??0]?.name}</Text><IconButton primary icon="eye-outline" label="Découvrir mon chevalet" onPress={()=>setRevealed(true)}/></View></View></Modal>
 <Modal visible={game?.status==='finished'&&!resultDismissed&&!celebration&&!devOpen} transparent animationType="fade" onRequestClose={()=>setResultDismissed(true)}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Ionicons name="trophy-outline" size={36} color={purple}/><IconButton icon="close-outline" label="Fermer le résultat" onPress={()=>setResultDismissed(true)}/></View><Text style={s.title}>Partie terminée</Text><Text style={s.text}>{game&&(game.endReason==='resignation'?visiblePlayers[1-game.resignedBy!].name+' remporte la partie par abandon !':visiblePlayers[0].score===visiblePlayers[1].score?'Égalité !':visiblePlayers[visiblePlayers[0].score>visiblePlayers[1].score?0:1].name+' remporte la partie !')}</Text><Text style={s.subtitle}>{game?.endReason==='resignation'?visiblePlayers[game.resignedBy!].name+' a abandonné. Les scores sont conservés.':game?.endReason==='blocked'?'Aucun coup possible, même après les échanges autorisés. Les reliquats ont été décomptés.':'Les reliquats ont été décomptés.'}</Text>
 {!!rematchError&&<Text accessibilityRole="alert" style={s.text}>{rematchError}</Text>}
 {onRematch?<Action icon="mail-outline" label={inviteSent?'Invitation envoyée':rematchBusy?'Envoi…':'Réinviter cet adversaire'} disabled={rematchBusy||inviteSent} onPress={()=>{if(rematchBusy||inviteSent)return;setRematchBusy(true);setRematchError('');void onRematch().then(()=>setInviteSent(true)).catch(e=>setRematchError((e as Error).message)).finally(()=>setRematchBusy(false));}}/>:!remote&&<Action icon="refresh-outline" label="Rejouer" disabled={saving} onPress={()=>{void commit(createProfileGame(participantSnapshot.current,lexicon.id));}}/>}
 <Action icon="home-outline" label="Retour à l’accueil" onPress={onBack}/>
 </View></View></Modal>
 <Modal visible={!!error} transparent animationType="fade" onRequestClose={()=>setError('')}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Ionicons name="alert-circle-outline" size={30} color="#b02b4a"/><IconButton icon="close-outline" label="Fermer l’erreur" onPress={()=>setError('')}/></View><Text style={s.text}>{error}</Text>{!game&&<Action icon="refresh-outline" label="Nouvelle partie" onPress={()=>{setError('');setConfirmNew(true);}}/>}</View></View></Modal>
 <Modal visible={devOpen} transparent animationType="fade" onRequestClose={()=>setDevOpen(false)}><View style={s.backdrop}><View style={s.modal}><View style={s.row}><Text style={s.title}>Mode développeur</Text><IconButton icon="close-outline" label="Fermer le mode développeur" onPress={()=>setDevOpen(false)}/></View><Text style={s.subtitle}>Tests temporaires. Votre partie et sa sauvegarde sont conservées.</Text><ScrollView style={{maxHeight:400}} contentContainerStyle={{gap:10}}>
 <Action icon="remove-outline" label="Fin : égalité (200 / 200)" onPress={()=>loadDevScenario('tie')}/>
 <Action icon="trophy-outline" label="Fin : J1 gagne (240 / 200)" onPress={()=>loadDevScenario('player1-wins')}/>
 <Action icon="trophy-outline" label="Fin : J2 gagne (200 / 240)" onPress={()=>loadDevScenario('player2-wins')}/>
 <Action icon="text-outline" label="Scrabble : sept lettres à poser" onPress={()=>loadDevScenario('scrabble-rack')}/>
 <Action icon="paper-plane-outline" label="Scrabble : prêt à valider (66 pts)" onPress={()=>loadDevScenario('scrabble-ready')}/>
 {devActive&&<Action icon="arrow-undo-outline" label="Revenir à ma partie" onPress={leaveDevMode}/>}
 </ScrollView></View></View></Modal>
 <Modal visible={celebration!==null} transparent animationType="fade" onRequestClose={()=>setCelebration(null)}><View style={s.backdrop}><View style={s.handoff}><Ionicons name="sparkles" size={48} color="#a16a30"/><Text style={s.title}>Scrabble !</Text><Text style={s.bonusValue}>+50</Text><Text style={s.subtitle}>Bonus sept lettres · {celebration?.score} points au total</Text><IconButton primary icon="checkmark-outline" label="Continuer après le Scrabble" onPress={()=>setCelebration(null)}/></View></View></Modal>
 <Modal visible={feedbackDetails&&preview!==null} transparent animationType="fade" onRequestClose={()=>setFeedbackDetails(false)}><View style={s.backdrop}><View style={s.modal}><Text style={s.title}>{preview?.valid?'Détail du coup':'Coup invalide'}</Text>{preview?.valid?<><Text style={s.text}>{preview.words.map(w=>w.word+' : '+w.score+' points').join('\n')}{draft.length===7?'\nBonus sept lettres : 50 points':''}</Text><Text style={s.name}>Total : {preview.score} points</Text></>:<Text style={s.text}>{preview?.reason}</Text>}<Action icon="close-outline" label="Fermer" onPress={()=>setFeedbackDetails(false)}/></View></View></Modal>
 <Modal visible={joker!==null} transparent animationType="fade" onRequestClose={()=>setJoker(null)}><View style={s.backdrop}><View style={s.modal}><Text style={s.title}>Quelle lettre représente le joker ?</Text><Text style={s.subtitle}>Il gardera cette lettre et vaudra zéro point.</Text><View style={s.alphabet}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter=><Pressable accessibilityRole="button" accessibilityLabel={`Joker ${letter}`} key={letter} onPress={()=>{if(joker)setDraft(d=>[...d,{...joker,letter}]);setJoker(null);setSelected(null);}} style={s.alphabetKey}><Text style={s.name}>{letter}</Text></Pressable>)}</View><Action icon="close-outline" label="Annuler" onPress={()=>setJoker(null)}/></View></View></Modal>
 <Modal visible={confirmNew} transparent animationType="fade" onRequestClose={()=>setConfirmNew(false)}><View style={s.backdrop}><View style={s.modal}><Text style={s.title}>Recommencer une partie ?</Text><Text style={s.text}>{devActive?'Le scénario de test sera remplacé.':'La partie locale enregistrée sera remplacée.'}</Text><Action icon="refresh-outline" label="Recommencer" onPress={()=>{setConfirmNew(false);void commit(createProfileGame(participantSnapshot.current,lexicon.id));}}/><Action icon="close-outline" label="Conserver ma partie" onPress={()=>setConfirmNew(false)}/></View></View></Modal>
 </View></ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({
 devBadge:{position:'absolute',top:0,right:4,zIndex:10,backgroundColor:'#815133',borderRadius:5,paddingHorizontal:5,paddingVertical:2},devBadgeText:{fontSize:9,fontWeight:'800',color:'white'},bonusValue:{fontSize:48,fontWeight:'800',color:'#815133'},
 safe:{flex:1,backgroundColor:'#e9d9f3'},root:{flex:1,width:'100%',alignSelf:'center',backgroundColor:'#f3eafa'},flowers:{position:'absolute',bottom:80,left:0,width:170,height:270,opacity:.18},
 header:{height:86,flexDirection:'row',alignItems:'center',paddingHorizontal:8,gap:2,backgroundColor:'#e9d9f3'},player:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:7,paddingVertical:9,paddingHorizontal:6,borderRadius:20,borderWidth:2,borderColor:'transparent'},active:{flex:1.5,backgroundColor:'#fff9ff',borderColor:'#b38dcc'},inactivePlayer:{flex:.75,paddingVertical:6,gap:5,opacity:.72},activeAvatar:{width:38,height:38,borderRadius:19},inactiveAvatar:{width:26,height:26,borderRadius:13},playerDetails:{flex:1,minWidth:0},avatar:{width:34,height:34,borderRadius:17,backgroundColor:'#d5bce6',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:17,fontWeight:'700',color:purple},turnDot:{position:'absolute',right:9,bottom:9,width:7,height:7,borderRadius:4,backgroundColor:'#4d9d6e'},name:{fontSize:15,fontWeight:'700',color:purple},score:{fontSize:27,fontWeight:'800',color:purple},
 boardStage:{flex:1,alignItems:'center'},opponentZone:{flex:1,minHeight:56,width:'100%',paddingHorizontal:0,justifyContent:'center',alignItems:'center'},opponentRack:{alignSelf:'center',flexDirection:'row',justifyContent:'center',gap:4,padding:4},opponentTile:{height:50,borderRadius:5,borderWidth:1,borderColor:'#d2bbdf',backgroundColor:'#e8dcf0',justifyContent:'center',alignItems:'center'},boardFrame:{paddingTop:8},lastMoveZone:{flex:1,minHeight:52,width:'100%',justifyContent:'center',alignItems:'center',paddingHorizontal:22,paddingVertical:12},lastMove:{flexDirection:'row',alignItems:'center',gap:7,borderRadius:16,paddingVertical:5,paddingHorizontal:10,backgroundColor:'#ffffff99',maxWidth:'100%'},lastMoveText:{flexShrink:1,fontSize:12,color:'#775686'},lastMoveScore:{fontSize:13,fontWeight:'800',color:purple},board:{position:'relative',backgroundColor:'white',borderRadius:6},cell:{position:'absolute',borderRadius:3,alignItems:'center',justifyContent:'center'},boardPoints:{position:'absolute',right:1,bottom:0,color:purple,fontWeight:'700',lineHeight:10},wordOutline:{position:'absolute',borderWidth:2,borderRadius:5},scoreBadge:{position:'absolute',minWidth:72,height:27,paddingHorizontal:8,borderRadius:14,alignItems:'center',justifyContent:'center',zIndex:8,elevation:3},scoreBadgeText:{color:'white',fontSize:13,fontWeight:'800'},targetLayer:{position:'absolute',left:0,top:0,right:0,bottom:0,zIndex:20},dropTarget:{position:'absolute',borderWidth:3,borderRadius:6,shadowColor:purple,shadowOpacity:.5,shadowRadius:5,elevation:4},
 bottom:{backgroundColor:'#e9d9f3',paddingTop:6},rack:{alignSelf:'center',flexDirection:'row',justifyContent:'center',gap:4,padding:4,borderRadius:10,backgroundColor:'#bc9aab22'},hiddenRack:{alignSelf:'center',flexDirection:'row',justifyContent:'center',gap:4,padding:4,borderRadius:10,backgroundColor:'#bc9aab22'},tileBack:{flex:1,borderRadius:8,backgroundColor:'#eee4f5',alignItems:'center',justifyContent:'center'},toolbar:{height:68,flexDirection:'row',alignItems:'center',paddingHorizontal:5},toolbarSide:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},iconButton:{width:40,height:44,alignItems:'center',justifyContent:'center',borderRadius:22},primaryButton:{width:64,height:48,borderRadius:24,backgroundColor:purple,alignItems:'center',justifyContent:'center'},countBadge:{position:'absolute',bottom:0,right:0,minWidth:19,paddingHorizontal:3,height:18,borderRadius:9,backgroundColor:'#fff9ff',color:purple,textAlign:'center',fontSize:11,fontWeight:'800'},
 dragTile:{position:'absolute',top:0,left:0,width:80,height:80,borderRadius:9,backgroundColor:'transparent',justifyContent:'center',alignItems:'center',elevation:12,zIndex:100,opacity:.7},rackLetter:{fontSize:27,fontWeight:'700',color:purple},points:{position:'absolute',right:4,bottom:2,fontSize:10,color:purple},exchangeTile:{flexShrink:0,borderRadius:8,backgroundColor:'transparent',justifyContent:'center',alignItems:'center'},chosen:{backgroundColor:'#b48bcb55',transform:[{translateY:-5}]},
 loading:{flex:1,alignItems:'center',justifyContent:'center'},backdrop:{flex:1,backgroundColor:'#25103799',justifyContent:'center',padding:20},modal:{maxHeight:'85%',backgroundColor:'#fff9ff',padding:20,borderRadius:24,gap:14},handoff:{alignSelf:'center',alignItems:'center',minWidth:220,padding:28,gap:18,borderRadius:28,backgroundColor:'#fff9ff'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},title:{fontSize:22,fontWeight:'700',color:purple},text:{fontSize:15,color:purple,lineHeight:22},subtitle:{fontSize:13,color:'#756b81',lineHeight:20},action:{flexDirection:'row',alignItems:'center',gap:12,padding:13,minHeight:48,borderRadius:14,backgroundColor:'#eee3f6'},actionText:{fontSize:15,color:purple,fontWeight:'600'},historyItem:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#e8dced'},alphabet:{flexDirection:'row',flexWrap:'wrap',gap:8},alphabetKey:{width:44,height:44,backgroundColor:'#ebdef5',borderRadius:8,justifyContent:'center',alignItems:'center'},
});
