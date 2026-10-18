import React, { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { points } from './board';
import { TileFace } from './TileFace';
import type { TileGrab } from './dropTarget';

type Props = {
 letter: string | null; selected: boolean; dragging: boolean; compact?:boolean; size?:number; style?:StyleProp<ViewStyle>; value?:number;
 onStart: (x: number, y: number, grab: TileGrab) => void;
 onMove: (x: number, y: number) => void; onDrop: (x: number, y: number) => void;
 onCancel: () => void; onSelect: () => void;
};
type TouchSession = {x:number;y:number;startX:number;startY:number;started:boolean};
export function DraggableTile(props: Props) {
 const current=useRef(props),tileRef=useRef<View>(null),session=useRef<TouchSession|null>(null);
 useLayoutEffect(()=>{current.current=props;});
 // PanResponder only stores these callbacks. Ref reads happen in touch handlers.
 // eslint-disable-next-line react-hooks/refs
 const [responder]=useState(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>!!current.current.letter,
  onPanResponderGrant:e=>{
   const {pageX:x,pageY:y}=e.nativeEvent;
   const active:TouchSession={x,y,startX:x,startY:y,started:false};session.current=active;
   // measure() and pageX/pageY share the React root coordinate system. Avoid
   // mixing measureInWindow() with touch coordinates (Android status-bar inset).
   tileRef.current?.measure((_x,_y,width,height,pageX,pageY)=>{
    if(session.current!==active)return;
    active.started=true;
    current.current.onStart(active.x,active.y,{offsetX:x-pageX,offsetY:y-pageY,width,height});
   });
  },
  onPanResponderMove:e=>{
   const active=session.current;if(!active)return;
   active.x=e.nativeEvent.pageX;active.y=e.nativeEvent.pageY;
   if(active.started)current.current.onMove(active.x,active.y);
  },
  onPanResponderRelease:e=>{
   const active=session.current;session.current=null;
   const {pageX:x,pageY:y}=e.nativeEvent;
   if(active&&Math.abs(x-active.startX)<5&&Math.abs(y-active.startY)<5){current.current.onCancel();current.current.onSelect();}
   else if(active?.started)current.current.onDrop(x,y);
   else current.current.onCancel();
  },
  onPanResponderTerminationRequest:()=>false,
  onPanResponderTerminate:()=>{session.current=null;current.current.onCancel();},
 }));
 return <View ref={tileRef} collapsable={false} {...responder.panHandlers} accessible accessibilityRole="button"
  accessibilityLabel={`Lettre ${props.letter||'posée'}`} accessibilityHint="Glissez vers le plateau ou touchez pour sélectionner"
  accessibilityState={{disabled:!props.letter,selected:props.selected}}
  accessibilityActions={[{name:'activate',label:'Sélectionner la lettre'}]}
  onAccessibilityAction={()=>{if(current.current.letter)current.current.onSelect();}}
  style={[styles.tile,{width:props.size??45,height:props.size??45},props.style,props.selected&&styles.selected,props.dragging&&{opacity:.2}]}>
  <TileFace size={props.size??45} letter={props.letter} value={props.value??(props.letter?points[props.letter]:0)}/></View>;
}
const styles=StyleSheet.create({
 tile:{flexShrink:0,justifyContent:'center',alignItems:'center',borderRadius:7},
 selected:{transform:[{translateY:-5}],backgroundColor:'#b48bcb55'},
});

