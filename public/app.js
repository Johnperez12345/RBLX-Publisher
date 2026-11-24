const $=id=>document.getElementById(id);let file=null,animJsonFile=null,lastAnimationId="";
const KEY_STORAGE="rblxPublisher.robloxApiKey.v1";
const ANIMATION_WORKER="https://yuzkpub-api.galiasnathaniel5.workers.dev";
async function api(url,opt={}){const r=await fetch(url,{credentials:"same-origin",...opt});const d=await r.json().catch(()=>({error:"Invalid response"}));if(!r.ok)throw Error(d.error||`Request failed ${r.status}`);return d}
function view(on){$("loginView").classList.toggle("hidden",on);$("appView").classList.toggle("hidden",!on);$("menuToggle").classList.toggle("hidden",!on);$("logoutBtn").classList.toggle("hidden",!on);if(!on){$("publisherMenu").classList.add("hidden");$("menuToggle").setAttribute("aria-expanded","false")}}
function loadLocalKey(){try{$("apiKey").value=localStorage.getItem(KEY_STORAGE)||""}catch{$("keyNote").textContent="Browser storage is unavailable. The key will stay only until you close this page."}}
function saveLocalKey(){try{const key=$("apiKey").value;if(key)localStorage.setItem(KEY_STORAGE,key);else localStorage.removeItem(KEY_STORAGE);$("keyNote").textContent="Saved only in this browser on this device. It is not stored on our server."}catch{$("keyNote").textContent="Could not save in browser storage. The key may be lost when you close this page."}}
loadLocalKey();async function init(){try{view((await api("/api/session")).authenticated)}catch{view(false)}}init();
$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("password").value})});$("password").value="";view(true)}catch(x){$("loginError").textContent=x.message}};
$("logoutBtn").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}finally{view(false)}};
$("apiKey").addEventListener("input",saveLocalKey);
$("clearKeyBtn").onclick=()=>{$("apiKey").value="";saveLocalKey();$("apiKey").focus()};
$("placeFile").onchange=e=>{file=e.target.files[0]||null;$("fileInfo").classList.toggle("hidden",!file);$("fileInfo").textContent=file?`${file.name} · ${(file.size/1048576).toFixed(2)} MB`:"";$("publishBtn").disabled=!file};
$("placeId").oninput=()=> $("placeStat").textContent=$("placeId").value||"Not set";
$("publishBtn").onclick=async()=>{if(!file)return;const key=$("apiKey").value.trim();if(!key){$("uploadMessage").textContent="Enter your Roblox API key.";return}if(!$("placeId").value.trim()){$("uploadMessage").textContent="Enter your own Roblox Place ID.";return}if(!confirm("This will replace the current published place. Have you backed it up?"))return;$("publishBtn").disabled=true;$("statusStat").textContent="Uploading";$("uploadMessage").textContent="Sending file to Roblox…";const f=new FormData();f.append("placeFile",file);f.append("placeId",$("placeId").value.trim());try{const d=await api("/api/upload",{method:"POST",headers:{"x-roblox-api-key":key},body:f});$("operationId").value=d.operationId;$("result").textContent=JSON.stringify(d,null,2);$("uploadMessage").textContent="Roblox accepted the request. Check operation status below.";$("statusStat").textContent="Processing"}catch(x){$("uploadMessage").textContent=x.message;$("statusStat").textContent="Upload error"}finally{$("publishBtn").disabled=!file}};
$("checkBtn").onclick=async()=>{const id=$("operationId").value.trim(),key=$("apiKey").value.trim();if(!id||!key){$("result").textContent="Enter operation ID and API key.";return}try{const d=await api("/api/operations/"+encodeURIComponent(id),{headers:{"x-roblox-api-key":key}});$("result").textContent=JSON.stringify(d,null,2);$("statusStat").textContent=d.done?(d.error?"Failed":(d.response?.isPublished===false?"Saved, not published":"Complete")):"Processing"}catch(x){$("result").textContent=x.message}};
const menuToggle=$("menuToggle"),publisherMenu=$("publisherMenu");
menuToggle.onclick=()=>{const opening=publisherMenu.classList.contains("hidden");publisherMenu.classList.toggle("hidden",!opening);menuToggle.setAttribute("aria-expanded",String(opening));};
document.addEventListener("click",event=>{if(!event.target.closest(".menuWrap")){publisherMenu.classList.add("hidden");menuToggle.setAttribute("aria-expanded","false");}});
document.querySelectorAll(".tabButton").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".tabButton").forEach(b=>b.classList.toggle("active",b.dataset.tab===button.dataset.tab));document.querySelectorAll(".tabPanel").forEach(panel=>panel.classList.toggle("hidden",panel.id!==button.dataset.tab));publisherMenu.classList.add("hidden");menuToggle.setAttribute("aria-expanded","false");}));
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

/* Mobile Experience Creator assistant: prepares details locally; it does not call undocumented Roblox endpoints. */
let experienceBatchText="";
$("prepareExperiencesBtn").onclick=()=>{
 const name=$("newExperienceName").value.trim();
 const description=$("newExperienceDescription").value.trim();
 const template=$("experienceTemplate").value;
 const count=Number($("experienceCount").value);
 if(!name){$("creatorMessage").textContent="Enter an experience name.";return}
 if(!Number.isInteger(count)||count<1||count>10){$("creatorMessage").textContent="Choose a quantity from 1 to 10.";return}
 const entries=Array.from({length:count},(_,i)=>({
  number:i+1,
  name:count===1?name:`${name} ${i+1}`,
  description,
  template,
  status:"Not created — awaiting Roblox Creator Dashboard confirmation"
 }));
 experienceBatchText=entries.map(x=>[`Experience ${x.number}`,`Name: ${x.name}`,`Description: ${x.description||"(none)"}`,`Template: ${x.template}`,`Status: ${x.status}`].join("\\n")).join("\\n\\n");
 $("experienceBatchResult").textContent=experienceBatchText;
 $("copyExperienceBatchBtn").disabled=false;
 $("creatorMessage").textContent=`Prepared ${count} experience detail(s). Open Creator Dashboard to create them; no experience has been created by this page.`;
};
$("copyExperienceBatchBtn").onclick=async()=>{
 if(!experienceBatchText)return;
 try{await navigator.clipboard.writeText(experienceBatchText);$("creatorMessage").textContent="Creation list copied. Paste the details into Roblox Creator Dashboard."}
 catch{$("creatorMessage").textContent="Copy unavailable. Select the text in the creation list and copy it."}
};
