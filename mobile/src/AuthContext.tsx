import React,{createContext,useContext,useEffect,useState} from 'react';
import type { PublicUser } from './apiClient';
import { api } from './api';
const AuthContext=createContext<{user:PublicUser|null;loading:boolean;error:string;retry:()=>void}>({user:null,loading:true,error:'',retry:()=>{}});
export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<PublicUser|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let alive=true;api.onUserChanged=u=>{if(alive)setUser(u);};
  api.restore().catch(e=>{if(alive)setError((e as Error).message);}).finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;api.onUserChanged=()=>{};};
 },[attempt]);
 return <AuthContext.Provider value={{user,loading,error,retry:()=>{setError('');setLoading(true);setAttempt(n=>n+1);}}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
