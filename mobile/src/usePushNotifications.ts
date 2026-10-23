import { useEffect,useLayoutEffect,useRef,useSyncExternalStore } from 'react';
import { AppState,Platform } from 'react-native';
import Constants,{ExecutionEnvironment} from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { commandId } from './onlineTypes';
import { PushRegistration,notificationTarget } from './pushRegistration';
const supported=Platform.OS==='android'&&Device.isDevice&&Constants.executionEnvironment!==ExecutionEnvironment.StoreClient;
let visible:{userId:string|null;gameId:string|null}={userId:null,gameId:null};
function target(notification:Notifications.Notification){
 const direct=notificationTarget(notification.request.content.data);if(direct)return direct;
 const trigger=notification.request.trigger;
 return trigger&&'remoteMessage' in trigger?notificationTarget(trigger.remoteMessage?.data):null;
}
if(supported)Notifications.setNotificationHandler({handleNotification:async notification=>{
 const destination=target(notification),show=!!destination&&destination.userId===visible.userId&&destination.gameId!==visible.gameId;
 return {shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
}});
const registration=new PushRegistration({supported,
 async id(){const key='scrabblya.push.installation.v1';let id=await SecureStore.getItemAsync(key);if(!id){id=commandId();await SecureStore.setItemAsync(key,id);}return id;},
 async permission(ask){
  await Notifications.setNotificationChannelAsync('games',{name:'Parties et invitations',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
  let permissions=await Notifications.getPermissionsAsync();
  if(permissions.status==='undetermined'||ask&&permissions.canAskAgain)permissions=await Notifications.requestPermissionsAsync();
  return permissions.granted;
 },
 async token(){return String((await Notifications.getDevicePushTokenAsync()).data);},
 revoke:()=>Notifications.unregisterForNotificationsAsync(),
 bind:id=>api.bindPushDevice(id),register:(id,token)=>api.registerPushDevice(id,token),unregister:id=>api.unregisterPushDevice(id),
});
export function usePushNotifications(userId:string|null,ready:boolean,gameId:string|null,onOpen:(id:string)=>void){
 const callback=useRef(onOpen),handled=useRef<string|null>(null);
 const state=useSyncExternalStore(registration.subscribe,registration.snapshot,registration.snapshot);
 useLayoutEffect(()=>{callback.current=onOpen;visible={userId,gameId};},[userId,gameId,onOpen]);
 useEffect(()=>{
  if(!ready)return;
  void registration.setUser(userId);
  if(!supported||!userId)return;
  const foreground=AppState.addEventListener('change',value=>{if(value==='active')void registration.refresh();});
  const tokens=Notifications.addPushTokenListener(token=>{void registration.refresh(false,String(token.data));});
  return ()=>{foreground.remove();tokens.remove();};
 },[userId,ready]);
 useEffect(()=>{
  if(!supported||!ready)return;
  let alive=true;
  function response(value:Notifications.NotificationResponse|null){
   if(!alive||!value||!userId)return;
   const id=value.notification.request.identifier;if(handled.current===id)return;
   const destination=target(value.notification);handled.current=id;
   if(destination?.userId===userId)callback.current(destination.gameId);
   void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
  }
  const listener=Notifications.addNotificationResponseReceivedListener(response);
  void Notifications.getLastNotificationResponseAsync().then(response).catch(()=>{});
  return ()=>{alive=false;listener.remove();};
 },[userId,ready]);
 return {...state,enable:()=>registration.refresh(true)};
}
