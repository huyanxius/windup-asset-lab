const root = '../assets/resources/character';
const FIXED_FPS = 8;
const makeFrames = (base, prefix, count = 8) => Array.from({ length: count }, (_, index) => `${base}/${prefix}-${String(index + 1).padStart(2, '0')}.png`);

const library = {
  side: {
    label: '横屏侧视资产', truth: '真实侧视序列帧',
    idle: { label: '呼吸待机', key: 'idle', frames: makeFrames(`${root}/views/side`, 'idle'), fps: 8, loop: true, batch: 'B-20260713-11', initial: 'pending' },
    walk: { label: '行走', key: 'walk', frames: makeFrames(`${root}/frames`, 'walk'), fps: 8, loop: true, batch: 'B-20260713-05', initial: 'pass' },
    run: { label: '奔跑', key: 'run', frames: makeFrames(`${root}/views/side`, 'run'), fps: 8, loop: true, batch: 'B-20260713-09', initial: 'pending' },
    jump: { label: '跳跃', key: 'jump', frames: makeFrames(`${root}/views/side`, 'jump'), fps: 8, loop: false, batch: 'B-20260713-12', initial: 'pending' },
    lantern: { label: '举灯点亮', key: 'lantern', frames: makeFrames(`${root}/views/side`, 'lantern'), fps: 8, loop: false, batch: 'B-20260713-10', initial: 'pending', rejected: [4] },
  },
  topdown: {
    label: '真实俯视资产', truth: '母版约束的独立俯视绘制',
    walk: { label: '行走', key: 'walk', frames: makeFrames(`${root}/views/topdown`, 'walk'), fps: 8, loop: true, batch: 'B-20260713-07', initial: 'pending' },
    run: { label: '奔跑', key: 'run', frames: makeFrames(`${root}/views/topdown`, 'run'), fps: 8, loop: true, batch: 'B-20260713-13', initial: 'pending' },
  },
  isometric: {
    label: '真实 2.5D 资产', truth: '母版约束的独立 3/4 绘制',
    walk: { label: '行走', key: 'walk', frames: makeFrames(`${root}/views/isometric`, 'walk'), fps: 8, loop: true, batch: 'B-20260713-08', initial: 'pending' },
    run: { label: '奔跑', key: 'run', frames: makeFrames(`${root}/views/isometric`, 'run'), fps: 8, loop: true, batch: 'B-20260713-14', initial: 'pending' },
  },
};

const actionOrder = ['idle', 'walk', 'run', 'jump', 'lantern'];
const actionLabels = { idle: ['呼吸待机', '标准动作'], walk: ['行走', '标准动作'], run: ['奔跑', '标准动作'], jump: ['跳跃', '标准动作'], lantern: ['举灯点亮', '自定义动作'] };
const state = { view: 'side', action: 'idle', frame: 0, playing: true, timer: null, reviews: JSON.parse(localStorage.getItem('windup-review-state') || '{}') };
const movement = { x: 0, direction: 1, left: false, right: false, auto: false, wasMoving: false, lastTime: performance.now() };

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['assetDrawer','sidebarToggle','sidebarReveal','drawerHotspot','actionList','batchId','batchRoute','actionName','exportBtn','gamePreviewBtn','enterGameBtn','gameDock','gameFrame','gameStatus','closeGameBtn','sendGameBtn','viewTabs','gridToggle','checkerToggle','stage','viewLabel','viewTruth','characterFrame','missingState','firstBtn','prevBtn','playBtn','nextBtn','lastBtn','moveLeftBtn','moveRightBtn','autoWalkBtn','frameCounter','timeCounter','fpsSlider','fpsValue','loopToggle','timeline','specName','instanceStatus','specFrames','specPlayback','qcSummary','qcChecks','selectedFrame','frameBatch','frameState','reviewNote','rejectBtn','approveBtn','gateMessage','approvalProgress','approvalText'].map(id => [id, $(id)]));

function currentAsset() { return library[state.view]?.[state.action] || null; }
function reviewKey() { return `${state.view}:${state.action}`; }
function ensureReviews(asset) {
  if (!state.reviews[reviewKey()]) {
    state.reviews[reviewKey()] = asset.frames.map((_, index) => asset.rejected?.includes(index) ? 'reject' : asset.initial);
  }
  return state.reviews[reviewKey()];
}

function renderActions() {
  els.actionList.innerHTML = actionOrder.map(key => {
    const asset = library[state.view][key];
    const [label, type] = actionLabels[key];
    return `<button class="action-item ${state.action === key ? 'active' : ''}" data-action="${key}"><span><b>${label}</b><small>${type}</small></span><em class="${asset ? 'ready' : 'gap'}">${asset ? `${asset.frames.length} 帧` : '缺口'}</em></button>`;
  }).join('');
  els.actionList.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { state.action = button.dataset.action; state.frame = 0; render(); }));
}

function setPlayback() {
  clearInterval(state.timer);
  const asset = currentAsset();
  if (!asset || !state.playing) return;
  state.timer = setInterval(() => {
    if (state.frame >= asset.frames.length - 1 && !els.loopToggle.checked) { state.playing = false; els.playBtn.textContent = '播放'; clearInterval(state.timer); return; }
    state.frame = (state.frame + 1) % asset.frames.length;
    renderFrameOnly();
  }, 1000 / FIXED_FPS);
}

function pauseForReview() {
  state.playing = false;
  clearInterval(state.timer);
  els.playBtn.textContent = '播放';
}

function renderFrameOnly() {
  const asset = currentAsset();
  if (!asset) return;
  els.characterFrame.src = asset.frames[state.frame];
  els.frameCounter.textContent = `${String(state.frame + 1).padStart(2, '0')} / ${String(asset.frames.length).padStart(2, '0')}`;
  els.timeCounter.textContent = `${(state.frame / FIXED_FPS).toFixed(2)} s`;
  els.selectedFrame.textContent = `#${String(state.frame + 1).padStart(2, '0')}`;
  const reviews = ensureReviews(asset);
  els.frameState.textContent = ({ pass: '通过', pending: '待审核', reject: '退回' })[reviews[state.frame]];
  els.timeline.querySelectorAll('.frame-tile').forEach((tile, index) => {
    tile.classList.toggle('active', index === state.frame);
    if (index === state.frame) {
      const panel = tile.closest('.timeline-viewport');
      if (panel) {
        const targetTop = tile.offsetTop - panel.clientHeight / 2 + tile.clientHeight / 2;
        panel.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    }
  });
  applyPlayerTransform();
}

function applyPlayerTransform(){els.characterFrame.style.setProperty('--player-x',`${movement.x}px`);els.characterFrame.style.setProperty('--facing',movement.direction);}

const fEls = {
  onionToggle: document.getElementById('onionToggle'),
  onionPrev: document.getElementById('onionPrev'),
  onionNext: document.getElementById('onionNext'),
  packerModal: document.getElementById('packerModal'),
  closePackerBtn: document.getElementById('closePackerBtn'),
  spriteCanvas: document.getElementById('spriteCanvas'),
  spriteJson: document.getElementById('spriteJson'),
  spriteMeta: document.getElementById('spriteMeta'),
  downloadPackBtn: document.getElementById('downloadPackBtn'),
  anchorCoords: document.getElementById('anchorCoords')
};

const frameOffsets = {};
let baseAnchor = {x: 128, y: 238};

const originalRenderFrameOnly = renderFrameOnly;
renderFrameOnly = function() {
  originalRenderFrameOnly();
  const asset = currentAsset();
  if (!asset) return;
  
  // 1. Onion Skin logic
  if (fEls.onionToggle.checked) {
    const prevIdx = (state.frame - 1 + asset.frames.length) % asset.frames.length;
    const nextIdx = (state.frame + 1) % asset.frames.length;
    fEls.onionPrev.src = asset.frames[prevIdx];
    fEls.onionNext.src = asset.frames[nextIdx];
    fEls.onionPrev.classList.add('show');
    fEls.onionNext.classList.add('show');
  } else {
    fEls.onionPrev.classList.remove('show');
    fEls.onionNext.classList.remove('show');
  }

  // 2. Nudge & Anchor UI update
  const key = `${state.action}_${state.view}_${state.frame}`;
  const offset = frameOffsets[key] || {x: 0, y: 0};
  els.characterFrame.style.setProperty('--nudge-x', `${offset.x}px`);
  els.characterFrame.style.setProperty('--nudge-y', `${offset.y}px`);
  els.characterFrame.style.transform = `translateX(calc(-50% + var(--player-x, 0px) + var(--nudge-x, 0px))) translateY(var(--nudge-y, 0px)) scaleX(var(--facing, 1))`;
  fEls.anchorCoords.textContent = `${baseAnchor.x}, ${baseAnchor.y}`;
};
fEls.onionToggle.addEventListener('change', renderFrameOnly);

// 3. Anchor Dragging logic
let isDragging = false, hasDragged = false, startX, startY, initAnchorX, initAnchorY;
els.characterFrame.addEventListener('mousedown', (e) => {
  e.preventDefault(); // Fix native image drag blocking the custom drag
  isDragging = true;
  hasDragged = false;
  startX = e.clientX; startY = e.clientY;
  initAnchorX = baseAnchor.x; initAnchorY = baseAnchor.y;
  els.characterFrame.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) hasDragged = true;
  baseAnchor.x = Math.round(initAnchorX - (e.clientX - startX));
  baseAnchor.y = Math.round(initAnchorY - (e.clientY - startY));
  fEls.anchorCoords.textContent = `${baseAnchor.x}, ${baseAnchor.y}`;
});
window.addEventListener('mouseup', () => {
  isDragging = false;
  els.characterFrame.style.cursor = '';
});
// 4. Click stage or character to toggle action
els.stage.addEventListener('click', (e) => {
  if (hasDragged) return;
  if (e.target.closest('.sidebar, .inspector, .topbar, .view-toolbar, .playback, .timeline-panel, .tool-toggles')) return;
  
  const viewLib = library[state.view];
  let targetAction = state.action;
  let isMoving = true;
  
  if (state.action === 'idle') {
    if (viewLib.walk) targetAction = 'walk';
  } else if (state.action === 'walk') {
    if (viewLib.idle) { targetAction = 'idle'; isMoving = false; }
    else if (viewLib.run) targetAction = 'run';
  } else if (state.action === 'run') {
    if (viewLib.idle) { targetAction = 'idle'; isMoving = false; }
    else if (viewLib.walk) targetAction = 'walk';
  }
  
  if (targetAction !== state.action) {
    state.action = targetAction;
    movement.auto = isMoving;
    els.autoWalkBtn.classList.toggle('active', isMoving);
    els.autoWalkBtn.textContent = isMoving ? '停止巡走' : '自动巡走';
    render();
  }
  
  const prompt = document.createElement('div');
  prompt.textContent = isMoving ? `▶ 开始${actionLabels[state.action][0]}` : '⏸ 停止动画';
  prompt.className = 'click-prompt';
  prompt.style.left = `${e.clientX}px`;
  prompt.style.top = `${e.clientY - 20}px`;
  document.body.appendChild(prompt);
  setTimeout(() => prompt.remove(), 1000);
});

function switchMovementAction(isMoving){
  if(isMoving){state.playing=true;if(state.action!=='walk'&&library[state.view].walk){state.action='walk';state.frame=0;render();}else setPlayback();}
  else if(library[state.view].idle){state.playing=true;if(state.action!=='idle'){state.action='idle';state.frame=0;render();}else setPlayback();}
  else{state.playing=false;els.playBtn.textContent='播放';setPlayback();}
}
function movementLoop(now){
  const delta=Math.min((now-movement.lastTime)/1000,.05);movement.lastTime=now;
  const axis=Number(movement.right)-Number(movement.left);const moving=movement.auto||axis!==0;
  if(moving!==movement.wasMoving){movement.wasMoving=moving;switchMovementAction(moving);}
  if(moving && state.playing){if(!movement.auto)movement.direction=axis>0?1:-1;movement.x+=movement.direction*145*delta;const edge=Math.max(80,els.stage.clientWidth/2-145);if(movement.x>=edge){movement.x=edge;movement.direction=-1;}if(movement.x<=-edge){movement.x=-edge;movement.direction=1;}applyPlayerTransform();}
  requestAnimationFrame(movementLoop);
}

function renderTimeline(asset) {
  const reviews = ensureReviews(asset);
  els.timeline.innerHTML = asset.frames.map((src, index) => `<button class="frame-tile ${index === state.frame ? 'active' : ''}" data-frame="${index}"><img src="${src}" alt="第 ${index + 1} 帧"><i class="${reviews[index]}"></i><span><b>#${String(index + 1).padStart(2, '0')}</b><small>${({ pass:'通过',pending:'待审',reject:'退回' })[reviews[index]]}</small></span></button>`).join('');
  els.timeline.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { pauseForReview(); state.frame = Number(button.dataset.frame); renderFrameOnly(); }));
}

async function analyze(asset) {
  const results = await Promise.all(asset.frames.map(src => new Promise(resolve => {
    const image = new Image(); image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minY = canvas.height, maxY = -1, maxX = -1, minX = canvas.width, opaque = 0, sumX = 0, sumY = 0;
      for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++){ if(data[(y*canvas.width+x)*4+3]>24){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);opaque++;sumX+=x;sumY+=y;} }
      resolve({ width: canvas.width, height: canvas.height, minX, maxX, minY, maxY, opaque, cx: sumX/opaque, cy: sumY/opaque });
    }; image.onerror = () => resolve(null); image.src = src;
  })));
  const valid = results.filter(Boolean); const feet = valid.map(item => item.maxY); const heights = valid.map(item => item.maxY-item.minY+1);
  const footDrift = Math.max(...feet)-Math.min(...feet); const heightDrift = Math.max(...heights)-Math.min(...heights);
  const steps = valid.slice(1).map((item,index)=>Math.hypot(item.cx-valid[index].cx,item.cy-valid[index].cy));
  const sortedSteps = [...steps].sort((a,b)=>a-b); const medianStep = sortedSteps[Math.floor(sortedSteps.length/2)] || 0; const maxStep = Math.max(...steps,0);
  const areaDeltas = valid.slice(1).map((item,index)=>Math.abs(item.opaque-valid[index].opaque)/Math.max(item.opaque,valid[index].opaque)*100); const maxAreaDelta = Math.max(...areaDeltas,0);
  const first=valid[0], last=valid.at(-1); const seam=Math.hypot(first.cx-last.cx,first.cy-last.cy); const seamArea=Math.abs(first.opaque-last.opaque)/Math.max(first.opaque,last.opaque)*100;
  const continuityPass=maxStep<=medianStep*2.6+2; const areaPass=maxAreaDelta<=(asset.loop?18:28); const seamPass=!asset.loop||(seam<=10&&seamArea<=14);
  const checks = [
    ['画布一致', valid.length === asset.frames.length && valid.every(item => item.width===256 && item.height===256), `${valid.length}/${asset.frames.length} · 256×256`],
    ['透明背景', valid.every(item => item.opaque < 256*256*.65), 'Alpha 通道可用'],
    ['脚底线偏差', footDrift <= 3, `${footDrift}px / 阈值 3px`],
    ['主体高度偏差', heightDrift <= 7, `${heightDrift}px / 阈值 7px`],
    ['相邻帧位移连续性', continuityPass, `最大 ${maxStep.toFixed(1)}px · 中值 ${medianStep.toFixed(1)}px`],
    ['轮廓面积波动', areaPass, `最大 ${maxAreaDelta.toFixed(1)}%`],
    ['循环首尾接缝', seamPass, asset.loop?`位移 ${seam.toFixed(1)}px · 面积 ${seamArea.toFixed(1)}%`:'单次动作·不适用'],
  ];
  els.qcChecks.innerHTML = checks.map(([name, pass, detail]) => `<div class="qc-row ${pass?'pass':'warn'}"><i>${pass?'✓':'!'}</i><b>${name}</b><span>${detail}</span></div>`).join('');
  const passed = checks.filter(check => check[1]).length; const score=Math.round((Number(continuityPass)+Number(areaPass)+Number(seamPass))/3*100); els.qcSummary.textContent = `${passed} / ${checks.length} 项通过 · 几何连续性 ${score}`;
}

function updateGate(asset) {
  const reviews = ensureReviews(asset); const passed = reviews.filter(value => value==='pass').length; const allPass = passed === reviews.length;
  els.approvalProgress.style.width = `${passed/reviews.length*100}%`; els.approvalText.textContent = `${passed} / ${reviews.length} 帧通过`;
  els.exportBtn.disabled = !allPass; els.gateMessage.textContent = allPass ? '动作已满足导出条件，可生成 Cocos 图集与 metadata。' : '全部帧通过后才可导出，避免残缺动作进入项目。';
  const hasReject = reviews.includes('reject'); els.instanceStatus.className = `status ${allPass?'pass':hasReject?'reject':'pending'}`; els.instanceStatus.textContent = allPass?'已通过':hasReject?'有退回帧':'待审核';
}

function render() {
  renderActions(); const asset = currentAsset(); const view = library[state.view];
  els.viewTabs.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.view===state.view));
  els.stage.className = `stage mode-${state.view} ${els.gridToggle.checked?'show-grid':''} ${els.checkerToggle.checked?'checker':''}`;
  els.viewLabel.textContent = view.label; els.viewTruth.textContent = view.truth; els.missingState.hidden = Boolean(asset); els.characterFrame.hidden = !asset;
  if (!asset) { clearInterval(state.timer); els.actionName.textContent = `${view.label} · ${actionLabels[state.action][0]}（缺口）`; els.timeline.innerHTML=''; els.exportBtn.disabled=true; return; }
  state.frame = Math.min(state.frame, asset.frames.length-1); els.actionName.textContent = `${view.label} · ${asset.label}`; els.batchId.textContent=asset.batch; els.frameBatch.textContent=asset.batch;
  els.specName.textContent = `${asset.key} / ${state.view}`; els.specFrames.textContent=asset.frames.length; els.fpsSlider.value=FIXED_FPS; els.fpsValue.textContent=FIXED_FPS; els.loopToggle.checked=asset.loop; els.specPlayback.textContent=`${FIXED_FPS} FPS · ${asset.loop?'循环':'单次'}`;
  renderTimeline(asset); renderFrameOnly(); updateGate(asset); analyze(asset); setPlayback();
  if (!els.gameDock.hidden) setTimeout(syncGame, 0);
}

els.viewTabs.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {if(button.dataset.view===state.view)return;els.stage.classList.add('view-leave');setTimeout(()=>{state.view=button.dataset.view;if(!library[state.view][state.action])state.action='walk';state.frame=0;render();els.stage.classList.remove('view-leave');els.stage.classList.add('view-enter');setTimeout(()=>els.stage.classList.remove('view-enter'),260);},180);}));
els.playBtn.addEventListener('click',()=>{state.playing=!state.playing;els.playBtn.textContent=state.playing?'暂停':'播放';setPlayback();});
els.firstBtn.addEventListener('click',()=>{pauseForReview();state.frame=0;renderFrameOnly();}); els.lastBtn.addEventListener('click',()=>{pauseForReview();state.frame=currentAsset().frames.length-1;renderFrameOnly();});
els.prevBtn.addEventListener('click',()=>{pauseForReview();state.frame=(state.frame-1+currentAsset().frames.length)%currentAsset().frames.length;renderFrameOnly();}); els.nextBtn.addEventListener('click',()=>{pauseForReview();state.frame=(state.frame+1)%currentAsset().frames.length;renderFrameOnly();});
els.fpsSlider.addEventListener('input',()=>{els.fpsValue.textContent=els.fpsSlider.value;setPlayback();}); els.loopToggle.addEventListener('change',setPlayback);
els.gridToggle.addEventListener('change',render); els.checkerToggle.addEventListener('change',render);
function setReview(value){pauseForReview();const asset=currentAsset();ensureReviews(asset)[state.frame]=value;localStorage.setItem('windup-review-state',JSON.stringify(state.reviews));renderTimeline(asset);renderFrameOnly();updateGate(asset);}
els.approveBtn.addEventListener('click',()=>setReview('pass')); els.rejectBtn.addEventListener('click',()=>setReview('reject'));

// Automatic Spotlight Reveal & Walk Trigger
function bootReveal() {
  const rect = els.characterFrame.getBoundingClientRect();
  const charX = rect.left + rect.width / 2;
  const charY = rect.top + rect.height / 2;
  
  const spotlight = document.createElement('div');
  spotlight.className = 'dynamic-spotlight';
  spotlight.style.left = `${charX}px`;
  spotlight.style.top = `${charY}px`;
  document.body.appendChild(spotlight);
  
  const bootScreen = document.getElementById('bootScreen');
  if (bootScreen) setTimeout(() => bootScreen.remove(), 100);
  
  setTimeout(() => spotlight.remove(), 3000);
  
  setTimeout(() => {
    const viewLib = library[state.view];
    if (state.action === 'idle' && viewLib.walk) {
      state.action = 'walk';
      movement.auto = true;
      els.autoWalkBtn.classList.add('active');
      els.autoWalkBtn.textContent = '停止巡走';
      render();
    }
    const prompt = document.createElement('div');
    prompt.textContent = `▶ 开始${actionLabels[state.action][0]}`;
    prompt.className = 'click-prompt';
    prompt.style.left = `calc(50% + 50px)`;
    prompt.style.top = `calc(50% - 30px)`;
    document.body.appendChild(prompt);
    setTimeout(() => prompt.remove(), 2500);
  }, 2800);
}
setTimeout(bootReveal, 100);

els.exportBtn.addEventListener('click', async () => {
  const asset=currentAsset(); const reviews=ensureReviews(asset); if(reviews.some(value=>value!=='pass'))return;
  fEls.packerModal.showModal();
  fEls.spriteMeta.textContent = `打包中...`;
  const canvas = fEls.spriteCanvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  const imgs = await Promise.all(asset.frames.map(src => new Promise(resolve => {
    const img = new Image(); img.onload = () => resolve(img); img.src = src;
  })));
  
  const w = 256, h = 256;
  canvas.width = w * imgs.length; canvas.height = h;
  
  let json = { frames: {}, meta: { app: "Windup Asset Lab", image: `lamplighter-${asset.key}.png`, format: "RGBA8888", size: { w: canvas.width, h: canvas.height }, scale: "1" } };
  
  imgs.forEach((img, i) => {
    const key = `${state.action}_${state.view}_${i}`;
    const offset = frameOffsets[key] || {x: 0, y: 0};
    ctx.drawImage(img, i * w + offset.x, offset.y, w, h);
    json.frames[`${asset.key}_${String(i+1).padStart(2,'0')}.png`] = {
      frame: { x: i * w, y: 0, w, h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
      anchor: { x: (baseAnchor.x / w).toFixed(2), y: ((h - baseAnchor.y) / h).toFixed(2) }
    };
  });
  
  const dataUrl = canvas.toDataURL('image/png');
  const bytes = Math.round(dataUrl.length * 0.75);
  fEls.spriteMeta.textContent = `${canvas.width} x ${canvas.height} · ${(bytes/1024).toFixed(1)} KB`;
  fEls.spriteJson.value = JSON.stringify(json, null, 2);
  
  fEls.downloadPackBtn.onclick = () => {
    const link = document.createElement('a'); link.href = dataUrl; link.download = `lamplighter-${asset.key}.png`; link.click();
    const jsonLink = document.createElement('a'); jsonLink.href = URL.createObjectURL(new Blob([fEls.spriteJson.value], {type: 'application/json'})); jsonLink.download = `lamplighter-${asset.key}.json`; jsonLink.click();
  };
});
fEls.closePackerBtn.addEventListener('click', () => fEls.packerModal.close());
// Sync to Cocos Game
function gamePayload(){const asset=currentAsset();return asset?{type:'windup:preview-animation',action:asset.key,view:state.view,fps:FIXED_FPS,loop:els.loopToggle.checked}:null;}
function syncGame(){const payload=gamePayload();if(!payload){els.gameStatus.textContent='缺少该视角资产';return;}els.gameStatus.textContent='正在同步…';els.gameFrame.contentWindow?.postMessage(payload,'http://127.0.0.1:4173');}
els.gamePreviewBtn.addEventListener('click', () => {
  els.gameDock.hidden = false;
  setTimeout(syncGame, 350);
});
els.closeGameBtn.addEventListener('click', () => {
  els.gameDock.hidden = true;
});
els.sendGameBtn.addEventListener('click', syncGame);
els.gameFrame.addEventListener('load', syncGame);

els.enterGameBtn.addEventListener('click',()=>{const payload=gamePayload();const game=window.open('http://127.0.0.1:4173/','windup-cocos-game');if(!game||!payload)return;[700,1400,2400].forEach(delay=>setTimeout(()=>game.postMessage(payload,'http://127.0.0.1:4173'),delay));});
let drawerCloseTimer=null;function setDrawer(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);els.sidebarToggle.setAttribute('aria-expanded',String(!collapsed));els.sidebarReveal.setAttribute('aria-expanded',String(!collapsed));}
function openDrawer(){clearTimeout(drawerCloseTimer);setDrawer(false);}function scheduleDrawerClose(){clearTimeout(drawerCloseTimer);drawerCloseTimer=setTimeout(()=>setDrawer(true),260);}
els.sidebarToggle.addEventListener('click',()=>setDrawer(true));els.sidebarReveal.addEventListener('mouseenter',openDrawer);els.sidebarReveal.addEventListener('focus',openDrawer);els.drawerHotspot.addEventListener('mouseenter',openDrawer);els.assetDrawer.addEventListener('mouseenter',()=>clearTimeout(drawerCloseTimer));els.assetDrawer.addEventListener('mouseleave',scheduleDrawerClose);
window.addEventListener('message',event=>{if(event.origin!=='http://127.0.0.1:4173')return;if(event.data?.type==='windup:preview-ready')els.gameStatus.textContent='游戏已连接';if(event.data?.type==='windup:preview-applied')els.gameStatus.textContent=`已同步 ${event.data.view} / ${event.data.action} · ${event.data.frames}帧`;if(event.data?.type==='windup:preview-error')els.gameStatus.textContent=`同步失败·${event.data.reason}`;});
function setMoveKey(direction,pressed){movement[direction]=pressed;if(pressed)movement.auto=false;els.autoWalkBtn.classList.toggle('active',movement.auto);if(!movement.auto)els.autoWalkBtn.textContent='自动巡走';}
[['moveLeftBtn','left'],['moveRightBtn','right']].forEach(([id,direction])=>{const button=els[id];button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);setMoveKey(direction,true);});button.addEventListener('pointerup',()=>setMoveKey(direction,false));button.addEventListener('pointercancel',()=>setMoveKey(direction,false));});
els.autoWalkBtn.addEventListener('click',()=>{movement.auto=!movement.auto;movement.left=false;movement.right=false;els.autoWalkBtn.classList.toggle('active',movement.auto);els.autoWalkBtn.textContent=movement.auto?'停止巡走':'自动巡走';});
window.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(!state.playing && (event.code.startsWith('Arrow'))) {
    const key = `${state.action}_${state.view}_${state.frame}`;
    if (!frameOffsets[key]) frameOffsets[key] = {x: 0, y: 0};
    if (event.code === 'ArrowUp') { frameOffsets[key].y -= 1; }
    else if (event.code === 'ArrowDown') { frameOffsets[key].y += 1; }
    else if (event.code === 'ArrowLeft') { frameOffsets[key].x -= 1; }
    else if (event.code === 'ArrowRight') { frameOffsets[key].x += 1; }
    event.preventDefault(); renderFrameOnly(); return;
  }
  if(event.code==='Space'){event.preventDefault();els.playBtn.click();}
  if(event.code==='ArrowRight'||event.code==='KeyD'){event.preventDefault();setMoveKey('right',true);}
  if(event.code==='ArrowLeft'||event.code==='KeyA'){event.preventDefault();setMoveKey('left',true);}
});
window.addEventListener('keyup',event=>{
  if(event.code==='ArrowRight'||event.code==='KeyD')setMoveKey('right',false);
  if(event.code==='ArrowLeft'||event.code==='KeyA')setMoveKey('left',false);
});
render();
setDrawer(true);
requestAnimationFrame(movementLoop);
