import React,{useEffect,useState} from 'react';
import {Alert,Pressable,Text,TextInput,View} from 'react-native';
import {api} from './api';
import {setCustomWords} from './lexicon';
export function CustomWordsAdmin(){
 const [words,setWords]=useState<string[]>([]),[word,setWord]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true;void api.customWords().then(list=>{if(alive){setWords(list);setCustomWords(list);}}).catch(e=>{if(alive)setMessage((e as Error).message);});return()=>{alive=false;};},[]);
 async function change(remove?:string){if(busy)return;setBusy(true);setMessage('');try{const list=remove?await api.deleteCustomWord(remove):await api.addCustomWord(word);setWords(list);setCustomWords(list);if(!remove)setWord('');setMessage(remove?'Mot retiré.':'Mot autorisé pour tous les joueurs.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <View style={{gap:12}}><Text style={{fontSize:23,fontWeight:'700',color:'#4b0565'}}>Mots supplémentaires</Text>
 <Text>Ajoutez un mot manquant au lexique après avoir vérifié sa validité. Les accents sont normalisés. Retirer un ajout ne modifie pas les coups déjà joués.</Text>
 <TextInput accessibilityLabel="Mot à autoriser" value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} maxLength={40} editable={!busy} style={{borderWidth:1,borderColor:'#d9cfdf',borderRadius:12,padding:14}}/>
 <Pressable accessibilityRole="button" disabled={busy||!word.trim()} onPress={()=>{void change();}} style={{backgroundColor:'#4b0565',padding:14,borderRadius:20,opacity:busy||!word.trim()?.4:1}}><Text style={{color:'white',textAlign:'center'}}>Autoriser le mot</Text></Pressable>
 {!!message&&<Text accessibilityLiveRegion="polite">{message}</Text>}
 {words.map(w=><View key={w} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text>{w}</Text><Pressable accessibilityRole="button" accessibilityLabel={'Retirer '+w} disabled={busy} onPress={()=>Alert.alert('Retirer ce mot ?',w,[{text:'Annuler',style:'cancel'},{text:'Retirer',style:'destructive',onPress:()=>{void change(w);}}])} style={{padding:12}}><Text>Retirer</Text></Pressable></View>)}
 </View>;
}
