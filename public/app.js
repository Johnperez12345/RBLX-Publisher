const $=id=>document.getElementById(id);let file=null,animJsonFile=null,lastAnimationId="";
const KEY_STORAGE="rblxPublisher.robloxApiKey.v1";
const ANIMATION_WORKER="https://yuzkpub-api.galiasnathaniel5.workers.dev";
async function api(url,opt={}){const r=await fetch(url,{credentials:"same-origin",...opt});const d=await r.json().catch(()=>({error:"Invalid response"}));if(!r.ok)throw Error(d.error||`Request failed ${r.status}`);return d}
let isAdmin=false;
function setAdmin(on){
 isAdmin=!!on;
 $("adminPostTabButton").classList.toggle("hidden",!isAdmin);
 $("logoutBtn").classList.toggle("hidden",!isAdmin);
 $("loginForm").classList.toggle("hidden",isAdmin);
 $("adminSignedIn").classList.toggle("hidden",!isAdmin);
 $("adminStatus").innerHTML=isAdmin
  ? '<span class="statusDot"></span><div><b>Admin is signed in</b><small>Post management is enabled.</small></div>'
  : '<span class="statusDot"></span><div><b>Public visitor mode</b><small>Sign in here to open the admin posting tools.</small></div>';
 if(!isAdmin && $("adminPostTab").classList.contains("hidden")===false) showTab("settingsTab");
}
function loadLocalKey(){try{$("apiKey").value=localStorage.getItem(KEY_STORAGE)||""}catch{$("keyNote").textContent="Browser storage is unavailable. The key will stay only until you close this page."}}
function saveLocalKey(){try{const key=$("apiKey").value;if(key)localStorage.setItem(KEY_STORAGE,key);else localStorage.removeItem(KEY_STORAGE);$("keyNote").textContent="Saved only in this browser on this device. It is not stored on our server."}catch{$("keyNote").textContent="Could not save in browser storage. The key may be lost when you close this page."}}
loadLocalKey();
async function init(){
 try{const state=await api("/api/session");setAdmin(state.authenticated)}
 catch{setAdmin(false)}
 loadPosts();
}
init();
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});$("password").value="";setAdmin(true);showTab("settingsTab")}catch(x){$("loginError").textContent=x.message}};
async function adminLogout(){try{await api("/api/logout",{method:"POST"})}finally{setAdmin(false);showTab("mainDashboardTab")}}
$("logoutBtn").onclick=adminLogout;
$("settingsLogoutBtn").onclick=adminLogout;
$("apiKey").addEventListener("input",saveLocalKey);
$("clearKeyBtn").onclick=()=>{$("apiKey").value="";saveLocalKey();$("apiKey").focus()};
$("placeFile").onchange=e=>{file=e.target.files[0]||null;$("fileInfo").classList.toggle("hidden",!file);$("fileInfo").textContent=file?`${file.name} · ${(file.size/1048576).toFixed(2)} MB`:"";$("publishBtn").disabled=!file};
$("placeId").oninput=()=> $("placeStat").textContent=$("placeId").value||"Not set";
$("publishBtn").onclick=async()=>{if(!file)return;const key=$("apiKey").value.trim();if(!key){$("uploadMessage").textContent="Enter your Roblox API key.";return}if(!$("placeId").value.trim()){$("uploadMessage").textContent="Enter your own Roblox Place ID.";return}if(!confirm("This will replace the current published place. Have you backed it up?"))return;$("publishBtn").disabled=true;$("statusStat").textContent="Uploading";$("uploadMessage").textContent="Sending file to Roblox…";const f=new FormData();f.append("placeFile",file);f.append("placeId",$("placeId").value.trim());try{const d=await api("/api/upload",{method:"POST",headers:{"x-roblox-api-key":key},body:f});$("operationId").value=d.operationId;$("result").textContent=JSON.stringify(d,null,2);$("uploadMessage").textContent="Roblox accepted the request. Check operation status below.";$("statusStat").textContent="Processing"}catch(x){$("uploadMessage").textContent=x.message;$("statusStat").textContent="Upload error"}finally{$("publishBtn").disabled=!file}};
$("checkBtn").onclick=async()=>{const id=$("operationId").value.trim(),key=$("apiKey").value.trim();if(!id||!key){$("result").textContent="Enter operation ID and API key.";return}try{const d=await api("/api/operations/"+encodeURIComponent(id),{headers:{"x-roblox-api-key":key}});$("result").textContent=JSON.stringify(d,null,2);$("statusStat").textContent=d.done?(d.error?"Failed":(d.response?.isPublished===false?"Saved, not published":"Complete")):"Processing"}catch(x){$("result").textContent=x.message}};
const menuToggle=$("menuToggle"),publisherMenu=$("publisherMenu");
menuToggle.onclick=()=>{const opening=publisherMenu.classList.contains("hidden");publisherMenu.classList.toggle("hidden",!opening);menuToggle.setAttribute("aria-expanded",String(opening));};
document.addEventListener("click",event=>{if(!event.target.closest(".menuWrap")){publisherMenu.classList.add("hidden");menuToggle.setAttribute("aria-expanded","false");}});
function showTab(tabId){
 document.querySelectorAll(".tabButton[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tabId));
 document.querySelectorAll(".tabPanel").forEach(panel=>panel.classList.toggle("hidden",panel.id!==tabId));
 publisherMenu.classList.add("hidden");menuToggle.setAttribute("aria-expanded","false");
}
document.querySelectorAll(".tabButton[data-tab]").forEach(button=>button.addEventListener("click",()=>{
 if(button.dataset.tab==="adminPostTab"&&!isAdmin){showTab("settingsTab");return}
 showTab(button.dataset.tab);
}));
$("animJsonFile").onchange=async e=>{animJsonFile=e.target.files[0]||null;$("animFileInfo").classList.toggle("hidden",!animJsonFile);$("animFileInfo").textContent=animJsonFile?`${animJsonFile.name} · ${(animJsonFile.size/1024).toFixed(1)} KB`:"";if(animJsonFile){try{$("animJson").value=await animJsonFile.text()}catch(err){$("animMessage").textContent="Could not read the selected JSON file."}}};
async function workerPost(endpoint,payload){const response=await fetch(ANIMATION_WORKER+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({error:"Worker returned an unreadable response."}));if(!response.ok)throw Error(data.error||data.message||`Animation service error (${response.status})`);return data}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
$("animPublishBtn").onclick=async()=>{
 const userId=$("animUserId").value.trim(),apiKey=$("animApiKey").value.trim(),name=$("animName").value.trim(),description=$("animDescription").value.trim(),raw=$("animJson").value.trim();
 if(!/^\d{1,25}$/.test(userId)){ $("animMessage").textContent="Enter a valid Roblox User ID.";return}
 if(!apiKey){$("animMessage").textContent="Enter your Roblox Open Cloud API key.";return}
 if(!name){$("animMessage").textContent="Enter an animation name.";return}
 if(!raw){$("animMessage").textContent="Upload or paste your animation JSON.";return}
 let parsed;try{parsed=JSON.parse(raw)}catch{$("animMessage").textContent="The animation JSON is invalid. Check the formatting.";return}
 if(!confirm("Send your animation JSON and API key to the YuzkPub Worker to publish?"))return;
 $("animPublishBtn").disabled=true;$("animMessage").textContent="Submitting animation…";$("animResult").textContent="Waiting for the animation service…";$("copyAnimId").disabled=true;lastAnimationId="";
 try{
  const submitted=await workerPost("/publish",{json:parsed,userId,apiKey,name,description});
  const operationId=submitted.operationId||submitted.operation_id||submitted.id;
  if(!operationId){if(submitted.assetId){lastAnimationId=String(submitted.assetId);showAnimationSuccess(lastAnimationId);return}throw Error(submitted.error||"Worker response did not include an operation ID.")}
  $("animMessage").textContent="Animation submitted. Waiting for Roblox…";
  for(let attempt=0;attempt<90;attempt++){
   await wait(2000);
   const status=await workerPost("/poll",{operationId,apiKey});
   if(status.error)throw Error(typeof status.error==="string"?status.error:JSON.stringify(status.error));
   if(status.done){
    if(!status.assetId)throw Error("Publishing finished but the Worker returned no assetId.");
    lastAnimationId=String(status.assetId);showAnimationSuccess(lastAnimationId);return;
   }
   $("animMessage").textContent=`Publishing animation… (${attempt+1}/90)`;
  }
  throw Error("The publishing request is still processing. Try again later or check the Worker status.");
 }catch(err){$("animMessage").textContent=err.message;$("animResult").textContent="Animation was not confirmed as published.\n\n"+err.message}
 finally{$("animPublishBtn").disabled=false}
};
function showAnimationSuccess(assetId){const cleanId=String(assetId).replace(/^rbxassetid:\/\//,"");const uri="rbxassetid://"+cleanId;const link="https://create.roblox.com/store/asset/"+encodeURIComponent(cleanId);lastAnimationId=cleanId;$("animResult").textContent="Published successfully!\n\nAnimation ID: "+cleanId+"\nRoblox asset: "+uri+"\n\nOpen this link to view the animation:\n"+link;const openLink=$("animOpenLink");openLink.href=link;openLink.classList.remove("hidden");$("animMessage").textContent="Roblox animation publishing completed. Your animation link is ready.";$("copyAnimId").disabled=false;$("copyAnimLink").disabled=false}
$("copyAnimId").onclick=async()=>{if(!lastAnimationId)return;const value="rbxassetid://"+lastAnimationId;try{await navigator.clipboard.writeText(value);$("animMessage").textContent="Animation ID copied."}catch{$("animMessage").textContent="Copy failed. Select and copy the ID from the result."}};
$("copyAnimLink").onclick=async()=>{if(!lastAnimationId)return;const link="https://create.roblox.com/store/asset/"+encodeURIComponent(lastAnimationId);try{await navigator.clipboard.writeText(link);$("animMessage").textContent="Animation link copied."}catch{$("animMessage").textContent="Copy failed. Open the link above and copy it from your browser."}};


/* Public post gallery and admin-only post management. Copy action copies only the Roblox ID. */
function escapeHTML(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
let cachedPosts=[];
function postCard(post,admin){
 const image=post.imageUrl?'<img class="postImage" src="'+escapeHTML(post.imageUrl)+'" alt="'+escapeHTML(post.name)+'" loading="lazy">':'<div class="postImagePlaceholder">NO IMAGE</div>';
 return '<article class="postCard">'+image+
  '<div class="postCardBody"><h3>'+escapeHTML(post.name)+'</h3>'+
  '<div class="postIdLine"><span>ROBLOX ID</span><code>'+escapeHTML(post.robloxId)+'</code></div>'+
  '<div class="postCardActions"><button class="secondary copyPostId" type="button" data-id="'+escapeHTML(post.robloxId)+'">COPY ID</button>'+
  (admin?'<button class="quiet deletePost" type="button" data-post-id="'+escapeHTML(post.id)+'">DELETE</button>':'')+
  '</div></div></article>';
}
function renderPosts(){
 $("publicPosts").innerHTML=cachedPosts.length?cachedPosts.map(p=>postCard(p,false)).join(""):'<div class="postsEmpty">No posts yet. Check back soon.</div>';
 $("adminPosts").innerHTML=cachedPosts.length?cachedPosts.map(p=>postCard(p,true)).join(""):'<div class="postsEmpty">No posts published yet.</div>';
}
async function loadPosts(){
 try{
  const data=await api("/api/posts");
  cachedPosts=Array.isArray(data.posts)?data.posts:[];
  renderPosts();
 }catch(err){
  $("publicPosts").innerHTML='<div class="postsEmpty">Posts are temporarily unavailable.</div>';
  $("adminPosts").innerHTML='<div class="postsEmpty">Could not load posts.</div>';
 }
}
document.addEventListener("click",async event=>{
 const copy=event.target.closest(".copyPostId");
 if(copy){
  const id=copy.dataset.id||"";
  try{await navigator.clipboard.writeText(id);copy.textContent="COPIED";setTimeout(()=>{copy.textContent="COPY ID"},1200)}
  catch{copy.textContent="COPY FAILED"}
  return;
 }
 const del=event.target.closest(".deletePost");
 if(del){
  if(!isAdmin)return;
  const id=del.dataset.postId;
  if(!id||!confirm("Delete this post permanently?"))return;
  del.disabled=true;
  try{await api("/api/posts/"+encodeURIComponent(id),{method:"DELETE"});await loadPosts()}
  catch(err){alert(err.message);del.disabled=false}
 }
});
let selectedPostImage=null;
$("postImage").onchange=event=>{
 selectedPostImage=event.target.files&&event.target.files[0]||null;
 $("postImageInfo").classList.toggle("hidden",!selectedPostImage);
 $("postImageInfo").textContent=selectedPostImage?selectedPostImage.name+" · "+(selectedPostImage.size/1048576).toFixed(2)+" MB":"";
};
$("publishPostBtn").onclick=async()=>{
 if(!isAdmin)return;
 const name=$("postName").value.trim(),robloxId=$("postRobloxId").value.trim();
 if(!selectedPostImage){$("postMessage").textContent="Choose a post image first.";return}
 if(!name){$("postMessage").textContent="Enter the post name.";return}
 if(!/^\d{1,25}$/.test(robloxId)){$("postMessage").textContent="Enter a valid numeric Roblox ID.";return}
 const form=new FormData();form.append("image",selectedPostImage);form.append("name",name);form.append("robloxId",robloxId);
 $("publishPostBtn").disabled=true;$("postMessage").textContent="Uploading post image…";
 try{
  await api("/api/posts",{method:"POST",body:form});
  $("postName").value="";$("postRobloxId").value="";$("postImage").value="";selectedPostImage=null;
  $("postImageInfo").textContent="";$("postImageInfo").classList.add("hidden");
  $("postMessage").textContent="Post published successfully.";await loadPosts();
 }catch(err){$("postMessage").textContent=err.message}
 finally{$("publishPostBtn").disabled=false}
};

/* Existing experience lookup — API key is reused from the local Publish Place field. */
let ezLog="[SYSTEM] Experience manager ready. No requests sent.";
function renderEzLog(){ $("experienceBatchResult").textContent=ezLog; $("copyExperienceBatchBtn").disabled=!ezLog.trim(); }
function appendEzLog(line){ezLog+="\n"+line;renderEzLog();}
document.querySelectorAll(".ezTab").forEach(button=>button.addEventListener("click",()=>{
 const isLog=button.dataset.ezMode==="log";
 document.querySelectorAll(".ezTab").forEach(b=>b.classList.toggle("active",b===button));
 $("ezFormPanel").classList.toggle("hidden",isLog);
 $("ezLogPanel").classList.toggle("hidden",!isLog);
 if(isLog)renderEzLog();
}));
$("loadExperienceBtn").onclick=async()=>{
 const universeId=$("ezUniverseId").value.trim();
 const key=$("apiKey").value.trim();
 if(!/^\d{1,25}$/.test(universeId)){ $("creatorMessage").textContent="Enter a valid numeric Universe ID.";return; }
 if(!key){ $("creatorMessage").textContent="Add your Roblox Open Cloud API key in Publish Place first.";return; }
 $("loadExperienceBtn").disabled=true;
 $("ezReadyStatus").textContent="LOADING";
 $("ezModeHint").textContent="Requesting existing experience details from Roblox";
 $("creatorMessage").textContent="Contacting Roblox Open Cloud…";
 $("experienceDetails").textContent="Loading…";
 try{
  const data=await api("/api/roblox/universes/"+encodeURIComponent(universeId),{headers:{"x-roblox-api-key":key}});
  $("experienceDetails").textContent=JSON.stringify(data,null,2);
  $("ezReadyStatus").textContent="LOADED";
  $("ezModeHint").textContent="Roblox returned experience data";
  $("creatorMessage").textContent="Experience lookup succeeded.";
  appendEzLog("[OK] Loaded Universe "+universeId+" from Roblox Open Cloud.");
 }catch(err){
  $("experienceDetails").textContent="Lookup failed.\n"+err.message;
  $("ezReadyStatus").textContent="ERROR";
  $("ezModeHint").textContent="Check Universe ID, key access, and universe:read permission";
  $("creatorMessage").textContent=err.message;
  appendEzLog("[ERROR] Universe "+universeId+": "+err.message);
 }finally{$("loadExperienceBtn").disabled=false;}
};
$("clearExperienceLog").onclick=()=>{ezLog="[SYSTEM] Log cleared.";renderEzLog();};
$("copyExperienceBatchBtn").onclick=async()=>{
 try{await navigator.clipboard.writeText(ezLog);$("creatorMessage").textContent="Log copied."}
 catch{$("creatorMessage").textContent="Copy unavailable. Select the log text and copy it."}
};
