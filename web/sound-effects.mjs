// Original, lightweight procedural sound design: wood, drums, cannon
// rumble and short brass cues. No downloads or repeating single samples.
export function variantPicker(random = Math.random) {
  const bags = new Map(), last = new Map();
  return (name, count = 5) => {
    let bag = bags.get(name);
    if (!bag?.length) {
      bag = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (count > 1 && bag.at(-1) === last.get(name)) [bag[0], bag[count - 1]] = [bag[count - 1], bag[0]];
      bags.set(name, bag);
    }
    const value = bag.pop();
    last.set(name, value);
    return value;
  };
}

export function soundPlan(name, variant, random = Math.random) {
  const notes = [], pitch = [0.88, 1, 1.12, 0.95, 1.06][variant];
  const tone = (at, duration, frequency, volume, end = frequency, wave = 'sine') =>
    notes.push({ at, duration, frequency: frequency * pitch, end: end * pitch, volume, wave });
  const noise = (at, duration, frequency, volume, filter = 'bandpass') =>
    notes.push({ at, duration, frequency, volume, wave: 'noise', filter });
  const wood = (at, strength = 1) => {
    tone(at, 0.065, 620 + random() * 550, 0.13 * strength, 280);
    noise(at, 0.035, 1900 + random() * 1200, 0.12 * strength);
  };
  switch (name) {
    case 'select': wood(0, 0.55); break;
    case 'place':
      wood(0, 1); tone(0.015, 0.16, 170, 0.17, 75);
      if (variant % 2) wood(0.09, 0.4);
      break;
    case 'move':
      noise(0, 0.25, 700, 0.1, 'lowpass');
      for (let i = 0; i < 3 + variant % 3; i++) wood(0.04 + i * 0.095, 0.6);
      break;
    case 'card':
      noise(0, 0.15, 2200, 0.1, 'highpass');
      tone(0.06, 0.25, 660, 0.08, 660, 'triangle');
      tone(0.15, 0.35, 990, 0.065, 990, 'triangle');
      break;
    case 'battle':
      // Boots and a distant drum precede a staggered musket volley. Low cannon
      // rumble and falling debris sit behind the short, dry firing transients.
      for (let i = 0; i < 3; i++) {
        noise(i * 0.12, 0.09, 360 + i * 60, 0.075, 'lowpass');
        tone(i * 0.16, 0.16, 100, 0.08, 52);
      }
      for (let i = 0; i < 2 + variant % 3; i++) {
        const at = 0.5 + i * 0.12 + random() * 0.035;
        noise(at, 0.045, 2100 + variant * 140, 0.24, 'highpass');
        noise(at + 0.012, 0.24, 650 + random() * 350, 0.15, 'lowpass');
        tone(at, 0.12, 130, 0.13, 45);
      }
      tone(0.67, 0.66, 82, 0.25, 28);
      noise(0.67, 0.7, 320 + variant * 55, 0.22, 'lowpass');
      noise(0.91, 0.5, 1100, 0.055);
      break;
    case 'cannon':
      tone(0,0.5,76,0.25,26); noise(0,0.36,390,0.2,'lowpass'); break;
    case 'explosion':
      tone(0,0.6,92,0.25,24); noise(0,0.55,750,0.23,'lowpass'); noise(0.13,0.45,1700,0.08); break;
    case 'impact':
      tone(0, 0.3, 110, 0.18, 42);
      noise(0, 0.19, 1200 + variant * 270, 0.13);
      tone(0.025, 0.22, 430 + variant * 90, 0.045, 200, 'triangle');
      break;
    case 'conquer': {
      const melody = [[0, 7, 12], [0, 4, 7, 12], [7, 12, 16], [0, 5, 7, 12], [4, 7, 12]][variant];
      melody.forEach((step, i) => {
        const hz = 220 * 2 ** (step / 12);
        tone(i * 0.13, i === melody.length - 1 ? 0.55 : 0.22, hz, 0.095, hz, 'triangle');
        tone(i * 0.13, 0.25, hz * 2, 0.025, hz * 2, 'sawtooth');
      });
      tone(0, 0.3, 120, 0.16, 48);
      break;
    }
  }
  return notes;
}

export function createSoundPlayer({ enabled = false, random = Math.random, onStatus = () => {},
  schedule = setTimeout, cancel = clearTimeout, now = () => performance.now(),
  contextFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() } = {}) {
  let context, master, noiseBuffer, generation = 0, lastSelect = -Infinity;
  let foreground=true, needsRecovery=false, status=enabled?'blocked':'off', probe=null;
  const voices = new Set(), pick = variantPicker(random);
  function report() {
    const next=!enabled?'off':context?.state==='running'&&!needsRecovery?'ready':'blocked';
    if(next!==status){status=next;onStatus(next);}
  }
  function stop() {
    for(const voice of voices){try{voice.stop();}catch{}}
    voices.clear();
  }
  function suspend(ctx) {try{Promise.resolve(ctx?.suspend()).catch(()=>{});}catch{}}
  function discard() {
    stop();cancel(probe);probe=null;
    const previous=context;context=null;master=null;noiseBuffer=null;
    if(previous){previous.onstatechange=null;try{Promise.resolve(previous.close()).catch(()=>{});}catch{}}
  }
  function checkClock(ctx) {
    cancel(probe);const started=now(),time=ctx.currentTime;
    probe=schedule(()=>{
      probe=null;
      if(ctx!==context||!foreground||!enabled||ctx.state!=='running')return;
      // Some Safari interruptions leave state="running" but the audio clock
      // frozen. Rebuild on the next real gesture instead of trusting the state.
      if(now()-started>=180&&ctx.currentTime<=time){needsRecovery=true;report();}
    },250);
  }
  function unlock({gesture=false,recover=false}={}) {
    if (!enabled||!foreground) return;
    try {
      if(gesture&&needsRecovery&&context)discard();
      if (!context || context.state === 'closed') {
        voices.clear();lastSelect = -Infinity;
        context = contextFactory();
        master = context.createGain(); master.gain.value = 0.65;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16; compressor.knee.value = 18; compressor.ratio.value = 4;
        master.connect(compressor); compressor.connect(context.destination);
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
        const created=context;
        context.onstatechange=()=>{
          if(created!==context)return;
          if(created.state==='interrupted')needsRecovery=true;
          if(!enabled||!foreground){if(created.state==='running')suspend(created);}
          report();
        };
        needsRecovery=false;
      }
      const ctx=context,token=generation;
      if(recover)checkClock(ctx);
      if(ctx.state==='running'&&!needsRecovery){report();return;}
      // Call resume synchronously inside the gesture. A previous resume promise
      // may never settle on iOS; do not serialize the next attempt behind it.
      const pending=ctx.resume();report();
      return Promise.resolve(pending).then(()=>{
        if(ctx!==context)return;
        if(!enabled||!foreground){suspend(ctx);return;}
        if(token!==generation)return;
        needsRecovery=ctx.state!=='running';report();
        if(recover||gesture)checkClock(ctx);
      }).catch(()=>{if(ctx===context){needsRecovery=true;report();}});
    } catch { report(); /* Audio must never prevent a game action. */ }
  }
  function play(name) {
    if (!enabled||!foreground||needsRecovery) return;
    if (!context || context.state !== 'running') {
      // Recover permission already granted to this page after reload or OS
      // interruption. Never queue old combat sounds behind autoplay blocking.
      unlock();
      if (!context || context.state !== 'running') return;
    }
    if (name === 'select' && context.currentTime - lastSelect < 0.055) return;
    if (name === 'select') lastSelect = context.currentTime;
    for (const note of soundPlan(name, pick(name), random)) {
      if (voices.size >= 64) break;
      const at = context.currentTime + 0.008 + note.at, end = at + note.duration;
      const source = note.wave === 'noise' ? context.createBufferSource() : context.createOscillator();
      const envelope = context.createGain(), filter = context.createBiquadFilter();
      filter.type = note.filter || 'lowpass'; filter.frequency.value = note.wave === 'noise' ? note.frequency : 3200;
      filter.Q.value = 0.7;
      if (note.wave === 'noise') { source.buffer = noiseBuffer; source.loop = true; }
      else {
        source.type = note.wave;
        source.frequency.setValueAtTime(note.frequency, at);
        source.frequency.exponentialRampToValueAtTime(note.end, end);
      }
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(note.volume, at + Math.min(0.012, note.duration / 4));
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(filter); filter.connect(envelope); envelope.connect(master);
      voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
      source.start(at); source.stop(end + 0.015);
    }
  }
  return {
    unlock,
    play,
    stop,
    get status(){return status;},
    background(){foreground=false;generation++;stop();cancel(probe);probe=null;suspend(context);},
    foreground(){foreground=true;if(!enabled)return;needsRecovery=Boolean(context&&context.state!=='running');return unlock({recover:true});},
    setEnabled(value) {
      enabled = value;
      const current = ++generation;
      if (value) Promise.resolve(unlock({gesture:true})).then(() => { if (enabled && generation === current) play('select'); });
      else {stop();cancel(probe);probe=null;suspend(context);}
      report();
    },
  };
}

export function bindSoundLifecycle(player, page = globalThis, document = globalThis.document) {
  let hidden=Boolean(document.hidden),retry=[];
  const cancelRetries=()=>{retry.forEach(clearTimeout);retry=[];};
  const gesture = () => { if(!document.hidden)player.unlock({gesture:true}); };
  const sleep = () => {hidden=true;cancelRetries();player.background();};
  const wake = () => {
    if(document.hidden)return;
    hidden=false;cancelRetries();player.foreground();
    // Visibility can precede release of the OS audio session. Retry briefly;
    // never keep a background player/timer running or replay old effects.
    retry=[120,500,1500].map(delay=>setTimeout(()=>{if(!hidden)player.unlock({recover:true});},delay));
  };
  const visible = () => document.hidden?sleep():wake();
  for (const event of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) page.addEventListener(event, gesture, { capture: true, passive: true });
  for (const event of ['pageshow', 'focus']) page.addEventListener(event, wake);
  page.addEventListener('pagehide',sleep);
  document.addEventListener('visibilitychange', visible);
  if(hidden)player.background();else player.unlock();
  return () => {
    cancelRetries();
    for (const event of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) page.removeEventListener(event, gesture, {capture:true});
    for (const event of ['pageshow', 'focus']) page.removeEventListener(event, wake);
    page.removeEventListener('pagehide',sleep);
    document.removeEventListener('visibilitychange', visible);
  };
}
