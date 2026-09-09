(() => {
  "use strict";

  const script = document.currentScript;
  const defaultApiBase = script?.dataset?.apiBase || (script?.src ? new URL(script.src).origin : window.location.origin);
  const VERSION = "1.0.0";

  const css = `
    :host{display:block;max-width:720px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f8fb}
    *{box-sizing:border-box}
    .hg{overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:linear-gradient(180deg,#0d1420,#070b12);box-shadow:0 20px 60px rgba(0,0,0,.28)}
    .top{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.055)}
    .brand{font-size:10px;font-weight:900;letter-spacing:.10em}.brand span{display:block;color:#7f90a5;font-size:7px;margin-top:3px;letter-spacing:.09em}
    .state{font:800 8px ui-monospace,monospace;color:#95a6b9}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#59e6a4;box-shadow:0 0 9px #59e6a4;margin-right:6px}
    .body{padding:12px}.title{font-size:15px;font-weight:850;margin-bottom:3px}.sub{color:#8794a7;font-size:9px;margin-bottom:10px}
    .stage{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:#050a11}
    canvas{display:block;width:100%;height:auto;touch-action:none;user-select:none}
    .hint{position:absolute;left:10px;bottom:9px;padding:6px 8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(5,9,15,.76);color:#95a6b9;font-size:7px;font-weight:800;pointer-events:none}
    .range{padding:10px 12px;border-top:1px solid rgba(255,255,255,.05)}
    input[type=range]{width:100%;appearance:none;height:5px;border-radius:999px;background:rgba(255,255,255,.07);outline:none}
    input[type=range]::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border-radius:50%;background:#d8fbff;border:2px solid #173651;box-shadow:0 0 12px rgba(120,232,255,.35);cursor:grab}
    .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.055);color:#8794a7;font-size:8px}
    .bar{height:4px;flex:1;max-width:230px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.bar i{display:block;width:12%;height:100%;background:linear-gradient(90deg,#5d8eff,#78e8ff);transition:width .16s ease}
    .ok{color:#59e6a4}.bad{color:#ff748b}
  `;

  const C = { cyan:"#78e8ff", blue:"#5d8eff", green:"#59e6a4", amber:"#ffc96c", purple:"#ab8dff", red:"#ff748b", muted:"#8794a7" };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const normAngle = (a) => { while(a>Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; };
  const circularError = (a,b) => Math.abs(normAngle(a-b));

  function collectClientSignals(){
    return {
      language: navigator.language || undefined,
      platform: navigator.platform || undefined,
      timezoneOffset: new Date().getTimezoneOffset(),
      screenWidth: screen?.width || undefined,
      screenHeight: screen?.height || undefined,
      hardwareConcurrency: navigator.hardwareConcurrency || undefined,
      touchPoints: navigator.maxTouchPoints ?? undefined,
    };
  }

  async function api(path, body, apiBase){
    const response = await fetch(`${apiBase}${path}`, {
      method:"POST",
      mode:"cors",
      credentials:"omit",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      const error = new Error(data?.error || `HumanGuard request failed (${response.status})`);
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function start(options){
    const apiBase = options.apiBase || defaultApiBase;
    return api("/api/v2/humanguard/challenge/start", {
      siteKey:options.siteKey,
      action:options.action || "verify",
      wallet:options.wallet || undefined,
      walletChain:options.walletChain || undefined,
      client:collectClientSignals(),
    }, apiBase);
  }

  async function complete(options){
    const apiBase = options.apiBase || defaultApiBase;
    return api("/api/v2/humanguard/challenge/complete", {
      siteKey:options.siteKey,
      sessionId:options.sessionId,
      nonce:options.nonce,
      result:options.result,
      telemetry:options.telemetry || {},
    }, apiBase);
  }

  function bg(ctx,w,h,now){
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,"#07111b"); g.addColorStop(1,"#05080d"); ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="rgba(255,255,255,.022)";
    for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,h);ctx.stroke();}
    for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(w,y+.5);ctx.stroke();}
    const sy=30+((Math.sin(now*.001)+1)/2)*(h-60);ctx.strokeStyle="rgba(120,232,255,.035)";ctx.beginPath();ctx.moveTo(12,sy);ctx.lineTo(w-12,sy);ctx.stroke();
  }

  function label(ctx,t,x,y,size=8,color=C.muted,align="left"){
    ctx.save();ctx.fillStyle=color;ctx.font=`800 ${size}px ui-monospace,monospace`;ctx.textAlign=align;ctx.fillText(t,x,y);ctx.restore();
  }

  function makeShell(host,title,sub){
    host.textContent="";
    const shadow=host.shadowRoot || host.attachShadow({mode:"open"});
    shadow.innerHTML=`<style>${css}</style><div class="hg"><div class="top"><div class="brand">TRI-PROOF HUMANGUARD<span>ADAPTIVE HUMAN VERIFICATION</span></div><div class="state"><b class="dot"></b>LIVE</div></div><div class="body"><div class="title"></div><div class="sub"></div><div class="stage"><canvas width="680" height="330"></canvas><div class="hint">Loading challenge</div></div><div class="range" hidden></div></div><div class="foot"><span class="status">Verification active</span><div class="bar"><i></i></div></div></div>`;
    shadow.querySelector(".title").textContent=title;
    shadow.querySelector(".sub").textContent=sub;
    return {shadow,canvas:shadow.querySelector("canvas"),hint:shadow.querySelector(".hint"),status:shadow.querySelector(".status"),bar:shadow.querySelector(".bar i"),range:shadow.querySelector(".range")};
  }

  function setProgress(ui,value){ui.bar.style.width=`${clamp(Math.round(value),0,100)}%`;}
  function canvasPoint(canvas,e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)};}

  function verified(host,ui,response,options){
    ui.status.textContent="Verified";ui.status.className="status ok";ui.hint.textContent="HUMAN VERIFIED";setProgress(ui,100);
    host.dataset.verified="true";
    let field=host.querySelector('input[data-humanguard-response]');
    if(!field){field=document.createElement("input");field.type="hidden";field.dataset.humanguardResponse="";field.name=options.responseField || "triproof-human-response";host.appendChild(field);}
    field.value=response.token;
    const detail={token:response.token,humanScore:response.humanScore,challengeType:response.challengeType,action:response.action,expiresAt:response.expiresAt};
    host.dispatchEvent(new CustomEvent("triproof:verified",{detail,bubbles:true}));
    window.dispatchEvent(new CustomEvent("triproof:verified",{detail}));
    if(typeof options.onVerified==="function")options.onVerified(detail);
  }

  async function mountQuantum(host,challenge,options){
    const ui=makeShell(host,"Lock the quantum seal","Rotate the holographic layers until every marker aligns with the axis.");
    const ctx=ui.canvas.getContext("2d"),w=ui.canvas.width,h=ui.canvas.height,c={x:w/2,y:h/2+5};
    const cfg=challenge.challenge.config, rings=[150,108,69].map((r,i)=>({r,a:cfg.initialAngles[i],target:cfg.alignmentAxisAngle,selected:false,color:[C.cyan,C.blue,C.purple][i]}));
    const started=performance.now();let dragging=-1,last=0,moves=0,corrections=0,lastDirection=0,done=false,raf;
    const draw=(now)=>{bg(ctx,w,h,now);ctx.strokeStyle="rgba(120,232,255,.35)";ctx.beginPath();ctx.moveTo(c.x,18);ctx.lineTo(c.x,74);ctx.stroke();label(ctx,"ALIGN",c.x,14,7,C.muted,"center");
      rings.forEach((r,i)=>{const locked=circularError(r.a,r.target)<.095;ctx.save();ctx.translate(c.x,c.y);ctx.strokeStyle=locked?C.green:r.color;ctx.globalAlpha=.18;ctx.lineWidth=22;ctx.shadowBlur=14;ctx.shadowColor=locked?C.green:r.color;ctx.beginPath();ctx.arc(0,0,r.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r.r,0,Math.PI*2);ctx.stroke();const x=Math.cos(r.a)*r.r,y=Math.sin(r.a)*r.r;ctx.fillStyle=locked?C.green:r.color;ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+7,y+6);ctx.lineTo(x-7,y+6);ctx.closePath();ctx.fill();ctx.restore();});
      ctx.save();const g=ctx.createRadialGradient(c.x-6,c.y-7,2,c.x,c.y,34);g.addColorStop(0,"#efffff");g.addColorStop(.3,"#7eeaff");g.addColorStop(1,"#10356d");ctx.fillStyle=g;ctx.shadowBlur=20;ctx.shadowColor=C.cyan;ctx.beginPath();ctx.arc(c.x,c.y,34,0,Math.PI*2);ctx.fill();ctx.restore();
      const maxErr=Math.max(...rings.map(r=>circularError(r.a,r.target)));setProgress(ui,20+clamp(1-maxErr/1.8,0,1)*68);if(!done)raf=requestAnimationFrame(draw);};
    ui.canvas.addEventListener("pointerdown",e=>{if(done)return;const p=canvasPoint(ui.canvas,e),d=Math.hypot(p.x-c.x,p.y-c.y);let best=-1,bd=99;rings.forEach((r,i)=>{const dd=Math.abs(d-r.r);if(dd<22&&dd<bd){best=i;bd=dd;}});if(best<0)return;dragging=best;last=Math.atan2(p.y-c.y,p.x-c.x);ui.canvas.setPointerCapture?.(e.pointerId);});
    ui.canvas.addEventListener("pointermove",async e=>{if(dragging<0||done)return;const p=canvasPoint(ui.canvas,e),a=Math.atan2(p.y-c.y,p.x-c.x),da=normAngle(a-last);last=a;moves++;const dir=Math.sign(da);if(lastDirection&&dir&&dir!==lastDirection)corrections++;if(dir)lastDirection=dir;rings[dragging].a+=da;cfg.coupling[dragging].forEach((factor,j)=>{if(j!==dragging)rings[j].a+=da*factor;});const aligned=rings.every(r=>circularError(r.a,r.target)<.075);if(aligned&&performance.now()-started>720&&moves>=5){done=true;cancelAnimationFrame(raf);ui.hint.textContent="Seal locked • verifying";try{const res=await complete({...options,sessionId:challenge.sessionId,nonce:challenge.nonce,result:{angles:rings.map(r=>r.a)},telemetry:{durationMs:Math.round(performance.now()-started),pointerMoves:moves,clicks:1,corrections}});verified(host,ui,res,options);}catch(err){done=false;ui.status.textContent=err.message;ui.status.className="status bad";raf=requestAnimationFrame(draw);}}});
    window.addEventListener("pointerup",()=>{dragging=-1},{passive:true});ui.hint.textContent="Drag a ring to rotate";raf=requestAnimationFrame(draw);
  }

  function layerState(layer,t){return{x:layer.xA*t+layer.xB,y:layer.yA*t+layer.yB,rot:layer.rotA*t+layer.rotB,scale:1+layer.scaleA*t+layer.scaleB};}
  async function mountTime(host,challenge,options){
    const ui=makeShell(host,"Align the time fracture","Scrub through time until the holographic layers collapse into one seal.");const ctx=ui.canvas.getContext("2d"),w=ui.canvas.width,h=ui.canvas.height,c={x:w/2,y:h/2};const cfg=challenge.challenge.config;const slider=document.createElement("input");slider.type="range";slider.min=cfg.minT;slider.max=cfg.maxT;slider.step="0.001";slider.value=cfg.initialT;ui.range.hidden=false;ui.range.appendChild(slider);const started=performance.now();let scrubMoves=0,done=false,stable=0,raf;
    const draw=(now)=>{bg(ctx,w,h,now);let total=0;cfg.layers.forEach((layer,i)=>{const s=layerState(layer,+slider.value);total+=Math.abs(s.x)/62+Math.abs(s.y)/38+Math.abs(s.rot)/.55+Math.abs(s.scale-1)/.055;ctx.save();ctx.translate(c.x+s.x,c.y+s.y);ctx.rotate(s.rot);ctx.scale(s.scale,s.scale);ctx.strokeStyle=[C.cyan,C.blue,C.purple,C.amber,C.green][i];ctx.globalAlpha=.35;ctx.lineWidth=1.4;ctx.shadowBlur=12;ctx.shadowColor=ctx.strokeStyle;const rr=82-i*5;ctx.beginPath();for(let k=0;k<6;k++){const a=-Math.PI/2+k*Math.PI/3,x=Math.cos(a)*rr,y=Math.sin(a)*rr;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.restore();});const score=clamp(1-(total/cfg.layers.length)/2.8,0,1);setProgress(ui,15+score*75);label(ctx,`COHERENCE ${Math.round(score*100)}%`,28,h-24,10,score>.96?C.green:C.cyan);if(score>.97&&scrubMoves>=5&&performance.now()-started>650){if(!stable)stable=now;if(now-stable>420&&!done){done=true;cancelAnimationFrame(raf);ui.hint.textContent="Temporal lock • verifying";complete({...options,sessionId:challenge.sessionId,nonce:challenge.nonce,result:{timePosition:+slider.value},telemetry:{durationMs:Math.round(performance.now()-started),scrubMoves,pointerMoves:scrubMoves,clicks:1}}).then(res=>verified(host,ui,res,options)).catch(err=>{done=false;stable=0;ui.status.textContent=err.message;ui.status.className="status bad";raf=requestAnimationFrame(draw);});}}else stable=0;if(!done)raf=requestAnimationFrame(draw);};slider.addEventListener("input",()=>scrubMoves++);ui.hint.textContent="Move the temporal scrubber";raf=requestAnimationFrame(draw);
  }

  async function hashUint32(value){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return new DataView(digest).getUint32(0,false);}
  function xorshiftRandom(state){state^=state<<13;state^=state>>>17;state^=state<<5;return{state:state>>>0,value:(state>>>0)/4294967296};}
  async function packetSuspect(renderSeed,count){let state=(await hashUint32(`${renderSeed}:suspect`))||0x9e3779b9;const r=xorshiftRandom(state);return Math.floor(r.value*count);}
  async function mountPacket(host,challenge,options){
    const ui=makeShell(host,"Isolate the anomalous packet","Watch the live flow and intercept the packet that briefly breaks pattern.");const ctx=ui.canvas.getContext("2d"),w=ui.canvas.width,h=ui.canvas.height,cfg=challenge.challenge.config,suspect=await packetSuspect(cfg.renderSeed,cfg.packetCount),started=performance.now();let clicks=0,done=false,raf;const packets=Array.from({length:cfg.packetCount},(_,i)=>({id:i,lane:i%cfg.laneCount,t:(i/cfg.packetCount)*.85,speed:.055+(i%4)*.003,phase:i*.7,x:0,y:0}));
    const draw=(now)=>{bg(ctx,w,h,now);const elapsed=now-started;for(let l=0;l<cfg.laneCount;l++){const y=75+l*60;ctx.strokeStyle="rgba(120,232,255,.10)";ctx.beginPath();ctx.moveTo(60,y);ctx.bezierCurveTo(210,y+(l%2?30:-30),470,y+(l%2?-22:22),620,y);ctx.stroke();}packets.forEach(p=>{p.t+=p.speed/60;if(p.t>1)p.t-=1;const y=75+p.lane*60;let x=60+p.t*560,yy=y+Math.sin(p.t*Math.PI*2+p.phase)*8;const active=p.id===suspect&&elapsed>=cfg.anomalyAtMs&&elapsed<=cfg.anomalyAtMs+cfg.anomalyDurationMs;if(active){if(cfg.anomalyType==="JITTER")yy+=Math.sin(elapsed*.05)*12;if(cfg.anomalyType==="SURGE")x+=22;if(cfg.anomalyType==="PULSE")yy+=Math.sin(elapsed*.035)*7;}p.x=x;p.y=yy;ctx.save();ctx.fillStyle=active?"rgba(255,201,108,.16)":"rgba(120,232,255,.10)";ctx.strokeStyle=active?C.amber:C.cyan;ctx.shadowBlur=active?16:8;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.roundRect(x-13,yy-8,26,16,6);ctx.fill();ctx.stroke();ctx.restore();});setProgress(ui,15+clamp(elapsed/cfg.deadlineMs,0,1)*65);label(ctx,"SOURCE",25,38,7);label(ctx,"GATEWAY",640,38,7);if(!done)raf=requestAnimationFrame(draw);};
    ui.canvas.addEventListener("pointerdown",async e=>{if(done)return;clicks++;const p=canvasPoint(ui.canvas,e),elapsed=performance.now()-started;let best=null,bd=24;packets.forEach(q=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<bd){best=q;bd=d;}});if(!best)return;if(best.id!==suspect){ui.hint.textContent="Normal packet • keep watching";return;}if(elapsed<cfg.anomalyAtMs-180){ui.hint.textContent="Too early • keep watching";return;}done=true;cancelAnimationFrame(raf);ui.hint.textContent="Packet isolated • verifying";try{const res=await complete({...options,sessionId:challenge.sessionId,nonce:challenge.nonce,result:{selectedPacketId:best.id,elapsedMs:Math.round(elapsed)},telemetry:{durationMs:Math.round(elapsed),clicks,pointerMoves:0,corrections:Math.max(0,clicks-1)}});verified(host,ui,res,options);}catch(err){done=false;ui.status.textContent=err.message;ui.status.className="status bad";raf=requestAnimationFrame(draw);}});ui.hint.textContent="Watch the flow • click the anomaly";raf=requestAnimationFrame(draw);
  }

  function coherence(cfg,elapsed){const t=elapsed/1000,vals=cfg.frequencies.map((f,i)=>((cfg.phases[i]+f*t)%1+1)%1),d=(a,b)=>Math.min(Math.abs(a-b),1-Math.abs(a-b)),avg=(d(vals[0],vals[1])+d(vals[1],vals[2])+d(vals[2],vals[0]))/3;return{score:clamp(1-avg/.16,0,1),vals};}
  async function mountResonance(host,challenge,options){
    const ui=makeShell(host,"Lock the resonance","Activate the core when all three energy rings converge in phase.");const ctx=ui.canvas.getContext("2d"),w=ui.canvas.width,h=ui.canvas.height,c={x:w/2,y:h/2},cfg=challenge.challenge.config,started=performance.now();let clicks=0,done=false,raf;
    const draw=(now)=>{bg(ctx,w,h,now);const elapsed=now-started,s=coherence(cfg,elapsed);cfg.visualRadii.forEach((rr,i)=>{const phase=s.vals[i],a=phase*Math.PI*2-Math.PI/2,pulse=(Math.sin(phase*Math.PI*2)+1)/2,r=rr+(pulse-.5)*12;ctx.save();ctx.strokeStyle=[C.cyan,C.blue,C.purple][i];ctx.globalAlpha=.2+.17*pulse;ctx.lineWidth=2+2*pulse;ctx.shadowBlur=14;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,5,0,Math.PI*2);ctx.fill();ctx.restore();});ctx.save();const g=ctx.createRadialGradient(c.x-8,c.y-8,2,c.x,c.y,42);g.addColorStop(0,"#efffff");g.addColorStop(.25,"#89edff");g.addColorStop(1,"#0c346c");ctx.fillStyle=g;ctx.shadowBlur=18+s.score*24;ctx.shadowColor=s.score>.88?C.green:C.cyan;ctx.beginPath();ctx.arc(c.x,c.y,42,0,Math.PI*2);ctx.fill();ctx.restore();label(ctx,`COHERENCE ${Math.round(s.score*100)}%`,28,h-25,10,s.score>.88?C.green:C.cyan);setProgress(ui,15+s.score*75);ui.hint.textContent=s.score>.88?"RESONANCE WINDOW • ACTIVATE CORE":s.score>.68?"Synchronization approaching":"Watch the phase markers";if(!done)raf=requestAnimationFrame(draw);};
    ui.canvas.addEventListener("pointerdown",async e=>{if(done)return;const p=canvasPoint(ui.canvas,e);if(Math.hypot(p.x-c.x,p.y-c.y)>60)return;clicks++;const elapsed=performance.now()-started,s=coherence(cfg,elapsed);if(s.score<.88){ui.hint.textContent="Out of phase • keep watching";return;}done=true;cancelAnimationFrame(raf);ui.hint.textContent="Resonance locked • verifying";try{const res=await complete({...options,sessionId:challenge.sessionId,nonce:challenge.nonce,result:{elapsedMs:Math.round(elapsed)},telemetry:{durationMs:Math.round(elapsed),clicks,pointerMoves:0,corrections:Math.max(0,clicks-1)}});verified(host,ui,res,options);}catch(err){done=false;ui.status.textContent=err.message;ui.status.className="status bad";raf=requestAnimationFrame(draw);}});raf=requestAnimationFrame(draw);
  }

  async function mount(host, options={}){
    if(!host)throw new Error("HumanGuard mount target is required");
    const siteKey=options.siteKey || host.dataset.sitekey;
    if(!siteKey)throw new Error("HumanGuard siteKey is required");
    const merged={...options,siteKey,action:options.action||host.dataset.action||"verify",wallet:options.wallet||host.dataset.wallet||undefined,walletChain:options.walletChain||host.dataset.walletChain||undefined,apiBase:options.apiBase||host.dataset.apiBase||defaultApiBase,responseField:options.responseField||host.dataset.responseField};
    const loading=makeShell(host,"Checking session","Preparing adaptive human verification.");loading.hint.textContent="Starting secure challenge";setProgress(loading,18);
    let challenge;
    try{challenge=await start(merged);}catch(err){loading.status.textContent=err.message;loading.status.className="status bad";loading.hint.textContent="HumanGuard unavailable";throw err;}
    if(challenge.challenge.type==="QUANTUM_SEAL")return mountQuantum(host,challenge,merged);
    if(challenge.challenge.type==="PACKET_INTERCEPT")return mountPacket(host,challenge,merged);
    if(challenge.challenge.type==="TIME_FRACTURE")return mountTime(host,challenge,merged);
    return mountResonance(host,challenge,merged);
  }

  function autoMount(){document.querySelectorAll(".triproof-humanguard[data-sitekey]").forEach((el)=>{if(el.dataset.hgMounted)return;el.dataset.hgMounted="1";mount(el).catch(()=>{});});}

  window.TriProofHumanGuard={version:VERSION,start,complete,mount,autoMount};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",autoMount,{once:true});else queueMicrotask(autoMount);
})();
