import { RealtimeClient } from './realtime';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { ApiClient, ApiError } from './apiClient';
export const api=new ApiClient(process.env.EXPO_PUBLIC_API_URL??'',SecureStore,expoFetch as typeof fetch);
export const realtime=new RealtimeClient(()=>api.realtimeCredentials());
export async function uploadAvatar(uri:string,userId?:string){
 const file=new File(uri);
 if(!file.exists)throw new ApiError('La photo sélectionnée est inaccessible. Choisissez-la à nouveau.');
 if(file.size>10485760)throw new ApiError('Choisissez une image de moins de 10 Mo.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new ApiError('Choisissez une photo JPEG, PNG ou WebP.');
 if(__DEV__)console.info('[Scrabblya avatar] fichier prêt',{type:file.type,size:file.size});
 const form=new FormData();form.append('avatar',file,file.name);
 return userId?api.uploadUserAvatar(userId,form):api.uploadAvatar(form);
}
