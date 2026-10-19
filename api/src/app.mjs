import { createGameService } from './game-service.mjs';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { ApiError } from './errors.mjs';
export const accountInput=z.object({name:z.string().trim().min(1).max(80),email:z.email().trim().toLowerCase().max(254),password:z.string().min(12).max(128)}).strict();
const credentials=z.object({email:z.email().trim().toLowerCase().max(254),password:z.string().min(1).max(128)}).strict();
export function imageMime(buffer){
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer.length>=3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
export function createApp(service,{origins=[],trustProxyHops=0,loginLimit=10,realtime}={}){
 const app=express();app.disable('x-powered-by');if(trustProxyHops)app.set('trust proxy',trustProxyHops);
 app.use((req,res,next)=>{
  const id=randomUUID(),started=Date.now();res.set('X-Request-Id',id);
  console.info('[Scrabblya API]',JSON.stringify({event:'request',id,method:req.method,path:req.path}));
  res.on('finish',()=>console.info('[Scrabblya API]',JSON.stringify({event:'response',id,method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started})));
  next();
 });
 app.use(helmet());app.use(cors({origin(origin,done){if(!origin||origins.includes(origin))done(null,true);else done(new ApiError(403,'Origine non autorisée.'));}}));
 app.use(express.json({limit:'16kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const limiter=max=>rateLimit({windowMs:15*60*1000,limit:max,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Trop de tentatives. Réessayez plus tard.'}});
 app.get('/health',(_req,res)=>res.json({status:'ok'}));
 app.post('/api/auth/login',limiter(loginLimit),async(req,res)=>{const {email,password}=credentials.parse(req.body);res.json(await service.login(email,password));});
 app.post('/api/auth/refresh',limiter(60),async(req,res)=>{const {refreshToken}=z.object({refreshToken:z.string().min(1).max(4096)}).strict().parse(req.body);res.json(await service.refresh(refreshToken));});
 app.use('/api',async(req,_res,next)=>{
  const match=/^Bearer ([^\s]+)$/i.exec(req.get('authorization')??'');
  if(!match)throw new ApiError(401,'Connexion requise.');
  req.token=match[1];req.account=await service.authenticate(req.token);next();
 });
 const games=service.gameRepository?createGameService(service.gameRepository,service,{onChanged:row=>realtime?.gameChanged(row)}):null;
 const available=()=>{if(!games)throw new ApiError(503,'Service de parties indisponible.');return games;};
 const revision=z.number().int().min(0),actionBase={id:z.uuid(),revision};
 const command=z.discriminatedUnion('kind',[
  z.object({...actionBase,kind:z.literal('play'),placements:z.array(z.object({cell:z.number().int().min(0).max(224),rackIndex:z.number().int().min(0).max(6),letter:z.string().regex(/^[A-Z]$/)}).strict()).min(1).max(7)}).strict(),
  z.object({...actionBase,kind:z.literal('exchange'),indices:z.array(z.number().int().min(0).max(6)).min(1).max(7)}).strict(),
  ...['pass','accept','decline','resign','check-blocked'].map(kind=>z.object({...actionBase,kind:z.literal(kind)}).strict()),
 ]);
 app.get('/api/games',async(req,res)=>res.json({games:await available().list(req.account.id)}));
 app.post('/api/games',limiter(30),async(req,res)=>res.status(201).json(await available().invite(req.account.id,z.object({id:z.uuid(),opponentId:z.uuid()}).strict().parse(req.body))));
 app.get('/api/games/:id',async(req,res)=>res.json(await available().get(req.account.id,z.uuid().parse(req.params.id))));
 app.post('/api/games/:id/actions',limiter(120),async(req,res)=>res.json(await available().act(req.account.id,z.uuid().parse(req.params.id),command.parse(req.body))));
 app.post('/api/auth/logout',async(req,res)=>{await service.logout(req.token);res.status(204).end();});
 app.get('/api/me',async(req,res)=>res.json(await service.me(req.account.id)));
 app.get('/api/users',async(req,res)=>res.json({users:await service.listUsers(req.account.role==='admin')}));
 app.patch('/api/me',async(req,res)=>{const {name}=z.object({name:accountInput.shape.name}).strict().parse(req.body);const user=await service.updateName(req.account.id,name);realtime?.usersChanged();res.json(user);});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:0}});
 app.post('/api/me/avatar',limiter(20),upload.single('avatar'),async(req,res)=>{
  if(!req.file)throw new ApiError(400,'Choisissez un fichier avatar.');
  const mime=imageMime(req.file.buffer);if(!mime||mime!==req.file.mimetype)throw new ApiError(400,'Image PNG, JPEG ou WebP requise.');
  const user=await service.uploadAvatar(req.account.id,req.file.buffer,mime);realtime?.usersChanged();res.json(user);
 });
 app.use('/api/admin', (req,_res,next)=>{if(req.account.role!=='admin')throw new ApiError(403,'Accès administrateur requis.');next();});
 app.post('/api/admin/users/:id/avatar',limiter(20),upload.single('avatar'),async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  if(!req.file)throw new ApiError(400,'Choisissez un fichier avatar.');
  const mime=imageMime(req.file.buffer);if(!mime||mime!==req.file.mimetype)throw new ApiError(400,'Image PNG, JPEG ou WebP requise.');
  const user=await service.uploadAvatar(id,req.file.buffer,mime);realtime?.usersChanged();res.json(user);
 });
 app.post('/api/admin/users',limiter(30),async(req,res)=>{const user=await service.createAccount(accountInput.parse(req.body));realtime?.usersChanged();res.status(201).json(user);});
 app.put('/api/admin/users/:id/password',limiter(20),async(req,res)=>{
  const id=z.uuid().parse(req.params.id),{password}=z.object({password:accountInput.shape.password}).strict().parse(req.body);
  await service.resetPassword(id,password);res.status(204).end();
 });
 app.use((_req,_res,next)=>next(new ApiError(404,'Route introuvable.')));
 app.use((error,_req,res,_next)=>{
  if(error instanceof z.ZodError)return res.status(400).json({error:'Données invalides.',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
  if(error instanceof multer.MulterError)return res.status(400).json({error:'Avatar trop volumineux ou formulaire invalide (maximum 10 Mo).'});
  if(error.type==='entity.too.large')return res.status(413).json({error:'Requête trop volumineuse.'});
  if(error instanceof SyntaxError&&'body' in error)return res.status(400).json({error:'JSON invalide.'});
  res.status(error instanceof ApiError?error.status:500).json({error:error instanceof ApiError?error.message:'Erreur interne du service.'});
 });
 return app;
}
