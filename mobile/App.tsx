import React,{useEffect,useState} from 'react';
import { ActivityIndicator,Alert,Image,Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthProvider,useAuth } from './src/AuthContext';
import { api,uploadAvatar } from './src/api';
import type { PublicUser } from './src/apiClient';
import { UserAvatar } from './src/UserAvatar';
import { LocalGame } from './src/LocalGame';
const purple='#4b0565';
function Button({title,onPress,disabled=false,soft=false}:{title:string;onPress:()=>void;disabled?:boolean;soft?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,soft&&s.soft,disabled&&{opacity:.4}]}><Text style={[s.buttonText,soft&&{color:purple}]}>{title}</Text></Pressable>;}
export default function App(){return <AuthProvider><Application/></AuthProvider>;}
function Application(){
 const {user,loading,error:restoreError,retry}=useAuth();
 const [screen,setScreen]=useState<'home'|'game'|'profile'|'admin'>('home');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [users,setUsers]=useState<PublicUser[]>([]),[opponent,setOpponent]=useState<PublicUser|null>(null),[name,setName]=useState('');
 const [newName,setNewName]=useState(''),[newEmail,setNewEmail]=useState(''),[newPassword,setNewPassword]=useState('');
 useEffect(()=>{
  if(!user)return;
  let alive=true;
  api.users().then(list=>{if(alive)setUsers(list);}).catch(e=>{if(alive)setMessage((e as Error).message);});
  return ()=>{alive=false;};
 },[user]);
 async function execute(work:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await work();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function avatar(){
  try{
   if(__DEV__)console.info('[Scrabblya avatar] ouverture de la galerie');
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.7});
   if(result.canceled){if(__DEV__)console.info('[Scrabblya avatar] sélection annulée');return;}
   if(__DEV__)console.info('[Scrabblya avatar] photo sélectionnée');
   const asset=result.assets[0];if(asset.fileSize&&asset.fileSize>2097152){setMessage('Choisissez une image de moins de 2 Mo.');return;}
   await execute(async()=>{await uploadAvatar(asset.uri);setMessage('Avatar mis à jour.');});
  }catch(e){setMessage((e as Error).message);}
 }
 if(loading)return <View style={[s.root,s.center]}><ActivityIndicator size="large" color={purple}/></View>;
 if(user&&screen==='game'&&opponent)return <LocalGame participants={[user,opponent]} onBack={()=>setScreen('home')}/>;
 return <View style={s.root}><StatusBar style="dark"/><Image accessible={false} source={require('./assets/floral-corner-left.png')} style={s.flowers}/><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
 {!user?<>
 <Image source={require('./assets/alexandrya-login-logo.webp')} style={s.hero} resizeMode="contain"/><Text style={s.brand}>Scrabblya</Text><Text style={s.tagline}>Des lettres, des liens, de belles parties.</Text>
 <View style={s.card}><Text style={s.title}>Connexion</Text><Text style={s.label}>Email</Text><TextInput accessibilityLabel="Email" style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"/>
 <Text style={s.label}>Mot de passe</Text><View style={s.password}><TextInput accessibilityLabel="Mot de passe" style={{flex:1,padding:15,color:purple}} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoComplete="current-password"/><Pressable accessibilityRole="button" accessibilityLabel={visible?'Masquer le mot de passe':'Afficher le mot de passe'} onPress={()=>setVisible(!visible)} style={{padding:12}}><Ionicons name={visible?'eye-off-outline':'eye-outline'} size={22} color={purple}/></Pressable></View>
 {!!message&&<Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={s.notice}>{message}</Text>}
 <Button title={busy?'Connexion…':'Se connecter'} disabled={busy||!email.trim()||!password} onPress={()=>{Keyboard.dismiss();void execute(async()=>{await api.login(email,password);setPassword('');setScreen('home');});}}/>
 <Pressable onPress={()=>Alert.alert('Mot de passe oublié','Votre administrateur peut réinitialiser votre mot de passe.')}><Text style={s.link}>Mot de passe oublié ?</Text></Pressable><Text style={s.subtitle}>Comptes créés par un administrateur.</Text>
 </View>{!!restoreError&&<><Text style={s.notice}>{restoreError}</Text><Button soft title="Réessayer la session enregistrée" onPress={retry}/></>}
 </>:<>
 <View style={s.header}><View><Text style={s.brandSmall}>Scrabblya</Text><Text style={s.subtitle}>Bonjour {user.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Mon profil" onPress={()=>{setName(user.name);setMessage('');setScreen('profile');}}><UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={50}/></Pressable></View>
 {screen!=='home'&&<Button soft title="‹ Accueil" onPress={()=>{setMessage('');setScreen('home');}}/>}
 {screen==='home'?<>
 <Text style={s.heading}>Avec qui jouer ?</Text><Text style={s.subtitle}>Deux joueurs sur ce téléphone. Les parties entre téléphones arrivent ensuite.</Text>
 {users.filter(p=>p.id!==user.id).map(p=><Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Jouer avec ${p.name}`} onPress={()=>{setOpponent(p);setMessage('');setScreen('game');}} style={s.person}><UserAvatar name={p.name} avatarUrl={p.avatarUrl}/><Text style={s.personName}>{p.name}</Text><Ionicons name="chevron-forward" size={24} color={purple}/></Pressable>)}
 {users.filter(p=>p.id!==user.id).length===0&&<View style={s.card}><Text style={s.subtitle}>Aucun autre joueur disponible. Un administrateur doit créer les comptes familiaux.</Text></View>}
 <Button soft title="Actualiser les joueurs" disabled={busy} onPress={()=>{void execute(async()=>setUsers(await api.users()));}}/>
 {user.role==='admin'&&<Button title="Gestion des utilisateurs" onPress={()=>{setMessage('');setScreen('admin');}}/>}
 </>:screen==='profile'?<View style={s.card}>
 <Text style={s.title}>Mon profil</Text><View style={{alignItems:'center',gap:12}}><UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={90}/><Button soft title="Choisir un avatar" disabled={busy} onPress={()=>{void avatar();}}/></View>
 <Text style={s.label}>Nom</Text><TextInput accessibilityLabel="Nom du profil" style={s.input} value={name} onChangeText={setName} maxLength={80}/><Text style={s.subtitle}>{user.email} · {user.role==='admin'?'Administrateur':'Utilisateur'}</Text>
 <Button title="Enregistrer" disabled={busy||!name.trim()} onPress={()=>{void execute(async()=>{await api.updateName(name);setMessage('Profil mis à jour.');});}}/>
 <Button soft title="Se déconnecter" disabled={busy} onPress={()=>{void execute(async()=>{try{await api.logout();}finally{setUsers([]);setOpponent(null);setScreen('home');}});}}/>
 </View>:screen==='admin'&&user.role==='admin'?<View style={s.card}>
 <Text style={s.title}>Ajouter un utilisateur</Text><Text style={s.label}>Nom</Text><TextInput accessibilityLabel="Nom du nouvel utilisateur" style={s.input} value={newName} onChangeText={setNewName} maxLength={80}/>
 <Text style={s.label}>Email</Text><TextInput accessibilityLabel="Email du nouvel utilisateur" style={s.input} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none"/>
 <Text style={s.label}>Mot de passe initial</Text><TextInput accessibilityLabel="Mot de passe initial du nouvel utilisateur" style={s.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none"/>
 <Text style={s.subtitle}>12 caractères minimum. Le nouveau compte aura le rôle utilisateur.</Text><Button title="Créer le compte" disabled={busy||!newName.trim()||!newEmail.trim()||newPassword.length<12} onPress={()=>{void execute(async()=>{await api.createUser({name:newName.trim(),email:newEmail.trim(),password:newPassword});setNewName('');setNewEmail('');setNewPassword('');setUsers(await api.users());setMessage('Compte créé.');});}}/>
 {users.map(p=><View key={p.id} style={s.person}><UserAvatar name={p.name} avatarUrl={p.avatarUrl} size={34}/><View style={{flex:1}}><Text style={s.personName}>{p.name}</Text><Text style={s.subtitle}>{p.email} · {p.role}</Text></View></View>)}
 </View>:null}
 </>}
 {!!message&&!!user&&<Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>}
 </ScrollView></KeyboardAvoidingView></View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f3eafa'},center:{justifyContent:'center',alignItems:'center'},flowers:{position:'absolute',bottom:0,left:0,width:210,height:330,opacity:.3},page:{width:'100%',maxWidth:600,alignSelf:'center',padding:20,paddingTop:48,paddingBottom:40,gap:18},hero:{width:220,height:180,alignSelf:'center'},brand:{fontSize:46,fontFamily:'serif',fontStyle:'italic',color:purple,textAlign:'center'},brandSmall:{fontSize:31,fontFamily:'serif',fontStyle:'italic',color:purple},tagline:{textAlign:'center',color:'#7d3b93'},card:{backgroundColor:'#ffffffed',borderRadius:25,padding:22,gap:16},title:{fontSize:23,fontWeight:'700',color:purple},heading:{fontSize:27,fontFamily:'serif',color:purple},label:{fontSize:15,fontWeight:'600',color:'#5f4773'},input:{borderWidth:1,borderColor:'#d9cfdf',borderRadius:12,padding:15,fontSize:16,color:purple,backgroundColor:'#fffcff'},password:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#d9cfdf',borderRadius:12,backgroundColor:'#fffcff'},button:{backgroundColor:purple,padding:15,borderRadius:25,minHeight:48,alignItems:'center'},soft:{backgroundColor:'#e8dbf2'},buttonText:{fontSize:16,fontWeight:'700',color:'white'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},subtitle:{fontSize:13,lineHeight:20,color:'#756b81'},link:{color:purple,textAlign:'center',textDecorationLine:'underline',padding:8},person:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff9ff',padding:16,borderRadius:20},personName:{flex:1,color:purple,fontSize:17,fontWeight:'600'},notice:{padding:16,borderRadius:14,backgroundColor:'#fff9e9',color:purple,lineHeight:22}});
