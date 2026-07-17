// ===== LayerMotion · 图层动画 Meme 工作室 =====
// 纯浏览器：上传 PSD / PNG → 逐层选“运动方式” → 导出 GIF / MP4
// 设计要点：不再假设“脸/腿/头发”等具体部位，改用通用运动方式，任何素材都能用。

const MAX_STAGE_H = 520, MAX_STAGE_W = 460;

let CANVAS_W = 1242, CANVAS_H = 1660;
let previewScale = 0.3;
let layers = [];   // {name,img,left,top,w,h,style,phase,visible,depth,anchorX,anchorY}
let selected = -1;
let speed = 1.1, amp = 0.6, p3amp = 0, p3mode = "auto";
let globalMotion = "breathe";   // 整体动作：全身同一拍
let followThrough = 0;          // 错落感：0=完全同步
let bgTransparent = false;      // 导出/预览透明背景
let mouse = { x:0, y:0 };
let anchorVisible = true;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const anchorLayer = document.getElementById("anchorLayer");
const layerList = document.getElementById("layerList");
const editorBox = document.getElementById("editorBox");
const statusEl = document.getElementById("status");
const dropzone = document.getElementById("dropzone");

// ===== 整体动作（全身一起，同一拍）=====
const MOTIONS = { none:"无", breathe:"呼吸", bounce:"弹跳", sway:"左右摇" };

// ===== 每层“叠加效果”：叠在整体动作之上，全部锁定在整体节拍的整数倍频率，永不失步 =====
const STYLES = {
  follow: "跟随整体",   // 只跟随整体动作，不额外加料（默认）
  float:  "飘逸",       // 缓慢摇曳（头发、衣摆）
  swing:  "摆动/挥手",  // 绕锚点较大幅度转（手臂）
  jelly:  "Q弹",        // 挤压拉伸（2倍频，仍同步）
  quiver: "颤动",       // 高频小抖（3倍频，确定性、不随机）
  still:  "稳住不动",   // 完全不动，当地基（连整体动作都不跟）
};

// 仅用于“智能默认值”：按名字猜一个合理的初始运动方式/深度/锚点，用户可随意改
function hintRole(name="") {
  const n = name.toLowerCase();
  if (n.includes("发") || n.includes("hair") || n.includes("裙") || n.includes("摆") || n.includes("cloth")) return "flow";
  if (n.includes("手") || n.includes("臂") || n.includes("arm")) return "arm";
  if (n.includes("腿") || n.includes("脚") || n.includes("leg") || n.includes("foot")) return "base";
  if (n.includes("身") || n.includes("躯") || n.includes("body")) return "body";
  if (n.includes("头") || n.includes("head") || n.includes("脸") || n.includes("face")) return "head";
  return "other";
}
const DEFAULT_STYLE = { flow:"float", arm:"swing", base:"still", body:"follow", head:"follow", other:"follow" };
const DEFAULT_DEPTH = { flow:-0.2, arm:0.5, base:-0.05, body:0.05, head:0.4, other:0 };

function defaultAnchor(hint, bbox) {
  const [x0,y0,x1,y1] = bbox;
  const cx=(x0+x1)/2/CANVAS_W, top=y0/CANVAS_H, bot=y1/CANVAS_H;
  switch(hint){
    case "head": case "body": return [cx, bot];   // 底部中心（脖子/腰）
    case "arm": return [cx, top];                  // 肩膀
    case "flow": return [cx, top+0.02];            // 顶部（发根/挂点）
    case "base": return [cx, 1.0];                 // 脚底
    default: return [cx, (top+bot)/2];
  }
}

function makeLayer(name, img, left, top, w, h, bbox) {
  const hint = hintRole(name);
  const [ax, ay] = defaultAnchor(hint, bbox || [left, top, left+w, top+h]);
  const n = (name||"").toLowerCase();
  const dir = (n.includes("左") || n.includes("left")) ? -1 : 1; // 左侧部件默认反向，方便左右对称
  return {
    name, img, left, top, w, h,
    style: DEFAULT_STYLE[hint] || "follow",
    gain: 1,                // 该层运动幅度倍率
    dir,                    // 初始方向：+1 正向 / -1 反向（相位翻转 π）
    visible: true,
    depth: DEFAULT_DEPTH[hint] ?? 0,
    anchorX: ax, anchorY: ay,
  };
}

function fitStage() {
  previewScale = Math.min(MAX_STAGE_W/CANVAS_W, MAX_STAGE_H/CANVAS_H);
  canvas.width = Math.round(CANVAS_W*previewScale);
  canvas.height = Math.round(CANVAS_H*previewScale);
}
function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }

// ===== 三种素材来源 =====
async function loadDemo() {
  try {
    const data = await (await fetch("demo/manifest.json")).json();
    CANVAS_W=data.canvas[0]; CANVAS_H=data.canvas[1]; layers=[];
    for (const L of data.layers) {
      const img = await loadImage(encodeURI(L.file.replace("layers_named/","demo/")));
      layers.push(makeLayer(L.name, img, 0, 0, CANVAS_W, CANVAS_H, L.bbox));
    }
    // 范例角色的最佳初始设置：裙子和腿跟随整体（默认会被识别成飘逸，这里覆盖）
    layers.forEach(L=>{ if(L.name.includes("裙")||L.name.includes("腿")) L.style="follow"; });
    afterLoad(`示例角色 · ${layers.length} 图层`);
  } catch(e){ alert("示例加载失败："+e); }
}
async function loadPngs(fileList) {
  const files=[...fileList].sort((a,b)=>a.name.localeCompare(b.name));
  const imgs=[]; for (const f of files) imgs.push({ name:f.name.replace(/\.[^.]+$/,""), img:await loadImage(URL.createObjectURL(f)) });
  if(!imgs.length) return;
  CANVAS_W=Math.max(...imgs.map(o=>o.img.naturalWidth));
  CANVAS_H=Math.max(...imgs.map(o=>o.img.naturalHeight));
  layers=imgs.map(o=>makeLayer(o.name,o.img,0,0,o.img.naturalWidth,o.img.naturalHeight));
  afterLoad(`${layers.length} 张 PNG 图层`);
}
async function loadPsd(file) {
  try {
    const buf=await file.arrayBuffer();
    const psd=agPsd.readPsd(buf,{useImageData:false,skipCompositeImageData:true,skipThumbnail:true});
    CANVAS_W=psd.width; CANVAS_H=psd.height;
    const flat=[]; (function walk(ns){ for(const n of ns){ if(n.children) walk(n.children); else if(n.canvas) flat.push(n); } })(psd.children||[]);
    flat.reverse();
    layers=flat.map(n=>{ const L=makeLayer(n.name||"图层",n.canvas,n.left||0,n.top||0,n.canvas.width,n.canvas.height); L.visible=!n.hidden; return L; });
    afterLoad(`PSD · ${layers.length} 图层`);
  } catch(e){ alert("PSD 解析失败："+e); }
}
function afterLoad(msg) {
  fitStage();
  selected = layers.length-1;
  dropzone.classList.add("hide");
  statusEl.textContent = `${msg} · ${CANVAS_W}×${CANVAS_H}`;
  buildLayerList(); buildEditor(); updateAnchorHandle();
}

// ================= 渲染引擎 =================
const W = 2*Math.PI;

// 整体动作：全身用同一个基础节拍 W，天生同步
function globalMotionCalc(t) {
  let tx=0, ty=0, rot=0, sx=1, sy=1;
  switch(globalMotion){
    case "breathe": { const b=Math.sin(t*W); sy=1+b*0.02*amp; sx=1-b*0.012*amp; ty=-b*3*amp; break; }
    case "bounce":  { const b=Math.abs(Math.sin(t*W)); ty=-b*13*amp;
      sy=1+(1-b)*0.045*amp-0.02*amp; sx=1-(1-b)*0.035*amp+0.02*amp; break; }
    case "sway":    { tx=Math.sin(t*W)*10*amp; rot=Math.sin(t*W)*1.5*amp; break; }
    case "none": default: break;
  }
  return { tx, ty, rot, sx, sy };
}
// 每层叠加效果：只用 W 的整数倍频率（1x/2x/3x），与整体节拍相位锁定 → 永不失步
function accentCalc(style, t) {
  let tx=0, ty=0, rot=0, sx=1, sy=1;
  switch(style){
    case "float":  { rot=Math.sin(t*W)*3*amp; tx=Math.sin(t*W)*2*amp; break; }
    case "swing":  { rot=Math.sin(t*W)*8*amp; break; }
    case "jelly":  { const s=Math.sin(t*W*2); sx=1+s*0.05*amp; sy=1-s*0.05*amp; break; }
    case "quiver": { rot=Math.sin(t*W*3)*2*amp; break; }
    case "follow": case "still": default: break;
  }
  return { tx, ty, rot, sx, sy };
}
// 合成某层最终变换：整体动作 + 叠加效果，共享时钟。
// - 初始方向 dir：反向=相位翻转 π（同频率、同拍，只是反着走，适合左右对称）
// - 幅度 gain：对该层运动幅度整体缩放（缩放类按“偏离 1 的量”缩放）
function styleMotion(L, t) {
  if (L.style === "still") return { tx:0, ty:0, rot:0, sx:1, sy:1 }; // 稳住：完全不动
  // 相位 = 错落感偏移 + 方向翻转；0 错落感时各层仅相差方向，仍完全同拍
  const ph = followThrough * (1 - L.anchorY) * 1.2 + (L.dir < 0 ? Math.PI : 0);
  const tt = t + ph/W;
  const g = globalMotionCalc(tt), a = accentCalc(L.style, tt);
  const k = L.gain;
  const sx = g.sx * a.sx, sy = g.sy * a.sy;
  return {
    tx:(g.tx+a.tx)*k, ty:(g.ty+a.ty)*k, rot:(g.rot+a.rot)*k,
    sx:1+(sx-1)*k, sy:1+(sy-1)*k,
  };
}
function parallaxVec(t){
  if(p3mode==="mouse") return [mouse.x, mouse.y];
  return [Math.sin(t*W*0.5), Math.sin(t*W*0.35)*0.4];
}
function drawScene(g, scale, t, transparent) {
  g.clearRect(0,0,g.canvas.width,g.canvas.height);
  if(!transparent){ g.fillStyle="#ffffff"; g.fillRect(0,0,g.canvas.width,g.canvas.height); }
  const [vx,vy]=parallaxVec(t); const par=p3amp*22;
  for(const L of layers){
    if(!L.visible) continue;
    let { tx,ty,rot,sx,sy }=styleMotion(L,t);
    tx+=vx*L.depth*par; ty+=vy*L.depth*par*0.6;
    const ax=L.anchorX*CANVAS_W, ay=L.anchorY*CANVAS_H;
    g.save();
    g.translate((ax+tx)*scale,(ay+ty)*scale);
    g.rotate(rot*Math.PI/180); g.scale(sx,sy);
    g.drawImage(L.img,(L.left-ax)*scale,(L.top-ay)*scale,L.w*scale,L.h*scale);
    g.restore();
  }
}
const stageOuter=document.getElementById("stageOuter");
const startT=performance.now();
(function frame(now){
  if(layers.length) drawScene(ctx, previewScale, (now-startT)/1000*speed, bgTransparent);
  stageOuter.classList.toggle("checker", bgTransparent);
  requestAnimationFrame(frame);
})(startT);

// ================= 侧栏 UI =================
function buildLayerList() {
  layerList.innerHTML="";
  layers.map((L,i)=>[L,i]).reverse().forEach(([L,i])=>{
    const row=document.createElement("div");
    row.className="layer-row"+(i===selected?" active":"");
    row.draggable=true; row.dataset.idx=i;
    row.innerHTML=`<span class="drag" style="cursor:grab;color:#c9a7e0">⠿</span>
      <input type="checkbox" ${L.visible?"checked":""}>
      <span class="nm" title="${L.name}">${L.name}</span>
      <span class="depth-badge">${STYLES[L.style]}</span>
      <span class="ord"><button data-up title="上移(更靠前)">▲</button><button data-dn title="下移(更靠后)">▼</button></span>`;
    row.addEventListener("click",e=>{ if(e.target.type!=="checkbox" && e.target.tagName!=="BUTTON") selectLayer(i); });
    row.querySelector("input").addEventListener("change",e=>{ L.visible=e.target.checked; });
    row.querySelector("[data-up]").addEventListener("click",e=>{ e.stopPropagation(); moveLayer(i,1); });
    row.querySelector("[data-dn]").addEventListener("click",e=>{ e.stopPropagation(); moveLayer(i,-1); });
    // 拖拽排序
    row.addEventListener("dragstart",e=>{ e.dataTransfer.setData("text/plain",i); row.style.opacity=".4"; });
    row.addEventListener("dragend",()=>{ row.style.opacity="1"; });
    row.addEventListener("dragover",e=>{ e.preventDefault(); row.style.borderColor="#ec4899"; });
    row.addEventListener("dragleave",()=>{ row.style.borderColor=""; });
    row.addEventListener("drop",e=>{ e.preventDefault(); row.style.borderColor="";
      const src=+e.dataTransfer.getData("text/plain"); reorder(src, i); });
    layerList.appendChild(row);
  });
}
function reorder(src, dst){
  if(src===dst||src<0) return;
  const [m]=layers.splice(src,1); layers.splice(dst,0,m);
  if(selected===src) selected=dst;
  else if(src<selected && dst>=selected) selected--;
  else if(src>selected && dst<=selected) selected++;
  buildLayerList(); buildEditor(); updateAnchorHandle();
}
function moveLayer(i, delta){ // delta +1=上移(更靠前/更高 z) -1=下移
  const j=i+delta; if(j<0||j>=layers.length) return;
  [layers[i],layers[j]]=[layers[j],layers[i]];
  if(selected===i) selected=j; else if(selected===j) selected=i;
  buildLayerList(); buildEditor(); updateAnchorHandle();
}
function selectLayer(i){ selected=i; buildLayerList(); buildEditor(); updateAnchorHandle(); }

function buildEditor(){
  const L=layers[selected];
  if(!L){ editorBox.innerHTML=""; return; }
  editorBox.innerHTML=`<div class="editor">
    <div class="title">✏️ ${L.name}</div>
    <label>叠加效果（叠在整体动作之上）</label>
    <select id="edStyle">${Object.entries(STYLES).map(([k,v])=>`<option value="${k}" ${k===L.style?"selected":""}>${v}</option>`).join("")}</select>
    <label>运动幅度 <span class="val">${L.gain.toFixed(2)}</span>x</label>
    <input type="range" id="edGain" min="0" max="2.5" step="0.05" value="${L.gain}">
    <label>初始方向</label>
    <button id="edDir" style="width:100%;background:${L.dir<0?'#a05fc4':'#ec7fa9'}">${L.dir<0?"◀ 反向":"正向 ▶"}</button>
    <label>深度(伪3D视差) <span class="val">${L.depth.toFixed(2)}</span></label>
    <input type="range" id="edDepth" min="-1" max="1" step="0.05" value="${L.depth}">
    <label>锚点 X <span class="val">${(L.anchorX*100).toFixed(0)}%</span> ／ Y <span class="val">${(L.anchorY*100).toFixed(0)}%</span></label>
    <div class="row2"><input type="range" id="edAX" min="0" max="1" step="0.01" value="${L.anchorX}">
      <input type="range" id="edAY" min="0" max="1.1" step="0.01" value="${L.anchorY}"></div>
    <p class="hint" style="margin:8px 0 0">锚点=旋转/缩放中心，可直接在画布上拖粉点。</p></div>`;
  editorBox.querySelector("#edStyle").onchange=e=>{ L.style=e.target.value; buildLayerList(); };
  editorBox.querySelector("#edGain").oninput=e=>{ L.gain=+e.target.value; buildEditor(); };
  editorBox.querySelector("#edDir").onclick=()=>{ L.dir=-L.dir; buildEditor(); };
  editorBox.querySelector("#edDepth").oninput=e=>{ L.depth=+e.target.value; buildEditor(); };
  editorBox.querySelector("#edAX").oninput=e=>{ L.anchorX=+e.target.value; buildEditor(); updateAnchorHandle(); };
  editorBox.querySelector("#edAY").oninput=e=>{ L.anchorY=+e.target.value; buildEditor(); updateAnchorHandle(); };
}

// 锚点手柄
const handle=document.createElement("div"); handle.className="anchor-handle"; anchorLayer.appendChild(handle);
(function(){
  let dragging=false;
  const moveTo=(cx,cy)=>{ if(selected<0)return; const r=canvas.getBoundingClientRect();
    layers[selected].anchorX=Math.max(0,Math.min(1,(cx-r.left)/r.width));
    layers[selected].anchorY=Math.max(0,Math.min(1.1,(cy-r.top)/r.height));
    buildEditor(); updateAnchorHandle(); };
  handle.addEventListener("mousedown",e=>{dragging=true; handle.style.cursor="grabbing"; e.preventDefault();});
  window.addEventListener("mousemove",e=>{ if(dragging) moveTo(e.clientX,e.clientY); });
  window.addEventListener("mouseup",()=>{dragging=false; handle.style.cursor="grab";});
  // 触屏支持
  handle.addEventListener("touchstart",e=>{ dragging=true; e.preventDefault(); },{passive:false});
  window.addEventListener("touchmove",e=>{ if(dragging&&e.touches[0]){ moveTo(e.touches[0].clientX,e.touches[0].clientY); e.preventDefault(); } },{passive:false});
  window.addEventListener("touchend",()=>{ dragging=false; });
})();
function updateAnchorHandle(){
  const L=layers[selected];
  if(!L||!anchorVisible){ handle.style.display="none"; return; }
  handle.style.display=""; handle.style.left=(L.anchorX*100)+"%"; handle.style.top=(L.anchorY*100)+"%";
}

// ===== 整体动作按钮 =====
(function(){
  const box=document.getElementById("motionBtns");
  Object.entries(MOTIONS).forEach(([k,v])=>{
    const b=document.createElement("button"); b.textContent=v; b.dataset.m=k;
    b.className = k===globalMotion ? "on" : "";
    b.onclick=()=>{ globalMotion=k; [...box.children].forEach(c=>c.classList.toggle("on",c.dataset.m===k)); };
    box.appendChild(b);
  });
})();

// ===== 全局控件 =====
function bind(id,cb){ const el=document.getElementById(id); el.addEventListener("input",()=>cb(+el.value)); }
bind("speed",v=>{speed=v; speedVal.textContent=v.toFixed(1);});
bind("amp",v=>{amp=v; ampVal.textContent=v.toFixed(1);});
bind("p3amp",v=>{p3amp=v; p3Val.textContent=v.toFixed(1);});
bind("ft",v=>{followThrough=v; ftVal.textContent=v.toFixed(1);});
const modeBtn=document.getElementById("p3mode");
modeBtn.onclick=()=>{ p3mode=p3mode==="auto"?"mouse":"auto"; modeBtn.textContent="模式："+(p3mode==="auto"?"自动摆动":"鼠标跟随"); };
canvas.addEventListener("mousemove",e=>{ const r=canvas.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=((e.clientY-r.top)/r.height)*2-1; });
canvas.addEventListener("mouseleave",()=>{ mouse.x=0; mouse.y=0; });
document.getElementById("toggleAnchor").onclick=()=>{ anchorVisible=!anchorVisible; updateAnchorHandle(); };
document.getElementById("bgTransparent").addEventListener("change",e=>{ bgTransparent=e.target.checked; });

// ===== 上传入口 =====
const filePsd=document.getElementById("filePsd"), filePng=document.getElementById("filePng");
document.getElementById("btnPsd").onclick=()=>filePsd.click();
document.getElementById("btnPng").onclick=()=>filePng.click();
document.getElementById("btnDemo").onclick=loadDemo;
document.getElementById("btnReplace").onclick=()=>dropzone.classList.remove("hide");
filePsd.onchange=e=>{ if(e.target.files[0]) loadPsd(e.target.files[0]); };
filePng.onchange=e=>{ if(e.target.files.length) loadPngs(e.target.files); };
["dragover","dragenter"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault(); dropzone.classList.add("dragover");}));
["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault(); dropzone.classList.remove("dragover");}));
dropzone.addEventListener("drop",e=>{ const files=[...e.dataTransfer.files];
  const psd=files.find(f=>f.name.toLowerCase().endsWith(".psd"));
  if(psd) loadPsd(psd); else if(files.length) loadPngs(files); });

// ================= 导出 =================
let expDur=2, expFps=20, expScaleF=1;
bind("dur",v=>{expDur=v; durVal.textContent=v.toFixed(1);});
bind("fps",v=>{expFps=v; fpsVal.textContent=v;});
bind("expScale",v=>{expScaleF=v; scaleVal.textContent=v.toFixed(1);});
const expStatus=document.getElementById("exportStatus");
const gifBtn=document.getElementById("exportGif"), vidBtn=document.getElementById("exportVideo");

function exportCanvas(){
  const scale=expScaleF*0.4;
  const c=document.createElement("canvas");
  c.width=Math.round(CANVAS_W*scale); c.height=Math.round(CANVAS_H*scale);
  return { c, ctx:c.getContext("2d"), scale };
}
function download(blob,name){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),3000); }

// 统计打点（GoatCounter 自定义事件）：证明“真的有人在生成 meme”，无统计时静默跳过
function track(name){ try{ if(window.goatcounter&&window.goatcounter.count) window.goatcounter.count({path:name, title:name, event:true}); }catch(e){} }

// 把 gif.js 的 worker 下载为本地 Blob，避免跨域 worker 加载失败导致“卡住不下载”
let gifWorkerUrl=null;
async function getGifWorkerUrl(){
  if(gifWorkerUrl) return gifWorkerUrl;
  const res=await fetch("lib/gif.worker.js");
  if(!res.ok) throw new Error("worker 加载失败 "+res.status);
  gifWorkerUrl=URL.createObjectURL(new Blob([await res.text()],{type:"application/javascript"}));
  return gifWorkerUrl;
}

gifBtn.onclick=async ()=>{
  if(!layers.length){ expStatus.textContent="请先加载素材"; return; }
  gifBtn.disabled=vidBtn.disabled=true;
  expStatus.textContent="准备编码器…";
  let workerUrl;
  try { workerUrl=await getGifWorkerUrl(); }
  catch(err){ expStatus.textContent="⚠️ 编码器加载失败（检查网络）："+err.message; gifBtn.disabled=vidBtn.disabled=false; return; }
  const { c, ctx:g, scale }=exportCanvas();
  const transparent=bgTransparent;
  const KEY=0xFF00FF;  // 品红作为透明键色（仅填充全透明像素，边缘做硬阈值，无彩边）
  const opts={ workers:2, quality:10, width:c.width, height:c.height, workerScript:workerUrl };
  if(transparent) opts.transparent=KEY;
  const gif=new GIF(opts);
  const frames=Math.round(expDur*expFps), delay=Math.round(1000/expFps);
  for(let i=0;i<frames;i++){
    drawScene(g, scale, i/expFps*speed, transparent);
    if(transparent){
      const img=g.getImageData(0,0,c.width,c.height), d=img.data;
      for(let j=0;j<d.length;j+=4){
        if(d[j+3]<128){ d[j]=0xFF; d[j+1]=0x00; d[j+2]=0xFF; } // 透明像素涂成键色
        d[j+3]=255; // GIF 只有 1-bit 透明，统一不透明，靠键色抠除
      }
      gif.addFrame(img,{copy:true,delay});
    } else {
      gif.addFrame(g,{copy:true,delay});
    }
  }
  let done=false;
  const guard=setTimeout(()=>{ if(!done) expStatus.textContent="仍在编码…素材较大时请再等等，或调低时长/清晰度"; },12000);
  gif.on("progress",p=>{ expStatus.textContent=`合成 GIF… ${Math.round(p*100)}%`; });
  gif.on("finished",blob=>{ done=true; clearTimeout(guard); download(blob,"meme.gif"); track("export-gif");
    expStatus.textContent=`✅ 已导出 meme.gif (${(blob.size/1024).toFixed(0)} KB)`; gifBtn.disabled=vidBtn.disabled=false; });
  expStatus.textContent=`渲染 GIF… 0%（共 ${frames} 帧）`;
  gif.render();
};

function pickVideoType(){
  if(!window.MediaRecorder) return null;
  const cands=["video/mp4;codecs=avc1.42E01E","video/mp4","video/webm;codecs=vp9","video/webm"];
  for(const m of cands) if(MediaRecorder.isTypeSupported(m)) return { mime:m, ext:m.includes("mp4")?"mp4":"webm" };
  return null;
}
vidBtn.onclick=()=>{
  if(!layers.length){ expStatus.textContent="请先加载素材"; return; }
  const vt=pickVideoType();
  if(!vt){ expStatus.textContent="此浏览器不支持视频录制，请改用 GIF"; return; }
  gifBtn.disabled=vidBtn.disabled=true;
  const { c, ctx:g, scale }=exportCanvas();
  // 平滑关键：用 captureStream(0)+track.requestFrame() 逐帧推送每一帧真实画面，
  // 而不是让浏览器按固定低帧率自行采样（那样会漏帧/重复 → 卡顿）。
  let stream=c.captureStream(0);
  let track=stream.getVideoTracks()[0];
  const manual = typeof track.requestFrame === "function";
  if(!manual){ stream=c.captureStream(60); track=stream.getVideoTracks()[0]; } // 老浏览器退回自动采样
  const rec=new MediaRecorder(stream,{ mimeType:vt.mime, videoBitsPerSecond:8_000_000 });
  const chunks=[]; rec.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  rec.onstop=()=>{ const blob=new Blob(chunks,{type:vt.mime}); download(blob,"meme."+vt.ext); track("export-video");
    expStatus.textContent=`✅ 已导出 meme.${vt.ext} (${(blob.size/1024).toFixed(0)} KB)`; gifBtn.disabled=vidBtn.disabled=false; };
  const note = bgTransparent ? "（视频不支持透明，已用白底）" : "";
  const start=performance.now();
  rec.start();
  (function loop(now){ const t=(now-start)/1000;
    if(t>=expDur){ rec.stop(); return; }
    drawScene(g, scale, t*speed, false); // 视频始终白底
    if(manual) track.requestFrame();     // 手动把这一帧塞进视频流
    expStatus.textContent=`录制 ${vt.ext.toUpperCase()}… ${t.toFixed(1)}/${expDur}s ${note}`;
    requestAnimationFrame(loop); })(start);
};

// 启动时告诉用户本浏览器会导出哪种视频格式
(function(){
  const vt=pickVideoType(); const hint=document.getElementById("fmtHint");
  if(!vt) hint.textContent="提示：本浏览器不支持视频录制，请用 GIF（最通用）。";
  else if(vt.ext==="mp4") hint.textContent="✅ 本浏览器可直接导出 MP4（最通用视频格式）。";
  else hint.textContent="提示：本浏览器暂只能导出 WebM（部分平台如微信不识别）。发表情包建议优先用 GIF；想要 MP4 可换 Chrome/Edge 最新版。";
})();

// ===== 初始化控件：以滑块为唯一数据源，保证「显示值 = 实际生效值」 =====
// 修复点：过去 HTML 默认值和 JS 状态各写一份，缓存/表单还原时会脱节，导致“显示对但动作不对，点一下才生效”。
const CONTROL_DEFAULTS = { speed:1.1, amp:0.6, ft:0, p3amp:0, dur:2, fps:20, expScale:1 };
function initControls(){
  // 1) 强制写入默认值（覆盖浏览器可能还原的旧滑块位置）
  for(const [id,v] of Object.entries(CONTROL_DEFAULTS)){ const el=document.getElementById(id); if(el) el.value=v; }
  const bt=document.getElementById("bgTransparent"); if(bt) bt.checked=false;
  document.querySelectorAll("input[type=range]").forEach(el=>el.setAttribute("autocomplete","off"));
  // 2) 从 DOM 读回，同步到状态与显示（三者从此完全一致）
  const num=id=>+document.getElementById(id).value;
  speed=num("speed");       speedVal.textContent=speed.toFixed(1);
  amp=num("amp");           ampVal.textContent=amp.toFixed(1);
  followThrough=num("ft");  ftVal.textContent=followThrough.toFixed(1);
  p3amp=num("p3amp");       p3Val.textContent=p3amp.toFixed(1);
  expDur=num("dur");        durVal.textContent=expDur.toFixed(1);
  expFps=num("fps");        fpsVal.textContent=expFps;
  expScaleF=num("expScale");scaleVal.textContent=expScaleF.toFixed(1);
  bgTransparent=false;
}
initControls();
// 处理从往返缓存(bfcache)恢复时浏览器还原旧滑块的情况
window.addEventListener("pageshow", e=>{ if(e.persisted) initControls(); });
