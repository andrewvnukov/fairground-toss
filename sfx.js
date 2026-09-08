'use strict';
// ============================================================
// sfx.js — процедурные звуки и генеративный музыкальный луп. Никаких
// аудиофайлов — весь звук синтезируется на лету движком ZzFXMicro
// (Frank Force, MIT/CC0, https://killedbyapixel.github.io/ZzFX/).
// ============================================================
const audioDefaultSampleRate = 44100;
let audioCtx = null, masterGain = null;
function ensureAudio(){
  if(audioCtx) return audioCtx;
  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = .6;
    masterGain.connect(audioCtx.destination);
  }catch(e){}
  return audioCtx;
}
addEventListener("pointerdown", ()=>{ const ctx=ensureAudio(); if(ctx&&ctx.state!=="running") ctx.resume().catch(()=>{}); }, {once:true, passive:true});

// ---------- Приглушение звука: вручную (реклама) и по видимости вкладки ----------
function audioSuspend(){ try{ if(audioCtx && audioCtx.state==="running") audioCtx.suspend(); }catch(e){} }
function audioResume(){ try{ if(audioCtx && audioCtx.state==="suspended" && document.visibilityState==="visible") audioCtx.resume(); }catch(e){} }
// звук паузится при потере фокуса вкладки (не путать с ручным глушением на время рекламы —
// во время показа рекламы страница фокус НЕ теряет, поэтому этот слушатель её не тронет)
document.addEventListener("visibilitychange", ()=>{ if(document.hidden) audioSuspend(); else audioResume(); });

const rand = (a=1,b=0) => b+(a-b)*Math.random();

// ---------- ZzFXMicro: генерация сэмплов по параметрам ----------
function zzfxG(volume=1, randomness=.05, frequency=220, attack=0, sustain=0, release=.1,
  shape=0, shapeCurve=1, slide=0, deltaSlide=0, pitchJump=0, pitchJumpTime=0, repeatTime=0,
  noise=0, modulation=0, bitCrush=0, delay=0, sustainVolume=1, decay=0, tremolo=0, filter=0){
  let sampleRate=audioDefaultSampleRate, PI2=Math.PI*2,
    startSlide=slide*=500*PI2/sampleRate/sampleRate,
    startFrequency=frequency*=(1+rand(randomness,-randomness))*PI2/sampleRate,
    modOffset=0, repeat=0, crush=0, jump=1, length, b=[], t=0, i=0, s=0, f,
    quality=2, w=PI2*Math.abs(filter)*2/sampleRate,
    cosw=Math.cos(w), alpha=Math.sin(w)/2/quality,
    a0=1+alpha, a1=-2*cosw/a0, a2=(1-alpha)/a0,
    b0=(1+Math.sign(filter)*cosw)/2/a0, b1=-(Math.sign(filter)+cosw)/a0, b2=b0,
    x2=0, x1=0, y2=0, y1=0;
  const minAttack=9;
  attack=attack*sampleRate||minAttack; decay*=sampleRate; sustain*=sampleRate; release*=sampleRate;
  delay*=sampleRate; deltaSlide*=500*PI2/sampleRate**3; modulation*=PI2/sampleRate;
  pitchJump*=PI2/sampleRate; pitchJumpTime*=sampleRate; repeatTime=repeatTime*sampleRate|0;
  for(length=attack+decay+sustain+release+delay|0; i<length; b[i++]=s*volume){
    if(!(++crush%(bitCrush*100|0))){
      s = shape? shape>1? shape>2? shape>3? shape>4?
          (t/PI2%1 < shapeCurve/2? 1:-1):
          Math.sin(t**3):
          Math.max(Math.min(Math.tan(t),1),-1):
          1-(2*t/PI2%2+2)%2:
          1-4*Math.abs(Math.round(t/PI2)-t/PI2):
          Math.sin(t);
      s = (repeatTime? 1-tremolo+tremolo*Math.sin(PI2*i/repeatTime) : 1) *
          (shape>4?s:Math.sign(s)*Math.abs(s)**shapeCurve) *
          (i<attack? i/attack :
           i<attack+decay? 1-((i-attack)/decay)*(1-sustainVolume) :
           i<attack+decay+sustain? sustainVolume :
           i<length-delay? (length-i-delay)/release*sustainVolume : 0);
      s = delay? s/2 + (delay>i? 0 : (i<length-delay? 1:(length-i)/delay) * b[i-delay|0]/2/volume) : s;
      if(filter) s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
    }
    f=(frequency+=slide+=deltaSlide)*Math.cos(modulation*modOffset++);
    t+=f+f*noise*Math.sin(i**5);
    if(jump && ++jump>pitchJumpTime){ frequency+=pitchJump; startFrequency+=pitchJump; jump=0; }
    if(repeatTime && !(++repeat%repeatTime)){ frequency=startFrequency; slide=startSlide; jump=jump||1; }
  }
  return b;
}
function playBuffer(samples, volume=1, loop=false){
  const ctx=ensureAudio(); if(!ctx) return;
  const buf=ctx.createBuffer(1, samples.length, audioDefaultSampleRate);
  buf.getChannelData(0).set(samples);
  const src=ctx.createBufferSource(); src.buffer=buf; src.loop=loop;
  const g=ctx.createGain(); g.gain.value=volume;
  src.connect(g).connect(masterGain);
  src.start(0);
  return src;
}
function zzfx(...params){ return playBuffer(zzfxG(...params)); }

// ---------- тема «вечерняя ярмарка, тир с рогаткой» ----------
const SFX = {
  tap:  [.35,.03,220,.008,.03,.07,1,1.4,-24,0,0,0,0,0,0,0,0,.6,.01],       // свист броска мешочка
  coin: [.6,0,1180,.01,.05,.15,0,1.6,0,0,320,.05,.08,0,0,0,0,.75,.02],     // весёлый "дзынь-звяк" сбитых банок
  buy:  [.65,0,560,.02,.08,.17,0,1.6,0,0,150,.06,.1,0,0,0,0,.85,.05],      // тёплый "плюх" покупки приза
  error:[.5,0,130,.02,.05,.14,1,.8,0,0,0,0,0,.16,0,.08,0,.7,.04],          // мягкий глухой промах
};
function sfx(name){ try{ zzfx(...SFX[name]); }catch(e){} }

// ---------- Генеративный музыкальный луп ----------
// Bb-мажор, 108 BPM, прогрессия Bb–Gm–Eb–F (I–vi–IV–V), сыграна дважды (2 круга
// по 4 такта = 32 доли), бесшовно зациклена. Три слоя: пэды-аккорды (синус),
// бас на корне аккорда октавой ниже (треугольник), мелодия-«колокольчик» по
// пентатонике Bb-мажор — весёлый ярмарочный вальсок. Буфер нормализован к 0.8.
const NOTE_HZ = m => 440*Math.pow(2,(m-69)/12);
function mixInto(mix, samples, offset, gain){
  gain = gain==null?1:gain;
  for(let i=0;i<samples.length;i++){
    const idx=offset+i; if(idx<0||idx>=mix.length) continue;
    mix[idx]+=(samples[i]||0)*gain;
  }
}
function buildSong(){
  const sr=audioDefaultSampleRate, bpm=108, beat=60/bpm;
  const chords=[ [70,74,77], [67,70,74], [63,67,70], [65,69,72] ]; // Bb, Gm, Eb, F
  const bassRoots=[58,55,51,53];                                    // Bb3, G3, Eb3, F3
  const melodyScale=[70,72,74,77,79];                                // Bb4 C5 D5 F5 G5 (пентатоника)
  const melodyPattern=[
    [0,2,4,2],[1,3,1,4],[2,0,3,1],[4,2,0,3],
    [0,3,2,4],[3,1,4,0],[2,4,1,3],[1,0,4,2],
  ];
  const barsPerLoop=4, loops=2, totalBeats=barsPerLoop*4*loops; // 32 доли
  const totalSec = totalBeats*beat + 2;
  const mix = new Float32Array(Math.ceil(totalSec*sr));

  for(let loop=0; loop<loops; loop++){
    for(let bar=0; bar<barsPerLoop; bar++){
      const ci=bar%4, chord=chords[ci], bassRoot=bassRoots[ci];
      const barStartBeat = loop*barsPerLoop*4 + bar*4;
      const barStartSample = Math.round(barStartBeat*beat*sr);
      chord.forEach(note=>{
        const s=zzfxG(.18,0,NOTE_HZ(note),.65,2.7*beat,1.05,0,1,0,0,0,0,0,0,0,0,0,.9,0,0,0);
        mixInto(mix, s, barStartSample, 1);
      });
      const bs=zzfxG(.27,0,NOTE_HZ(bassRoot),.02,beat*0.85,.25,1,1,0,0,0,0,0,0,0,0,0,.85,0,0,0);
      mixInto(mix, bs, barStartSample, 1);
      const pattern = melodyPattern[(loop*barsPerLoop+bar)%melodyPattern.length];
      pattern.forEach((deg,i)=>{
        const noteSample = Math.round((barStartBeat+i)*beat*sr);
        const midi = melodyScale[deg] + (Math.random()<0.12?12:0);
        const m=zzfxG(.18,.02,NOTE_HZ(midi),.01,beat*0.42,.24,0,1.6,0,0,0,0,0,0,0,0,0,.9,0,0,0);
        mixInto(mix, m, noteSample, 1);
      });
    }
  }
  let peak=0; for(let i=0;i<mix.length;i++){ const a=Math.abs(mix[i]); if(a>peak) peak=a; }
  if(peak>0){ const k=0.8/peak; for(let i=0;i<mix.length;i++) mix[i]*=k; }
  return mix;
}
let musicSrc=null;
function startMusic(){
  if(musicSrc) return;
  const ctx=ensureAudio(); if(!ctx) return;
  try{ musicSrc=playBuffer(buildSong(), .4, true); }catch(e){}
}
function stopMusic(){ if(musicSrc){ try{ musicSrc.stop(); }catch(e){} musicSrc=null; } }
