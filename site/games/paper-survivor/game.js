'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let W=innerWidth,H=innerHeight,ratio=1,state='menu',player,enemies=[],bullets=[],gems=[],particles=[],texts=[],elapsed=0,kills=0,spawnTimer=0,fireTimer=0,lightningTimer=0,bossSpawned=false,bossDead=false,shake=0,last=0,toastTimer=0;
let mode='classic', bolts=[], rings=[], skillTimer=0, shieldTimer=0, nextBossAt=150, bossNumber=0, achievementClock=0;
const learned=new Set();
const keys=new Set();
const stick={id:null,x:0,y:0,dx:0,dy:0};
let best=0;try{best=Number(localStorage.getItem('paper-best'))||0;}catch{}
let audio,musicOn=true,musicStep=0,musicNext=0;
function audioStart(){if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}if(audio?.state==='suspended')audio.resume();}
function tone(freq,duration,type='sine',volume=.04,when=0){if(!audio||!musicOn)return;const at=when||audio.currentTime;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,at);gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+duration+.02);}
function music(){if(!audio||!musicOn||state!=='playing'){musicNext=0;return;}if(!musicNext)musicNext=audio.currentTime;const notes=[0,7,12,7,3,10,15,10,5,12,17,12,3,10,7,10];while(musicNext<audio.currentTime+.15){tone(220*2**(notes[musicStep%16]/12),.22,'sine',.026,musicNext);if(musicStep%4===0)tone(110*2**([0,3,5,3][Math.floor(musicStep/4)%4]/12),.5,'triangle',.035,musicNext);if(musicStep%2===0)tone(65,.07,'sine',.06,musicNext);musicStep++;musicNext+=.21;}}
setInterval(music,80);
function resize(){W=innerWidth;H=innerHeight;ratio=Math.min(devicePixelRatio||1,2);canvas.width=W*ratio;canvas.height=H*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}addEventListener('resize',resize);resize();
function resetStick(){stick.id=null;stick.dx=stick.dy=0;$('joystick').hidden=true;}
function start(){audioStart();player={x:0,y:0,hp:100,maxHp:100,speed:185,damage:18,rate:.55,shots:1,level:1,xp:0,need:8,inv:0,orbit:0,lightning:0,magnet:85,regen:0,frost:0,explosive:0,critical:0,vampire:0,shield:0,shieldReady:false,chain:0};bolts=[];rings=[];skillTimer=shieldTimer=0;nextBossAt=mode==='endless'?90:150;bossNumber=0;achievementClock=0;learned.clear();enemies=[];bullets=[];gems=[];particles=[];texts=[];elapsed=kills=spawnTimer=fireTimer=lightningTimer=0;bossSpawned=bossDead=false;shake=0;keys.clear();resetStick();for(const id of ['menu','end','choices','pauseMenu'])$(id).hidden=true;$('hud').hidden=$('bottom').hidden=false;state='playing';$('home').hidden=false;profile.runs++;saveProfile();toast(mode==='endless'?'无尽模式：每 90 秒迎来更强首领！':'收集绿色灵感，升级你的画笔！');hud();}
$('start').onclick=start;$('restart').onclick=start;
$('home').onclick=returnToMenu;
$('classicMode').onclick=()=>selectMode('classic');$('endlessMode').onclick=()=>selectMode('endless');
$('achievementsButton').onclick=showAchievements;$('closeAchievements').onclick=()=>{$('achievements').hidden=true;};
$('sound').onclick=()=>{musicOn=!musicOn;$('sound').textContent=musicOn?'♫ 音乐开':'♫ 音乐关';audioStart();};
function pause(){if(state==='playing'){state='paused';$('pauseMenu').hidden=false;resetStick();}else if(state==='paused'){state='playing';$('pauseMenu').hidden=true;audioStart();}}
$('pause').onclick=pause;$('resume').onclick=pause;
addEventListener('blur',()=>{keys.clear();resetStick();if(state==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause();});
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if((e.key==='Escape'||e.key.toLowerCase()==='p')&&!e.repeat)pause();if(state==='upgrade'&&['1','2','3'].includes(e.key))choose(Number(e.key)-1);});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||stick.id!==null)return;stick.id=e.pointerId;stick.x=e.clientX;stick.y=e.clientY;canvas.setPointerCapture(e.pointerId);$('joystick').hidden=false;$('joystick').style.left=(stick.x-52)+'px';$('joystick').style.top=(stick.y-52)+'px';$('joystick').firstElementChild.style.transform='';});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==stick.id)return;const dx=e.clientX-stick.x,dy=e.clientY-stick.y,d=Math.hypot(dx,dy),scale=Math.max(42,d);stick.dx=dx/scale;stick.dy=dy/scale;$('joystick').firstElementChild.style.transform=`translate(${stick.dx*30}px,${stick.dy*30}px)`;});for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===stick.id)resetStick();});
const upgrades=[
{icon:'✎',name:'浓墨重彩',desc:'灵感弹伤害提高 35%。',apply:()=>player.damage*=1.35},
{icon:'»',name:'一气呵成',desc:'攻击速度提高 20%。',apply:()=>player.rate=Math.max(.12,player.rate*.8)},
{icon:'⋔',name:'一笔多用',desc:'每次额外发射一枚灵感弹。',apply:()=>player.shots++,ok:()=>player.shots<6},
{icon:'✧',name:'飞旋铅笔',desc:'获得一支环绕铅笔，碰到敌人就造成伤害。',apply:()=>player.orbit++,ok:()=>player.orbit<5},
{icon:'ϟ',name:'灵光一闪',desc:'每隔 3 秒雷击附近敌人，叠加增加目标数。',apply:()=>player.lightning++,ok:()=>player.lightning<5},
{icon:'↗',name:'脚底生风',desc:'移动速度提高 15%，立即恢复 15 生命。',apply:()=>{player.speed*=1.15;heal(15);}},
{icon:'♡',name:'橡皮护身',desc:'生命上限增加 25，立即恢复 40 生命。',apply:()=>{player.maxHp+=25;heal(40);}},
{icon:'◎',name:'灵感磁铁',desc:'拾取范围增加 60%，立即恢复 20 生命。',apply:()=>{player.magnet*=1.6;heal(20);},ok:()=>player.magnet<500},
{icon:'❄',name:'冰霜涟漪',desc:'每 4 秒释放冰环，减速附近敌人 3 秒；叠加扩大范围和伤害。',apply:()=>player.frost++,ok:()=>player.frost<5},
{icon:'✹',name:'爆裂墨滴',desc:'灵感弹命中时爆炸，对周围敌人造成溅射伤害。',apply:()=>player.explosive++,ok:()=>player.explosive<4},
{icon:'✦',name:'点睛之笔',desc:'暴击率增加 15%，暴击造成双倍伤害。',apply:()=>player.critical+=.15,ok:()=>player.critical<.74},
{icon:'♧',name:'生命墨水',desc:'每次击败敌人恢复 1 生命，叠加提高恢复量。',apply:()=>player.vampire++,ok:()=>player.vampire<5},
{icon:'⬡',name:'纸片结界',desc:'立即获得抵挡一次伤害的护盾，每 12 秒补充；叠加缩短间隔。',apply:()=>{player.shield++;player.shieldReady=true;},ok:()=>player.shield<5},
{icon:'ϟ',name:'连锁电弧',desc:'获得雷击；每次雷击向另一名敌人传导，叠加增加连锁数量。',apply:()=>{player.chain++;player.lightning=Math.max(1,player.lightning);},ok:()=>player.chain<4},
{icon:'✿',name:'春日速写',desc:'每秒恢复 1.5 生命，可重复叠加。',apply:()=>player.regen+=1.5}
];let offered=[];
function heal(n){player.hp=Math.min(player.maxHp,player.hp+n);}
function levelUp(){state='upgrade';resetStick();player.xp-=player.need;player.level++;player.need=Math.min(160,Math.round(player.need*1.25+3));heal(10);const pool=upgrades.filter(u=>!u.ok||u.ok());for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}offered=pool.slice(0,3);$('cards').replaceChildren(...offered.map((u,i)=>{const b=document.createElement('button');b.className='card';b.innerHTML=`<span class="icon">${u.icon}</span><strong>${u.name}</strong><p>${u.desc}</p><small>选择这项灵感 · ${i+1}</small>`;b.onclick=()=>choose(i);return b;}));$('choices').hidden=false;tone(660,.25);tone(880,.4,'sine',.04,audio?audio.currentTime+.13:0);hud();}
function choose(i){if(state!=='upgrade'||!offered[i])return;offered[i].apply();learned.add(offered[i].name);checkAchievements();$('choices').hidden=true;state='playing';audioStart();hud();if(player.xp>=player.need)levelUp();}
function toast(s){$('toast').textContent=s;toastTimer=3;}
function spawn(boss=false){const angle=Math.random()*Math.PI*2,d=Math.hypot(W,H)/2+70;const type=boss?3:Math.min(2,Math.floor(Math.random()*(1+elapsed/32)));const hp=[28+elapsed*.28,20+elapsed*.2,70+elapsed*.4,1000*(1+Math.max(0,bossNumber-1)*.7)][type];enemies.push({x:player.x+Math.cos(angle)*d,y:player.y+Math.sin(angle)*d,hp,maxHp:hp,r:[15,12,23,48][type],speed:[51,91,35,48][type]+Math.min(65,elapsed*.12),type,hit:0,orbitHit:0,slow:0});}
function burst(x,y,color,n=7){for(let i=0;i<n;i++){const a=Math.random()*7,v=30+Math.random()*90;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.5,color});}}
function damage(e,n){if(e.hp<=0)return;e.hp-=n;e.hit=.1;burst(e.x,e.y,'#6b785a',3);if(e.hp<=0){kills++;profile.totalKills++;if(player.vampire)heal(player.vampire);gems.push({x:e.x,y:e.y,value:e.type===3?30:e.type===2?4:2});burst(e.x,e.y,['#cf9b88','#b7bad5','#d2ac62','#b18ba4'][e.type],9);if(e.type===3){bossDead=true;profile.bosses++;checkAchievements();if(mode==='classic'){profile.wins++;finish(true);}else{heal(30);toast('首领已击败！恢复 30 生命，挑战继续');}}}}
function finish(win){if(state==='end')return;recordRun();state='end';resetStick();best=Math.max(best,kills);try{localStorage.setItem('paper-best',best);}catch{}$('end').hidden=false;$('endTitle').textContent=win?'你守住了这一页！':'这一页，也很精彩。';$('endLabel').textContent=win?'MASTERPIECE COMPLETE':'A NEW PAGE AWAITS';$('summary').textContent=`生存 ${Math.floor(elapsed)} 秒 · 击败 ${kills} 只涂鸦 · 达到 ${player.level} 级`;$('record').textContent=`个人最佳：${best} 击败`;tone(win?880:165,.6,'triangle',.06);}
function hud(){$('modeBadge').textContent=mode==='endless'?'∞ 无尽':'✦ 经典';$('hp').textContent=Math.ceil(player.hp);$('hpbar').style.width=100*player.hp/player.maxHp+'%';$('xpbar').style.width=100*player.xp/player.need+'%';$('level').textContent=player.level;$('time').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');$('kills').textContent=kills+' 击败';$('skills').textContent=`✎ 灵感弹 ×${player.shots}${player.orbit?'　✧ 飞旋铅笔 ×'+player.orbit:''}${player.lightning?'　ϟ 雷击 ×'+player.lightning:''}${player.frost?'　❄ 冰环 ×'+player.frost:''}${player.explosive?'　✹ 爆裂 ×'+player.explosive:''}${player.shield?'　⬡ 结界':''}`;}
function update(dt){elapsed+=dt;updateAbilities(dt);if(state!=='playing')return;achievementClock+=dt;if(achievementClock>=1){achievementClock=0;checkAchievements();}player.inv=Math.max(0,player.inv-dt);heal(player.regen*dt);toastTimer-=dt;if(toastTimer<=0)$('toast').textContent='';let mx=stick.dx,my=stick.dy;if(keys.has('w')||keys.has('arrowup'))my--;if(keys.has('s')||keys.has('arrowdown'))my++;if(keys.has('a')||keys.has('arrowleft'))mx--;if(keys.has('d')||keys.has('arrowright'))mx++;const len=Math.max(1,Math.hypot(mx,my));player.x+=mx/len*player.speed*dt;player.y+=my/len*player.speed*dt;
spawnTimer-=dt;if(spawnTimer<=0){for(let i=0;i<Math.min(10,1+Math.floor(elapsed/45));i++)if(enemies.length<130)spawn();spawnTimer=Math.max(.3,1.05-elapsed*.004);}if(elapsed>=nextBossAt&&(mode==='endless'||!bossSpawned)){bossSpawned=true;bossDead=false;bossNumber++;spawn(true);nextBossAt+=90;toast(mode==='endless'?'第 '+bossNumber+' 轮首领来袭！':'最后一笔：击败巨型橡皮怪！');}
fireTimer-=dt;const live=enemies.filter(e=>e.hp>0);if(fireTimer<=0&&live.length){const nearest=live.reduce((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)<Math.hypot(b.x-player.x,b.y-player.y)?a:b);const angle=Math.atan2(nearest.y-player.y,nearest.x-player.x);for(let i=0;i<player.shots;i++){const a=angle+(i-(player.shots-1)/2)*.15;bullets.push({x:player.x,y:player.y,vx:Math.cos(a)*490,vy:Math.sin(a)*490,life:1.5});}fireTimer=player.rate;tone(470+Math.random()*60,.045,'triangle',.012);}
lightningTimer-=dt;if(player.lightning&&lightningTimer<=0){
const targets=live.filter(e=>Math.hypot(e.x-player.x,e.y-player.y)<650).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,player.lightning+1);
const struck=new Set(targets);for(const target of targets){strikeLightning(target.x-30,target.y-220,target,55+player.damage);let from=target;for(let i=0;i<player.chain;i++){const next=live.filter(e=>e.hp>0&&!struck.has(e)&&Math.hypot(e.x-from.x,e.y-from.y)<230).sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y))[0];if(!next)break;struck.add(next);strikeLightning(from.x,from.y,next,35+player.damage*.7);from=next;}}lightningTimer=3;if(targets.length)tone(150,.12,'sawtooth',.018);}
if(state!== 'playing')return;
for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;for(const e of live){if(e.hp>0&&Math.hypot(b.x-e.x,b.y-e.y)<e.r+5){const critical=Math.random()<player.critical;damage(e,player.damage*(critical?2:1));if(critical)texts.push({x:e.x,y:e.y,text:'暴击!',life:.45,color:'#bd7153'});if(player.explosive){const radius=40+player.explosive*12;rings.push({x:e.x,y:e.y,radius,life:.35,maxLife:.35,color:'#ce8e49'});burst(e.x,e.y,'#dca449',12);for(const other of live)if(other!==e&&other.hp>0&&Math.hypot(other.x-e.x,other.y-e.y)<radius)damage(other,player.damage*.4*player.explosive);}b.life=0;break;}}}bullets=bullets.filter(b=>b.life>0);
if(state!== 'playing')return;
for(const e of live){if(e.hp<=0)continue;let dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;e.slow=Math.max(0,(e.slow||0)-dt);const pace=e.slow>0?.4:1;e.x+=dx/d*e.speed*pace*dt;e.y+=dy/d*e.speed*pace*dt;e.hit-=dt;e.orbitHit-=dt;for(let i=0;i<player.orbit;i++){const a=elapsed*2.8+i*Math.PI*2/player.orbit;if(e.orbitHit<=0&&Math.hypot(e.x-player.x-Math.cos(a)*70,e.y-player.y-Math.sin(a)*70)<e.r+12){damage(e,24+player.damage*.5);e.orbitHit=.32;}}if(state!=='playing')return;if(e.hp<=0)continue;if(d<e.r+13&&player.inv<=0){if(player.shieldReady){player.shieldReady=false;shieldTimer=0;rings.push({x:player.x,y:player.y,radius:65,life:.4,maxLife:.4,color:'#77a7c1'});burst(player.x,player.y,'#82b6cc',14);}else{player.hp-=e.type===3?25:10;}player.inv=.75;shake=7;tone(95,.15,'triangle',.07);if(player.hp<=0){player.hp=0;hud();finish(false);return;}}if(d>Math.hypot(W,H)+250&&e.type!==3){const a=Math.atan2(e.y-player.y,e.x-player.x);e.x=player.x+Math.cos(a)*(Math.hypot(W,H)/2+70);e.y=player.y+Math.sin(a)*(Math.hypot(W,H)/2+70);}}
enemies=enemies.filter(e=>e.hp>0);for(const g of gems){const dx=player.x-g.x,dy=player.y-g.y,d=Math.hypot(dx,dy);if(d<player.magnet){g.x+=dx/(d||1)*Math.min(d,380*dt);g.y+=dy/(d||1)*Math.min(d,380*dt);}if(d<18){player.xp+=g.value;g.value=0;tone(800,.035,'sine',.008);}}gems=gems.filter(g=>g.value);if(gems.length>450){const extra=gems.splice(0,gems.length-450);gems[0].value+=extra.reduce((n,g)=>n+g.value,0);}for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);for(const t of texts)t.life-=dt;texts=texts.filter(t=>t.life>0);shake=Math.max(0,shake-dt*30);hud();if(player.xp>=player.need&&state==='playing')levelUp();}
function circle(x,y,r,fill,stroke='#333c30'){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
function draw(){ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#f3f0e6';ctx.fillRect(0,0,W,H);const px=state==='menu'?0:player?.x||0,py=state==='menu'?0:player?.y||0;ctx.strokeStyle='#dce0d155';ctx.lineWidth=1;ctx.beginPath();for(let x=((W/2-px)%36+36)%36;x<W;x+=36){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=((H/2-py)%36+36)%36;y<H;y+=36){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();if(state==='menu')return;ctx.save();ctx.translate(W/2-px+(Math.random()-.5)*shake,H/2-py+(Math.random()-.5)*shake);
for(const g of gems){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#799b68';ctx.fillRect(-4,-4,8,8);ctx.restore();}for(const b of bullets){circle(b.x,b.y,4,'#e4b858');}
for(const e of enemies){ctx.save();ctx.translate(e.x,e.y);const r=e.r,bob=Math.sin(elapsed*6+e.x)*2;ctx.translate(0,bob);ctx.fillStyle=e.hit>0?'#fff':['#e2ad99','#c1c6df','#dcc28b','#b4a4c9'][e.type];ctx.strokeStyle='#42493d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r,r*.65);ctx.lineTo(-r,-r*.2);ctx.bezierCurveTo(-r,-r*1.4,r,-r*1.4,r,-r*.2);ctx.lineTo(r,r*.65);ctx.lineTo(r*.5,r*.4);ctx.lineTo(0,r*.8);ctx.lineTo(-r*.5,r*.4);ctx.closePath();ctx.fill();ctx.stroke();circle(-r*.32,-r*.1,2,'#32392f',null);circle(r*.32,-r*.1,2,'#32392f',null);if(e.type===3||e.hp<e.maxHp){ctx.fillStyle='#d6d7ca';ctx.fillRect(-r,-r-12,r*2,4);ctx.fillStyle='#a55e66';ctx.fillRect(-r,-r-12,r*2*e.hp/e.maxHp,4);}if(e.type===3){ctx.font='12px sans-serif';ctx.fillStyle='#6b4b76';ctx.textAlign='center';ctx.fillText('巨型橡皮怪',0,-r-20);}ctx.restore();}
drawEffects();
for(let i=0;i<player.orbit;i++){const a=elapsed*2.8+i*Math.PI*2/player.orbit;ctx.save();ctx.translate(px+Math.cos(a)*70,py+Math.sin(a)*70);ctx.rotate(a);ctx.fillStyle='#ddb864';ctx.strokeStyle='#3f4a36';ctx.lineWidth=2;ctx.fillRect(-3,-15,6,30);ctx.strokeRect(-3,-15,6,30);ctx.restore();}
if(player.shieldReady){ctx.beginPath();ctx.arc(px,py,29,0,Math.PI*2);ctx.strokeStyle='#729fb8';ctx.lineWidth=2;ctx.stroke();}
ctx.save();ctx.translate(px,py);if(player.inv>0&&Math.floor(player.inv*16)%2===0)ctx.globalAlpha=.35;ctx.strokeStyle='#303b31';ctx.lineWidth=2.5;ctx.lineCap='round';const walk=(stick.dx||stick.dy||keys.size)?Math.sin(elapsed*14)*4:0;ctx.beginPath();ctx.moveTo(-5,9);ctx.lineTo(-9-walk,20);ctx.moveTo(5,9);ctx.lineTo(9+walk,20);ctx.moveTo(-8,-2);ctx.lineTo(-16,8);ctx.moveTo(8,-2);ctx.lineTo(17,3);ctx.stroke();ctx.fillStyle='#b8cba3';ctx.fillRect(-8,-5,16,18);ctx.strokeRect(-8,-5,16,18);circle(0,-13,11,'#faf8ee');circle(-4,-14,1.3,'#303b31',null);circle(4,-14,1.3,'#303b31',null);ctx.restore();for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size||3,p.size||3);}ctx.globalAlpha=1;for(const t of texts){ctx.fillStyle=t.color;ctx.font='bold 19px sans-serif';ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y-15);}ctx.restore();if(enemies.some(e=>e.type===3&&e.hp>0)){ctx.fillStyle='#755e80';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(mode==='endless'?'无尽首领 · 第 '+bossNumber+' 轮':'击败橡皮怪，即可通关',W/2,H-48);}}
function frame(now){const dt=Math.min((now-last)/1000,.035);last=now;updateAchievementToast(dt);if(state==='playing')update(dt);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);

// Short-lived canvas effects are bounded to keep long mobile runs responsive.
function strikeLightning(x,y,target,amount){
 const points=[{x,y}],segments=9;
 for(let i=1;i<=segments;i++){const t=i/segments;points.push({x:x+(target.x-x)*t+(i===segments?0:(Math.random()-.5)*34),y:y+(target.y-y)*t});}
 const branches=[];for(let i=2;i<segments;i+=3){const p=points[i];branches.push([p,{x:p.x+(Math.random()-.5)*65,y:p.y+15},{x:p.x+(Math.random()-.5)*90,y:p.y+38}]);}
 bolts.push({points,branches,life:.32});
 rings.push({x:target.x,y:target.y,radius:38,life:.3,maxLife:.3,color:'#79b9d5'});
 for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,v=45+Math.random()*180;particles.push({x:target.x,y:target.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.3+Math.random()*.3,color:i%2?'#79afcf':'#e0b942',size:2+Math.random()*3});}
 damage(target,amount);shake=Math.max(shake,2);
}
function updateAbilities(dt){
 for(const bolt of bolts)bolt.life-=dt;bolts=bolts.filter(b=>b.life>0).slice(-45);
 for(const ring of rings)ring.life-=dt;rings=rings.filter(r=>r.life>0).slice(-60);
 if(particles.length>1100)particles.splice(0,particles.length-1100);
 shieldTimer+=dt;if(player.shield&&!player.shieldReady&&shieldTimer>=Math.max(4,14-player.shield*2)){player.shieldReady=true;shieldTimer=0;}
 skillTimer-=dt;if(player.frost&&skillTimer<=0){const radius=120+player.frost*25;rings.push({x:player.x,y:player.y,radius,life:.65,maxLife:.65,color:'#72abc3'});for(const e of enemies){if(e.hp>0&&Math.hypot(e.x-player.x,e.y-player.y)<radius){e.slow=3;damage(e,12+player.frost*8);burst(e.x,e.y,'#9fc8da',6);}}skillTimer=4;tone(920,.18,'sine',.018);}
}
function drawEffects(){
 ctx.save();
 for(const ring of rings){const progress=1-ring.life/ring.maxLife;ctx.globalAlpha=(1-progress)*.7;ctx.strokeStyle=ring.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.radius*(.2+progress*.8),0,Math.PI*2);ctx.stroke();}
 for(const bolt of bolts){ctx.globalAlpha=Math.min(1,bolt.life*5);ctx.lineJoin='round';ctx.lineCap='round';const paths=[bolt.points,...bolt.branches];for(const path of paths){for(const [width,color] of [[9,'#94bbdc66'],[4,'#76a8d0'],[1.5,'#fffef0']]){ctx.lineWidth=width;ctx.strokeStyle=color;ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}}}
 ctx.restore();
}
function selectMode(next){mode=next;for(const m of ['classic','endless']){const b=$(m+'Mode');b.classList.toggle('selected',m===mode);b.setAttribute('aria-pressed',String(m===mode));}$('modeDescription').textContent=mode==='endless'?'∞ 没有终点，每 90 秒迎来下一位首领':'✦ 击败巨型橡皮怪，完成这一页';}
function returnToMenu(){if(player&&state!=='menu')recordRun();state='menu';keys.clear();resetStick();$('home').hidden=true;for(const id of ['end','choices','pauseMenu','hud','bottom'])$(id).hidden=true;$('menu').hidden=false;$('toast').textContent='';player=null;enemies=[];bullets=[];gems=[];particles=[];bolts=[];rings=[];musicNext=0;updateAchievementCount();}

const profileKey='paper-survivor-notebook-v2';
const profile={totalKills:0,bosses:0,wins:0,runs:0,bestKills:0,bestLevel:1,bestEndless:0,maxSkills:0,unlocked:[]};
let storageAvailable=true;
try{const saved=JSON.parse(localStorage.getItem(profileKey)||'{}');for(const key of Object.keys(profile)){if(key!=='unlocked'&&Number.isFinite(saved[key])&&saved[key]>=0)profile[key]=saved[key];}if(Array.isArray(saved.unlocked))profile.unlocked=saved.unlocked.filter(id=>typeof id==='string');}catch{storageAvailable=false;}
const achievements=[
{id:'first',name:'第一抹墨迹',desc:'累计击败 1 名敌人',target:1,value:()=>profile.totalKills},
{id:'hundred',name:'百怪绘卷',desc:'累计击败 100 名敌人',target:100,value:()=>profile.totalKills},
{id:'thousand',name:'涂鸦收藏家',desc:'累计击败 1000 名敌人',target:1000,value:()=>profile.totalKills},
{id:'level5',name:'灵感喷涌',desc:'单局达到 5 级',target:5,value:()=>profile.bestLevel},
{id:'level10',name:'绘画大师',desc:'单局达到 10 级',target:10,value:()=>profile.bestLevel},
{id:'variety',name:'百变画笔',desc:'单局选择 6 种不同技能',target:6,value:()=>profile.maxSkills},
{id:'boss',name:'橡皮克星',desc:'击败任意 1 位首领',target:1,value:()=>profile.bosses},
{id:'win',name:'完美收笔',desc:'完成经典冒险',target:1,value:()=>profile.wins},
{id:'endless3',name:'长卷初成',desc:'无尽模式生存 180 秒',target:180,value:()=>Math.floor(profile.bestEndless)},
{id:'endless5',name:'永不落笔',desc:'无尽模式生存 300 秒',target:300,value:()=>Math.floor(profile.bestEndless)}
];
const achievementQueue=[];let achievementToastTime=0;
function saveProfile(){try{localStorage.setItem(profileKey,JSON.stringify(profile));}catch{storageAvailable=false;}}
function checkAchievements(){
 if(player){profile.bestKills=Math.max(profile.bestKills,kills);profile.bestLevel=Math.max(profile.bestLevel,player.level);profile.maxSkills=Math.max(profile.maxSkills,learned.size);if(mode==='endless')profile.bestEndless=Math.max(profile.bestEndless,elapsed);}
 for(const item of achievements){if(!profile.unlocked.includes(item.id)&&item.value()>=item.target){profile.unlocked.push(item.id);achievementQueue.push(item.name);}}
 saveProfile();updateAchievementCount();
}
function recordRun(){checkAchievements();best=Math.max(best,kills);try{localStorage.setItem('paper-best',best);}catch{storageAvailable=false;}}
function updateAchievementCount(){$('achievementCount').textContent=achievements.filter(a=>profile.unlocked.includes(a.id)).length+' / '+achievements.length;}
function updateAchievementToast(dt){achievementToastTime-=dt;if(achievementToastTime<=0){if(achievementQueue.length){$('achievementToast').textContent='✦ 成就解锁 · '+achievementQueue.shift();$('achievementToast').hidden=false;achievementToastTime=3.5;tone(1046,.25,'sine',.025);}else $('achievementToast').hidden=true;}}
function showAchievements(){
 $('achievementStats').textContent=`累计击败 ${profile.totalKills} · 经典通关 ${profile.wins} 次 · 无尽最佳 ${Math.floor(profile.bestEndless)} 秒`;
 $('achievementList').replaceChildren(...achievements.map(item=>{const card=document.createElement('article'),unlocked=profile.unlocked.includes(item.id),value=Math.min(item.target,item.value());card.className='achievement'+(unlocked?' unlocked':'');card.innerHTML=`<strong>${unlocked?'✦':'◇'} ${item.name}</strong><p>${item.desc}</p><progress aria-label="${item.name}进度" max="${item.target}" value="${value}"></progress><small>${unlocked?'已解锁 ✓':value+' / '+item.target}</small>`;return card;}));
 $('saveNotice').textContent=storageAvailable?'成就自动保存在当前浏览器 · 不跨设备同步':'浏览器存储不可用：成就仅在本次打开期间保留';$('achievements').hidden=false;
}
updateAchievementCount();
// Preserve the current score when leaving the arcade player or closing the tab.
addEventListener('pagehide', () => { if (player && state !== 'menu') recordRun(); });
