let _id=0;
function sm(a,b,x){const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)}
function sdRound(px,py,cx,cy,hw,hh,r){const dx=Math.abs(px-cx)-hw+r,dy=Math.abs(py-cy)-hh+r;return Math.hypot(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0)-r}
// state: smile | wink | happy | talk | blink
function ledFace(GN,state,P){
  const s=22/GN, soft0=0.9*s, soft1=-0.3*s;
  const lit=(x,y)=>{
    let b=0,c=0;
    const eyeH=state==='blink'?0.6:3.0, eyeW=1.85, ey=8, ex=[6.2,15.8];
    for(let k=0;k<2;k++){
      const happy=state==='happy'||(state==='wink'&&k===1);
      if(happy){const dx=x-ex[k];const arcY=ey+1.6-2.6*Math.max(0,1-(dx*dx)/(2.8*2.8));const d=Math.abs(y-arcY)-0.75;if(Math.abs(dx)<3.0)b=Math.max(b,sm(soft0,soft1,d))}
      else b=Math.max(b,sm(soft0,soft1,sdRound(x,y,ex[k],ey,eyeW,eyeH,1.4)))
    }
    const ch=Math.max(sm(1.9*s,0.6*s,Math.hypot(x-1.7,y-12.8)),sm(1.9*s,0.6*s,Math.hypot(x-19.3,y-12.8)))*0.5;if(ch>b){b=ch;c=1}
    const mx=10.5,my=15.6;
    if(state!=='talk'){
      const dx=x-mx;const sy=my+0.6-2.4*Math.min(1,dx*dx/26);const d=Math.abs(y-sy)-0.72*Math.max(1,s*0.8);
      if(Math.abs(dx)<5.4){const q=sm(soft0,soft1,d);if(q>b){b=q;c=1}}
    }else{
      const dx=x-mx;const hh=3.2*(1-Math.pow(Math.abs(dx)/6.5,2)*0.6);
      const d=Math.max(Math.abs(y-(my+0.4))-hh,Math.abs(dx)-5.2);const q=sm(soft0,soft1,d);if(q>b){b=q;c=Math.abs(dx)>3.5?1:0.4}
    }
    return [b,c];
  };
  const pitch=P*0.846/GN, gx0=(P-GN*pitch)/2+pitch/2;
  let off='',on='',glow='';
  for(let gy=0;gy<GN;gy++)for(let gx=0;gx<GN;gx++){
    const [b,c]=lit(gx*s+(s-1)/2,gy*s+(s-1)/2);
    const cx=gx0+gx*pitch,cy=gx0+gy*pitch;
    if(b<0.04){off+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(pitch*0.17).toFixed(1)}" fill="#2A2D3C"/>`;continue}
    const col=c>0.55?'#FF4F9A':'#19D8FF',r=pitch*(0.17+b*0.32);
    on+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" opacity="${(0.45+0.55*b).toFixed(2)}"/>`;
    if(b>0.5)on+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r*0.45).toFixed(1)}" fill="#fff" opacity="${(b*0.9).toFixed(2)}"/>`;
    glow+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r*1.8).toFixed(1)}" fill="${col}" opacity="${(b*0.6).toFixed(2)}"/>`;
  }
  return {off,on,glow};
}
// returns SVG string of LED plate, size P px, no outer shadow (use CSS)
function led(P,{grid=22,state='smile',ring=true,rx=0.23}={}){
  const id='g'+(_id++);const f=ledFace(grid,state,P);
  return `<svg width="${P}" height="${P}" viewBox="0 0 ${P} ${P}" style="overflow:visible;display:block"><defs><filter id="b${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(P*0.017).toFixed(1)}"/></filter><linearGradient id="l${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2C3A"/><stop offset=".5" stop-color="#14151E"/><stop offset="1" stop-color="#0A0B10"/></linearGradient></defs>
  <rect width="${P}" height="${P}" rx="${P*rx}" fill="url(#l${id})"/>
  ${ring?`<rect x="${P*0.008}" y="${P*0.008}" width="${P*0.984}" height="${P*0.984}" rx="${P*rx*0.97}" fill="none" stroke="#19D8FF" stroke-width="${(P*0.012).toFixed(1)}" opacity=".7"/>`:''}
  <path d="M ${P*0.115} ${P*0.077} Q ${P*0.5} ${-P*0.008} ${P*0.885} ${P*0.077}" stroke="#fff" stroke-width="${P*0.012}" fill="none" opacity=".16" stroke-linecap="round"/>
  <g>${f.off}</g><g filter="url(#b${id})">${f.glow}</g><g>${f.on}</g></svg>`;
}
function ledBox(P,opt,extraStyle=''){return `<div style="width:${P}px;height:${P}px;filter:drop-shadow(0 ${P*0.05}px ${P*0.07}px rgba(20,22,60,.30));${extraStyle}">${led(P,opt)}</div>`}
function fitAll(){
  document.querySelectorAll('[data-fit]').forEach(el=>{
    const maxW=+el.dataset.fit;let fs=parseFloat(getComputedStyle(el).fontSize);
    const wd=()=>Math.max(el.getBoundingClientRect().width,el.scrollWidth);
    for(let i=0;i<30&&wd()>maxW;i++){fs*=maxW/wd()*0.998;el.style.fontSize=fs+'px'}
  });
}
function ready(){
  Promise.all([...['900 100px Unbounded','800 40px Manrope','700 40px JBM'].map(f=>document.fonts.load(f,'Мой канал ₽0123'))]).then(()=>document.fonts.ready).then(()=>{
    const imgs=[...document.images].filter(i=>!i.complete);
    return Promise.all(imgs.map(i=>new Promise(r=>{i.onload=i.onerror=r})));
  }).then(()=>{fitAll();document.body.dataset.ready='1'});
}
const win=(o)=>`<div class="win" data-deco style="left:${o.x}px;top:${o.y}px;width:${o.w}px;transform:${o.tf||'none'};${o.st||''}"><div class="tb"><i></i><i></i><i></i><b>${o.url||''}</b></div><div class="cnt" style="height:${o.h}px"><img src="${o.img}" style="${o.ist||''}"></div></div>`;
const phone=(o)=>`<div class="phone" data-deco style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;transform:${o.tf||'none'}"><div class="scr"><div class="isl"></div><img src="${o.img}"></div></div>`;

const tile=(o)=>`<img data-deco src="${o.img}" style="position:absolute;left:${o.x}px;top:${o.y}px;width:${o.s}px;height:${o.s}px;object-fit:cover;object-position:top;border-radius:${o.s*0.26}px;border:${Math.max(5,o.s*0.04)}px solid #fff;box-shadow:0 2px 4px rgba(20,22,40,.12),0 24px 46px rgba(20,22,60,.25);transform:rotate(${o.r||0}deg)">`;
const cursor=(x,y,s,c='#FF5A45')=>`<svg data-deco style="position:absolute;left:${x}px;top:${y}px;overflow:visible" width="${s}" height="${s}" viewBox="0 0 140 140"><path d="M 22 22 L 22 112 L 44 92 L 62 128 L 82 119 L 64 84 L 94 82 Z" fill="${c}" stroke="#fff" stroke-width="9" stroke-linejoin="round" transform="translate(6 8)" opacity=".28"/><path d="M 22 22 L 22 112 L 44 92 L 62 128 L 82 119 L 64 84 L 94 82 Z" fill="${c}" stroke="#fff" stroke-width="9" stroke-linejoin="round"/></svg>`;
