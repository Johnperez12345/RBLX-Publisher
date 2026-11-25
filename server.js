const express=require("express"),session=require("express-session"),multer=require("multer"),path=require("path"),crypto=require("crypto");
const app=express(),PORT=process.env.PORT||3000,ADMIN_PASSWORD=process.env.ADMIN_PASSWORD;
if(!ADMIN_PASSWORD){console.error("Set ADMIN_PASSWORD");process.exit(1)}
if(!process.env.SESSION_SECRET){console.error("Set SESSION_SECRET");process.exit(1)}
app.set("trust proxy",1);app.use(express.json({limit:"10kb"}));
app.use(session({name:"rblxpub.sid",secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:8*60*60*1000}}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024,files:1}});
app.use(express.static(path.join(__dirname,"public")));
const auth=(req,res,next)=>req.session.authenticated?next():res.status(401).json({error:"Please log in again."});
app.post("/api/login",(req,res)=>{if(String(req.body.password||"")!==ADMIN_PASSWORD)return res.status(401).json({error:"Incorrect password."});req.session.authenticated=true;res.json({ok:true})});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/session",(req,res)=>res.json({authenticated:!!req.session.authenticated}));
app.post("/api/upload",upload.single("placeFile"),async(req,res)=>{
 try{const key=String(req.headers["x-roblox-api-key"]||""),place=String(req.body.placeId||"").trim(),f=req.file;
 if(!key)return res.status(400).json({error:"Enter your Roblox API key."});
 if(!/^\d{5,25}$/.test(place))return res.status(400).json({error:"Invalid Place ID."});
 if(!f)return res.status(400).json({error:"Choose a place file."});
 const ext=path.extname(f.originalname).toLowerCase();if(![".rbxl",".rbxlx"].includes(ext))return res.status(400).json({error:"Only .rbxl and .rbxlx are supported."});
 const boundary="----RblxPublisher"+crypto.randomBytes(12).toString("hex"),type=ext===".rbxlx"?"application/xml":"application/octet-stream",safeName=f.originalname.replace(/["\r\n]/g,"_");
 const head=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({assetId:Number(place),assetType:"Place",published:true})}\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileContent"; filename="${safeName}"\r\nContent-Type: ${type}\r\n\r\n`);
 const tail=Buffer.from(`\r\n--${boundary}--\r\n`),body=Buffer.concat([head,f.buffer,tail]);
 const upstream=await fetch(`https://apis.roblox.com/assets/v1/assets/${place}`,{method:"PATCH",headers:{"x-api-key":key,"Content-Type":`multipart/form-data; boundary=${boundary}`,"Content-Length":String(body.length)},body});
 const raw=await upstream.text();let data;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,1500)}}
 if(!upstream.ok)return res.status(upstream.status).json({error:data.message||data.error||"Roblox rejected upload.",details:data});
 const operationId=data.operationId||String(data.path||"").split("/").pop();if(!operationId)return res.status(502).json({error:"Roblox returned no operation ID.",details:data});
 res.json({ok:true,operationId,fileName:f.originalname});
 }catch(e){console.error(e);res.status(500).json({error:"Upload failed. Check server logs."})}
});
app.get("/api/operations/:id",async(req,res)=>{
 try{const key=String(req.headers["x-roblox-api-key"]||"");if(!key)return res.status(400).json({error:"Enter API key again."});
 const r=await fetch(`https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(req.params.id)}`,{headers:{"x-api-key":key}});
 const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t.slice(0,1500)}}res.status(r.status).json(d);
 }catch(e){res.status(500).json({error:"Could not check operation."})}
});
app.get("/api/roblox/universes/:id",async(req,res)=>{
 try{
  const universeId=String(req.params.id||"").trim();
  const key=String(req.headers["x-roblox-api-key"]||"").trim();
  if(!/^\\d{1,25}$/.test(universeId))return res.status(400).json({error:"Invalid Universe ID."});
  if(!key)return res.status(400).json({error:"Enter your Roblox Open Cloud API key."});
  const upstream=await fetch("https://apis.roblox.com/cloud/v2/universes/"+encodeURIComponent(universeId),{
   method:"GET",headers:{"x-api-key":key}
  });
  const raw=await upstream.text();let data;
  try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,1200)}}
  if(!upstream.ok)return res.status(upstream.status).json({error:data.message||data.error||"Roblox rejected the lookup.",details:data});
  res.json(data);
 }catch(e){console.error("Universe lookup failed:",e.message);res.status(500).json({error:"Could not contact Roblox Open Cloud."});}
});
const publicAccess=(req,res,next)=>next();
require("./createExperience")(app,publicAccess);

/* Public post gallery. Writes and deletes require the authenticated admin session.
   Images and the posts index are stored by the Cloudflare R2 Worker, not on Render's
   ephemeral filesystem. */
const postUpload=multer({
 storage:multer.memoryStorage(),
 limits:{fileSize:8*1024*1024,files:1},
 fileFilter:(req,file,cb)=>{
  const allowed=["image/jpeg","image/png","image/webp","image/gif"];
  cb(allowed.includes(file.mimetype)?null:new Error("Only JPG, PNG, WEBP or GIF images are allowed."),allowed.includes(file.mimetype));
 }
});
const POSTS_WORKER_URL=String(process.env.POSTS_WORKER_URL||"").replace(/\/+$/,"");
const POSTS_WORKER_SECRET=String(process.env.POSTS_WORKER_SECRET||"");
async function postsWorker(path,options={}){
 if(!POSTS_WORKER_URL||!POSTS_WORKER_SECRET)throw new Error("Post storage is not configured yet.");
 const response=await fetch(POSTS_WORKER_URL+path,{
  ...options,
  headers:{"x-post-storage-secret":POSTS_WORKER_SECRET,...(options.headers||{})}
 });
 const raw=await response.text();let data={};
 try{data=raw?JSON.parse(raw):{}}catch{data={error:"Storage service returned an invalid response."}}
 if(!response.ok)throw new Error(data.error||"Post storage request failed ("+response.status+").");
 return data;
}
app.get("/api/posts",async(req,res)=>{
 try{const data=await postsWorker("/api/posts",{method:"GET",headers:{}});res.json({posts:Array.isArray(data.posts)?data.posts:[]})}
 catch(e){res.status(503).json({error:e.message||"Posts are temporarily unavailable."})}
});
app.post("/api/posts",auth,postUpload.single("image"),async(req,res)=>{
 try{
  const name=String(req.body.name||"").trim().slice(0,100);
  const robloxId=String(req.body.robloxId||"").trim();
  const image=req.file;
  if(!name)return res.status(400).json({error:"Enter the post name."});
  if(!/^\\d{1,25}$/.test(robloxId))return res.status(400).json({error:"Enter a valid numeric Roblox ID."});
  if(!image)return res.status(400).json({error:"Choose a post image."});
  const form=new FormData();
  form.append("name",name);form.append("robloxId",robloxId);
  form.append("image",new Blob([image.buffer],{type:image.mimetype}),image.originalname||"post-image");
  const data=await postsWorker("/api/posts",{method:"POST",body:form,headers:{}});
  res.status(201).json(data);
 }catch(e){res.status(503).json({error:e.message||"Could not publish the post."})}
});
app.delete("/api/posts/:id",auth,async(req,res)=>{
 try{const data=await postsWorker("/api/posts/"+encodeURIComponent(String(req.params.id)),{method:"DELETE",headers:{}});res.json(data)}
 catch(e){res.status(503).json({error:e.message||"Could not delete the post."})}
});

app.get("/health",(_,res)=>res.json({ok:true,service:"rblx-publisher"}));
app.listen(PORT,()=>console.log("RBLX Publisher listening on "+PORT));