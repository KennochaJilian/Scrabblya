import { ApiError } from './errors.mjs';
export function createPushRepository(client){
 async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw new ApiError(503,'Notifications indisponibles. Vérifiez la migration 005_push_notifications.sql.');return data;}
 return {
  register(userId,{deviceId,token}){return rpc('register_push_device',{p_user:userId,p_device:deviceId,p_token:token});},
  unregister(userId,deviceId){return rpc('unregister_push_device',{p_user:userId,p_device:deviceId});},
  claim(){return rpc('claim_push_jobs');},
  context(job){return rpc('push_job_context',{p_job:job.id,p_lease:job.leaseId});},
  complete(job,status,error=null){return rpc('complete_push_job',{p_job:job.id,p_lease:job.leaseId,p_status:status,p_error:error});},
  async invalidate(job){const {error}=await client.from('push_devices').update({active:false,token:null}).eq('id',job.deviceId).eq('user_id',job.userId).eq('token',job.token);if(error)throw new Error('push_device_update_failed');},
 };
}
