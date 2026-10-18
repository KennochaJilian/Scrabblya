import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props={size:number;letter?:string|null;value?:number;back?:boolean};
// The supplied artwork has a transparent outer margin. Crop it in layout only;
// the original PNGs are preserved, and both faces use the same square frame.
export function TileFace({size,letter,value=0,back=false}:Props){
 const empty=!back&&!letter;
 return <View pointerEvents="none" accessible={false} style={[s.face,{width:size,height:size,borderRadius:size*.13},empty&&s.empty]}>
 {!empty&&<Image source={back?require('../assets/tile-back.png'):require('../assets/tile-front-v2.png')} resizeMode="stretch" style={s.art}/>}
 {!back&&!!letter&&<>
 <View style={s.letterBox}><Text allowFontScaling={false} style={[s.engraved,{fontSize:size*.56,lineHeight:size*.66,textShadowOffset:{width:.5,height:.8}}]}>{letter}</Text></View>
 <View style={s.valueBox}><Text allowFontScaling={false} style={[s.engraved,{fontSize:Math.max(7,size*.21),lineHeight:Math.max(9,size*.25),textShadowOffset:{width:.4,height:.6}}]}>{value}</Text></View>
 </>}
 </View>;
}
const s=StyleSheet.create({
 face:{position:'relative',overflow:'hidden'},empty:{borderWidth:1,borderStyle:'dashed',borderColor:'#b18ba944',backgroundColor:'#b18ba911'},
 art:{position:'absolute',left:'-9%',top:'-9%',width:'118%',height:'118%'},
 letterBox:{position:'absolute',left:'19%',top:'18%',width:'59%',height:'65%',alignItems:'center',justifyContent:'center'},
 valueBox:{position:'absolute',right:'6%',bottom:'6%',minWidth:'20%',alignItems:'center',justifyContent:'center'},
 engraved:{fontFamily:'serif',fontWeight:'900',color:'#69382d',includeFontPadding:false,textAlign:'center',textShadowColor:'#ffe7bf',textShadowRadius:.65},
});


