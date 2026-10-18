import { ApiError } from './errors.mjs';
export function createGameRepository(client){
 function fail(error){if(error)throw new ApiError(503,'Parties indisponibles. Vérifiez la migration 002_games.sql.');}
 return {
  async list(userId){const {data,error}=await client.from('games').select('*').or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`).order('updated_at',{ascending:false}).limit(100);fail(error);return data;},
  async get(id){const {data,error}=await client.from('games').select('*').eq('id',id).maybeSingle();fail(error);return data;},
  async insert(row){const {data,error}=await client.from('games').insert(row).select().single();if(error?.code==='23505')throw new ApiError(409,'Une invitation existe déjà. Actualisez vos parties.');fail(error);return data;},
  async replace(id,revision,patch){const {data,error}=await client.from('games').update(patch).eq('id',id).eq('revision',revision).select().maybeSingle();fail(error);return data;},
 };
}
