import React,{useState} from 'react';
import { Image,StyleSheet,Text,View } from 'react-native';
export function UserAvatar({name,avatarUrl,size=40}:{name:string;avatarUrl?:string|null;size?:number}){
 const [failed,setFailed]=useState<string|null>(null);
 const uri=avatarUrl&&avatarUrl!==failed?avatarUrl:null;
 return <View style={[s.frame,{width:size,height:size,borderRadius:size/2}]}>{uri?<Image accessibilityLabel={`Avatar de ${name}`} source={{uri}} style={{width:size,height:size}} onError={()=>setFailed(uri)}/>:<Text style={[s.initial,{fontSize:size*.43}]}>{name.trim().charAt(0).toUpperCase()||'?'}</Text>}</View>;
}
const s=StyleSheet.create({frame:{overflow:'hidden',backgroundColor:'#d5bce6',alignItems:'center',justifyContent:'center'},initial:{fontWeight:'700',color:'#4b0565'}});
