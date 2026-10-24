(() => {
'use strict';
const CONFIG = {
  baseSpeed: 5, maxSpeed: 15, roadWidthRatio: 0.72, laneCount: 4,
  spawnEveryMs: 1050, minSpawnMs: 520, memeCooldownMs: 4600,
  playerWidth: 44, playerHeight: 76, startingLives: 3,
  moveSpeed: 390, collisionGraceMs: 850, soundEnabled: true
};
const MEMES = [
  '😤 কিরে মামা, সাইড দে!', '🛺 ভাড়া কত ভাই?', '🚌 বাসের সামনে যাইস না!',
  '😂 কী কস মামা!', '🍵 চা খেয়ে আয়!', '💨 ওস্তাদ, আস্তে!',
  '📣 হর্ন দে মামা!', '🐍 হেলো ভাই!', '💥 ধাক্কা খাইলি!',
  '🇧🇩 রাস্তা আমার, নিয়ম কার?', 'রিকশাওয়ালা ভাই, লিজেন্ড!', 'মামা, ব্রেক কই?'
];
const TYPES = [
  {emoji:'🚌',name:'bus',w:59,h:112,points:18,color:'#227e47'},
  {emoji:'🚗',name:'car',w:46,h:78,points:12,color:'#c43b35'},
  {emoji:'🏍️',name:'bike',w:31,h:58,points:7,color:'#f4b72c'},
  {emoji:'🛺',name:'rickshaw',w:43,h:73,points:10,color:'#6d43a3'},
  {emoji:'🚐',name:'van',w:51,h:91,points:14,color:'#e7e1c7'}
];
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
let W=0,H=0,dpr=1,lastTime=0,animationId=0,popupTimer=0;
let audioCtx=null,master=null,engineOsc=null,engineGain=null,muted=false;
const game={state:'ready',score:0,lives:3,distance:0,speed:CONFIG.baseSpeed,roadOffset:0,obstacles:[],particles:[],lastSpawn:0,lastMeme:0,lastCrash:0,lastSound:0,keys:{},touchDir:null,best:0,spawnMs:CONFIG.spawnEveryMs};
const player={x:0,y:0,w:CONFIG.playerWidth,h:CONFIG.playerHeight,tilt:0};
function resize(){
 const rect=$('game-container').getBoundingClientRect(); W=Math.max(320,rect.width);H=Math.max(320,rect.height);dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 player.y=H-155; if(!player.x)player.x=W/2;
}
window.addEventListener('resize',resize);resize();
function road(){const width=Math.min(W-22,Math.max(245,W*CONFIG.roadWidthRatio));return {left:(W-width)/2,width,right:(W+width)/2,lane:width/CONFIG.laneCount};}
function laneX(lane){const r=road();return r.left+r.lane*(lane+.5);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function initAudio(){
 if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
 audioCtx=new AC();master=audioCtx.createGain();master.gain.value=muted?0:.32;master.connect(audioCtx.destination);
}
function tone(freq,duration=.12,type='sine',volume=.12,endFreq=null,delay=0){
 if(!audioCtx||muted)return;const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();
 o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+duration);
 g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+duration);
 o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.02);
}
function startEngine(){if(!audioCtx||muted)return;stopEngine();engineOsc=audioCtx.createOscillator();engineGain=audioCtx.createGain();const filter=audioCtx.createBiquadFilter();engineOsc.type='sawtooth';engineOsc.frequency.value=72;filter.type='lowpass';filter.frequency.value=260;engineGain.gain.value=.018;engineOsc.connect(filter);filter.connect(engineGain);engineGain.connect(master);engineOsc.start();}
function stopEngine(){if(engineOsc){try{engineOsc.stop()}catch(e){}engineOsc=null;engineGain=null;}}
function engineUpdate(){if(engineOsc&&engineGain&&audioCtx){engineOsc.frequency.setTargetAtTime(48+game.speed*7,audioCtx.currentTime,.12);engineGain.gain.setTargetAtTime(.008+game.speed*.002,audioCtx.currentTime,.15);}}
function crashSound(){tone(130,.28,'square',.3,42);tone(500,.22,'sawtooth',.14,120,.02);}
function scoreSound(){tone(720,.08,'sine',.11,1250);}
function speak(text){if(muted||!('speechSynthesis'in window))return;const clean=text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').trim();if(!clean)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(clean);u.lang='bn-BD';u.rate=1.03;u.pitch=1.12;u.volume=.75;const v=speechSynthesis.getVoices();const bn=v.find(x=>x.lang.toLowerCase().startsWith('bn'));if(bn)u.voice=bn;speechSynthesis.speak(u)}catch(e){}}
function popup(text,voice=false){const el=$('memePopup');el.textContent=text;el.classList.add('show');clearTimeout(popupTimer);popupTimer=setTimeout(()=>el.classList.remove('show'),1350);if(voice)speak(text);}
function updateHud(){ $('score').textContent=Math.floor(game.score);$('lives').textContent='❤️'.repeat(Math.max(0,game.lives))||'💔';$('speed').textContent=Math.round(game.speed*8);$('distance').textContent=Math.floor(game.distance); }
function spawn(){
 const type=TYPES[Math.floor(Math.random()*TYPES.length)],lane=Math.floor(Math.random()*CONFIG.laneCount);
 const r=road();game.obstacles.push({...type,x:laneX(lane),y:-type.h-25,lane,passed:false,wiggle:Math.random()*6.28});
}
function addParticles(x,y,color,count=18){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=40+Math.random()*210;game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,life:.5+Math.random()*.65,maxLife:1,color,size:2+Math.random()*5});}}
function hit(a,b){return Math.abs(a.x-b.x)<(a.w+b.w)*.39&&Math.abs(a.y-b.y)<(a.h+b.h)*.39;}
function update(dt,now){
 if(game.state!=='playing')return;
 game.speed=Math.min(CONFIG.maxSpeed,CONFIG.baseSpeed+game.distance/350);
 game.distance+=game.speed*dt*2.4;game.score+=game.speed*dt*1.25;game.roadOffset=(game.roadOffset+game.speed*dt*95)%70;
 game.spawnMs=Math.max(CONFIG.minSpawnMs,CONFIG.spawnEveryMs-game.distance*1.8);
 let dir=0;if(game.keys.ArrowLeft||game.keys.a||game.keys.A||game.touchDir==='left')dir=-1;if(game.keys.ArrowRight||game.keys.d||game.keys.D||game.touchDir==='right')dir=1;
 const r=road(),minX=r.left+player.w*.55+4,maxX=r.right-player.w*.55-4;
 player.x=clamp(player.x+dir*CONFIG.moveSpeed*dt,minX,maxX);player.tilt+=(dir*.16-player.tilt)*Math.min(1,dt*8);
 if(game.keys.ArrowUp||game.keys.w||game.keys.W||game.touchDir==='up')game.speed=Math.min(CONFIG.maxSpeed,game.speed+dt*4);
 if(game.keys.ArrowDown||game.keys.s||game.keys.S||game.touchDir==='down')game.speed=Math.max(CONFIG.baseSpeed*.55,game.speed-dt*5);
 if(now-game.lastSpawn>game.spawnMs){spawn();game.lastSpawn=now;}
 for(let i=game.obstacles.length-1;i>=0;i--){const o=game.obstacles[i];o.y+=(game.speed*40+o.h*.6)*dt;
   if(!o.passed&&o.y>player.y+player.h*.58){o.passed=true;game.score+=o.points;scoreSound();}
   if(now-game.lastCrash>CONFIG.collisionGraceMs&&hit({x:player.x,y:player.y,w:player.w*.75,h:player.h*.78},o)){
    game.lives--;game.lastCrash=now;addParticles(player.x,player.y,'#ffdc51',24);crashSound();popup(MEMES[Math.floor(Math.random()*MEMES.length)],true);game.obstacles.splice(i,1);
    if(game.lives<=0){gameOver();return;}continue;
   }
   if(o.y>H+150)game.obstacles.splice(i,1);
 }
 for(let i=game.particles.length-1;i>=0;i--){const p=game.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;p.life-=dt;if(p.life<=0)game.particles.splice(i,1);}
 if(now-game.lastMeme>CONFIG.memeCooldownMs&&Math.random()<dt*.25){popup(MEMES[Math.floor(Math.random()*MEMES.length)],Math.random()<.25);game.lastMeme=now;}
 if(now-game.lastSound>120){engineUpdate();game.lastSound=now;}
 updateHud();
}
function drawBackground(){
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#7bc9dd');sky.addColorStop(.55,'#d5e9b5');sky.addColorStop(1,'#7eac60');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 // buildings and trees outside road
 const r=road();for(let side=0;side<2;side++){const x0=side===0?0:r.right,ww=side===0?r.left:W-r.right;
  for(let i=0;i<8;i++){const bw=18+(i*17%35),bh=55+(i*31%100),x=x0+(i*49%(Math.max(ww,1)-Math.min(bw,Math.max(ww-1,1))+1));const y=H-bh;
   ctx.fillStyle=['#d8c7a0','#d1d8c5','#b9c8a5','#d7b9a5'][i%4];ctx.fillRect(x,y,bw,bh);
   ctx.fillStyle='#5a8173';for(let wy=y+10;wy<H-8;wy+=19)for(let wx=x+5;wx<x+bw-4;wx+=13)ctx.fillRect(wx,wy,5,8);
  }
 }
 ctx.fillStyle='#b8b7a6';ctx.fillRect(r.left-7,0,7,H);ctx.fillRect(r.right,0,7,H);
 ctx.fillStyle='#3a3d3b';ctx.fillRect(r.left,0,r.width,H);
 ctx.fillStyle='#e7e3cf';ctx.fillRect(r.left+3,0,3,H);ctx.fillRect(r.right-6,0,3,H);
 for(let lane=1;lane<CONFIG.laneCount;lane++){const x=r.left+r.lane*lane;for(let y=-70+game.roadOffset;y<H;y+=70){ctx.fillStyle=lane===2?'#f4ce4b':'#e8e5d5';ctx.fillRect(x-2,y,4,34);}}
 // road markings and Bangladeshi roadside poster boards
 for(let y=100-(game.roadOffset*1.3%180);y<H;y+=180){ctx.fillStyle='#0c6b3e';ctx.fillRect(r.left-48,y,39,26);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(r.left-48,y,39,26);ctx.fillStyle='#fff';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('চা ১০৳',r.left-28,y+16);
  ctx.fillStyle='#c62828';ctx.fillRect(r.right+9,y+22,38,28);ctx.strokeStyle='#fff';ctx.strokeRect(r.right+9,y+22,38,28);ctx.fillStyle='#fff';ctx.font='bold 9px sans-serif';ctx.fillText('হর্ন দিন',r.right+28,y+39);
 }
}
function roundedRect(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function drawPlayer(){
 ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.tilt);
 // shadow
 ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,player.h*.48,player.w*.72,9,0,0,Math.PI*2);ctx.fill();
 // three wheels
 ctx.fillStyle='#171a18';ctx.beginPath();ctx.ellipse(0,-player.h*.39,7,10,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(-player.w*.42,player.h*.38,7,10,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(player.w*.42,player.h*.38,7,10,0,0,Math.PI*2);ctx.fill();
 roundedRect(-player.w*.48,-player.h*.36,player.w*.96,player.h*.72,7,'#13783e');roundedRect(-player.w*.57,-player.h*.42,player.w*1.14,13,4,'#e9b72c');
 roundedRect(-player.w*.31,-player.h*.25,player.w*.62,player.h*.25,4,'#91d5e5');ctx.fillStyle='#fff';ctx.fillRect(-player.w*.28,-player.h*.22,player.w*.56,2);
 ctx.fillStyle='#f4c84c';ctx.fillRect(-player.w*.4,player.h*.1,player.w*.8,4);
 ctx.font='26px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🛺',0,player.h*.15);
 ctx.fillStyle='#fff8c8';ctx.fillRect(-player.w*.38,-player.h*.4,7,4);ctx.fillRect(player.w*.2,-player.h*.4,7,4);ctx.restore();
}
function drawVehicle(o){
 ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle='#0004';ctx.beginPath();ctx.ellipse(0,o.h*.46,o.w*.56,7,0,0,Math.PI*2);ctx.fill();
 roundedRect(-o.w*.48,-o.h*.48,o.w*.96,o.h*.96,8,o.color);
 roundedRect(-o.w*.34,-o.h*.35,o.w*.68,o.h*.24,5,'#9bd6e3');
 ctx.fillStyle='#222';ctx.fillRect(-o.w*.42,-o.h*.14, o.w*.84,4);ctx.fillStyle='#ffe59a';ctx.fillRect(-o.w*.37,o.h*.34,8,4);ctx.fillRect(o.w*.15,o.h*.34,8,4);
 ctx.font=`${Math.min(o.w*.7,o.h*.5)}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(o.emoji,0,o.h*.08);ctx.restore();
}
function draw(){
 ctx.clearRect(0,0,W,H);drawBackground();for(const o of game.obstacles)drawVehicle(o);
 for(const p of game.particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 player.y=H-155;if(H<540)player.y=H-125;drawPlayer();
}
function loop(time){const dt=Math.min(.04,Math.max(0,(time-lastTime)/1000));lastTime=time;update(dt,time);draw();animationId=requestAnimationFrame(loop);}
function bestScore(){try{return Number(localStorage.getItem('dhakaRickshawBest')||0)}catch(e){return 0}}
function saveBest(){try{game.best=Math.max(bestScore(),Math.floor(game.score));localStorage.setItem('dhakaRickshawBest',String(game.best))}catch(e){game.best=Math.floor(game.score)}}
function startGame(){
 initAudio();tone(620,.08,'triangle',.12,900);stopEngine();
 game.state='playing';game.score=0;game.lives=CONFIG.startingLives;game.distance=0;game.speed=CONFIG.baseSpeed;game.roadOffset=0;game.obstacles=[];game.particles=[];game.lastSpawn=performance.now();game.lastMeme=performance.now();game.lastCrash=0;game.spawnMs=CONFIG.spawnEveryMs;player.x=W/2;player.tilt=0;
 $('startScreen').classList.add('hidden');$('gameOverScreen').classList.add('hidden');$('pauseScreen').classList.add('hidden');$('mobileControls').classList.remove('hidden');$('pauseBtn').classList.remove('hidden');updateHud();startEngine();popup('🛺 চলো শুরু করি, মামা!',true);
}
function gameOver(){game.state='over';stopEngine();tone(400,.15,'square',.15,300);tone(300,.22,'square',.16,160,.18);saveBest();$('finalScore').textContent=Math.floor(game.score);$('finalDistance').textContent=Math.floor(game.distance);$('bestLine').textContent='সেরা স্কোর: '+game.best;$('gameOverScreen').classList.remove('hidden');$('mobileControls').classList.add('hidden');$('pauseBtn').classList.add('hidden');}
function pauseGame(){if(game.state!=='playing')return;game.state='paused';stopEngine();if(audioCtx&&audioCtx.state==='running')audioCtx.suspend();$('pauseScreen').classList.remove('hidden');}
function resumeGame(){initAudio();if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();game.state='playing';$('pauseScreen').classList.add('hidden');startEngine();lastTime=performance.now();}
function toggleSound(){muted=!muted;CONFIG.soundEnabled=!muted;$('soundBtn').textContent=muted?'🔇':'🔊';if(master)master.gain.setTargetAtTime(muted?0:.32,audioCtx.currentTime,.04);if(muted){stopEngine();if('speechSynthesis'in window)speechSynthesis.cancel()}else if(game.state==='playing')startEngine();}
$('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('pauseBtn').addEventListener('click',pauseGame);$('resumeBtn').addEventListener('click',resumeGame);$('soundBtn').addEventListener('click',toggleSound);
document.addEventListener('keydown',e=>{game.keys[e.key]=true;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();if(e.key==='Escape'||e.key==='p'||e.key==='P'){if(game.state==='playing')pauseGame();else if(game.state==='paused')resumeGame();}});
document.addEventListener('keyup',e=>{game.keys[e.key]=false});
function bindButton(id,dir){const b=$(id);const start=e=>{e.preventDefault();game.touchDir=dir;};const end=e=>{e.preventDefault();if(game.touchDir===dir)game.touchDir=null;};b.addEventListener('pointerdown',start);b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('pointerleave',end);}
bindButton('btnLeft','left');bindButton('btnRight','right');bindButton('btnUp','up');bindButton('btnDown','down');
canvas.addEventListener('pointerdown',e=>{if(game.state!=='playing')return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left;game.touchDir=x<W/2?'left':'right';});
canvas.addEventListener('pointerup',()=>game.touchDir=null);canvas.addEventListener('pointercancel',()=>game.touchDir=null);
window.addEventListener('blur',()=>{game.keys={};game.touchDir=null;if(game.state==='playing')pauseGame()});
if('speechSynthesis'in window)speechSynthesis.getVoices();
game.best=bestScore();animationId=requestAnimationFrame(loop);
})();