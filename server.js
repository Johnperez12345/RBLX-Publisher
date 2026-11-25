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
  if(!/^\d{1,25}$/.test(universeId))return res.status(400).json({error:"Invalid Universe ID."});
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

/* Public post gallery. GitHub repository storage; only admin session can publish/delete. */
const postUpload=multer({
 storage:multer.memoryStorage(),
 limits:{fileSize:8*1024*1024,files:1},
 fileFilter:(req,file,cb)=>{
  const allowed=["image/jpeg","image/png","image/webp","image/gif"];
  cb(allowed.includes(file.mimetype)?null:new Error("Only JPG, PNG, WEBP or GIF images are allowed."),allowed.includes(file.mimetype));
 }
});
const GITHUB_TOKEN=String(process.env.GITHUB_TOKEN||"");
const GITHUB_REPO=String(process.env.GITHUB_REPO||"Johnperez12345/RBLX-Publisher");
const GITHUB_BRANCH=String(process.env.GITHUB_BRANCH||"main");
const POSTS_DIR="public-posts";
const POSTS_INDEX=POSTS_DIR+"/posts.json";
function githubHeaders(){return { "accept":"application/vnd.github+json", "authorization":"Bearer "+GITHUB_TOKEN, "x-github-api-version":"2022-11-28", "content-type":"application/json" };}
function githubPath(file){return file.split("/").map(encodeURIComponent).join("/");}
async function githubGetFile(file){
 const response=await fetch("https://api.github.com/repos/"+GITHUB_REPO+"/contents/"+githubPath(file)+"?ref="+encodeURIComponent(GITHUB_BRANCH),{headers:githubHeaders()});
 if(response.status===404)return null;
 if(!response.ok)throw new Error("GitHub storage read failed ("+response.status+").");
 const data=await response.json();
 return {sha:data.sha,content:Buffer.from(String(data.content||"").replace(/\\n/g,""),"base64")};
}
async function githubPutFile(file,bytes,message,sha){
 const body={message,content:Buffer.from(bytes).toString("base64"),branch:GITHUB_BRANCH};
 if(sha)body.sha=sha;
 const response=await fetch("https://api.github.com/repos/"+GITHUB_REPO+"/contents/"+githubPath(file),{method:"PUT",headers:githubHeaders(),body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||"GitHub storage write failed ("+response.status+").");
 return data;
}
async function githubDeleteFile(file,sha,message){
 const response=await fetch("https://api.github.com/repos/"+GITHUB_REPO+"/contents/"+githubPath(file),{method:"DELETE",headers:githubHeaders(),body:JSON.stringify({message,sha,branch:GITHUB_BRANCH})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||"GitHub storage delete failed ("+response.status+").");
 return data;
}
async function readPosts(){
 const file=await githubGetFile(POSTS_INDEX);
 if(!file)return [];
 try{const data=JSON.parse(file.content.toString("utf8"));return Array.isArray(data.posts)?data.posts:[]}
 catch{throw new Error("Posts index is invalid.");}
}
async function savePosts(posts){
 const existing=await githubGetFile(POSTS_INDEX);
 await githubPutFile(POSTS_INDEX,Buffer.from(JSON.stringify({posts},null,2)), "Update community posts",existing&&existing.sha);
}
function postImageUrl(filename){return "https://raw.githubusercontent.com/"+GITHUB_REPO+"/"+encodeURIComponent(GITHUB_BRANCH)+"/"+POSTS_DIR+"/images/"+encodeURIComponent(filename);}
app.get("/api/posts",async(req,res)=>{
 try{res.json({posts:await readPosts()})}
 catch(e){console.error("Posts read failed:",e.message);res.status(503).json({error:"Posts are temporarily unavailable. Storage setup may be incomplete."})}
});
app.post("/api/posts",auth,postUpload.single("image"),async(req,res)=>{
 try{
  if(!GITHUB_TOKEN)return res.status(503).json({error:"GitHub storage is not configured yet."});
  const name=String(req.body.name||"").trim().slice(0,100);
  const robloxId=String(req.body.robloxId||"").trim();
  const image=req.file;
  if(!name)return res.status(400).json({error:"Enter the post name."});
  if(!/^\d{1,25}$/.test(robloxId))return res.status(400).json({error:"Enter a valid numeric Roblox ID."});
  if(!image)return res.status(400).json({error:"Choose a post image."});
  const extension={ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif" }[image.mimetype];
  if(!extension)return res.status(415).json({error:"Only JPG, PNG, WEBP or GIF images are allowed."});
  const posts=await readPosts();
  const id=crypto.randomUUID(),filename=id+"."+extension;
  await githubPutFile(POSTS_DIR+"/images/"+filename,image.buffer,"Add community post image "+id);
  const post={id,name,robloxId,imageUrl:postImageUrl(filename),createdAt:new Date().toISOString()};
  posts.unshift(post);
  await savePosts(posts);
  res.status(201).json({ok:true,post});
 }catch(e){console.error("Post publish failed:",e.message);res.status(503).json({error:e.message||"Could not publish the post."})}
});
app.delete("/api/posts/:id",auth,async(req,res)=>{
 try{
  if(!GITHUB_TOKEN)return res.status(503).json({error:"GitHub storage is not configured yet."});
  const id=String(req.params.id||"");
  if(!/^[a-f0-9-]{36}$/.test(id))return res.status(400).json({error:"Invalid post ID."});
  const posts=await readPosts(),post=posts.find(item=>item.id===id);
  if(!post)return res.status(404).json({error:"Post not found."});
  await savePosts(posts.filter(item=>item.id!==id));
  const filename=String(post.imageUrl||"").split("/").pop();
  if(/^[a-f0-9-]{36}\\.(jpg|png|webp|gif)$/.test(filename)){
   const imageFile=await githubGetFile(POSTS_DIR+"/images/"+filename);
   if(imageFile)await githubDeleteFile(POSTS_DIR+"/images/"+filename,imageFile.sha,"Delete community post image "+id);
  }
  res.json({ok:true});
 }catch(e){console.error("Post delete failed:",e.message);res.status(503).json({error:e.message||"Could not delete the post."})}
});

app.get("/health",(_,res)=>res.json({ok:true,service:"rblx-publisher"}));
app.listen(PORT,()=>console.log("RBLX Publisher listening on "+PORT));