// Der Weg: eine Stadt in 3D, durch die man geht. Jeder Bereich ist eine Station, an jeder Station
// gibt es bis zu drei Ansichten (links, Mitte, rechts). Die Karten der Einträge schweben neben dem Weg.
// Ein Tipp auf eine freie Stelle legt etwas an, Halten und Ziehen sortiert die Karten innerhalb ihrer Ansicht.
// Die Stadt selbst (Häuser, Autos, Himmel) stammt aus dem Weg-Prototyp.
/* eslint-disable */
const THREE = window.THREE;
export const ACC = ['#3f7a4a', '#c0553a', '#3d6fa8', '#d1458a', '#6a5aa0'];

export function createWeg(opt) {
const SECT = opt.sections;
const SPACING = 90, S0 = 34, N = SECT.length, L = S0 + SPACING * (N - 1) + 80, LOOPL = SPACING * N, SA = S0 - SPACING / 2;
const LOOP = true;
const stationS = (i) => S0 + i * SPACING;
const AMP = 0.45; const TW = 2 * Math.PI / (SPACING * N);
const roadX = (z) => (Math.sin(z * TW * 3) * 8 + Math.sin(z * TW + 1) * 16) * AMP;
const T = { sky: 0xe4eedf, acc: ACC, kind: 'stadt' };

let W = innerWidth, H = innerHeight;
const MOBILE = /iPhone|iPad|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(MOBILE ? 1.6 : 2, devicePixelRatio || 1)); renderer.setSize(W, H);
renderer.domElement.className = 'weg-canvas';
opt.host.prepend(renderer.domElement);
let ctxLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctxLost = true; console.warn('Weg: Grafik-Kontext verloren'); }, false);
renderer.domElement.addEventListener('webglcontextrestored', () => { ctxLost = false; build(); }, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 700);
const hemi = new THREE.HemisphereLight(0xfffaf0, 0x6f6a5c, 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 0.5); sun.position.set(-30, 40, 10); scene.add(sun); scene.add(sun.target);
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
let world = new THREE.Group(); scene.add(world);

// ===================== Stadt (aus dem Prototyp übernommen) =====================
function rnd(seed){let s=seed;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6d2b79f5|0,(s>>>0)/4294967296));}
function noise(x,z){return Math.sin(x*.07+z*.031)*Math.cos(z*.05-x*.02)+.5*Math.sin(x*.17+1.3)*Math.cos(z*.13+.7);}
const lerpC=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t);
// ---------- Stadt: jedes Viertel ein eigener Vibe (detailliert) ----------
const CITY_TOP=[0x8fbde3,0x9cc3e6,0x7aa5d8,0x8a9cc8,0x37406e];
const CITY_HOR=[0xeef3e6,0xf8e7d3,0xe4ebf3,0xf3d2b8,0xeaa98c];
const CITY_SKY=CITY_HOR;
const CITY_HEMI=[.62,.62,.62,.58,.36];
const CITY_SUN=[0xfff4e0,0xffefd8,0xffffff,0xffd9a8,0xff9e6e];
const CITY_SUNI=[.62,.62,.66,.6,.32];
const CITY_GROUND=[0x7fa56c,0xc9bfb2,0xb2b6bc,0x8d8580,0x8f8b98];
const CITY_ROAD=[0xcdbb98,0xbdb0a0,0x67696f,0x5b5856,0x8a8079];
const CITY_RW=[1.2,3.8,4.6,3.6,3.2];
const SW=4.2;
const wrapF=s=>{let f=((s-S0)/SPACING)%N;if(f<0)f+=N;if(!(f<N))f=0;return f;};
function zoneOf(z){return Math.round(wrapF(-z))%N;}
function zoneF(z){const f=wrapF(-z);const i=Math.floor(f);return {i,j:(i+1)%N,t:f-i};}
function smoothZ(arr,z){const q=zoneF(z);const t=q.t<.35?0:q.t>.65?1:(q.t-.35)/.3;return arr[q.i]+(arr[q.j]-arr[q.i])*t;}
function rwAt(z){return smoothZ(CITY_RW,z);}
function swAt(z){return smoothZ([0,SW,SW,SW,SW],z);}
function roadAng(z){return Math.atan2(-(roadX(z-1)-roadX(z)),1);}
// ---- Texturen (Leinwand, in Metern gekachelt) ----
function canvasTex(w,h,draw,rep=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;}t.anisotropy=4;return t;}
function speckle(g,w,h,a,R){for(let i=0;i<w*h/18;i++){g.fillStyle=`rgba(${R()<.5?0:255},${R()<.5?0:255},${R()<.5?0:255},${a*R()})`;g.fillRect(R()*w,R()*h,1.5,1.5);}}
function winGlass(g,x,y,w,h,lit,R){const gr=g.createLinearGradient(x,y,x+w,y+h);
  if(lit){gr.addColorStop(0,'#ffd48a');gr.addColorStop(1,'#f7b45e');}else{gr.addColorStop(0,'#55697d');gr.addColorStop(.55,'#7f95a8');gr.addColorStop(1,'#3e4c5c');}
  g.fillStyle=gr;g.fillRect(x,y,w,h);if(!lit){g.fillStyle='rgba(255,255,255,.18)';g.beginPath();g.moveTo(x,y+h*.6);g.lineTo(x+w*.5,y);g.lineTo(x+w*.75,y);g.lineTo(x,y+h);g.fill();}}
// Putzfassade: Kachel 2x2 Fenster = 6m x 6.4m; mode 'lit' liefert [map, emissiveMap]
function texPlaster(seed,mode){const R=rnd(seed);const c=document.createElement('canvas'),e=document.createElement('canvas');c.width=c.height=e.width=e.height=256;
  const g=c.getContext('2d'),q=e.getContext('2d');const w=256,h=256;q.fillStyle='#000';q.fillRect(0,0,w,h);
  g.fillStyle='#f6f3ee';g.fillRect(0,0,w,h);speckle(g,w,h,.05,R);
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=i*128+36,y=j*128+26,ww=56,hh=74;const lit=mode==='lit'&&R()<.6;
    g.fillStyle='#e6e1d8';g.fillRect(x-7,y-7,ww+14,hh+14);
    winGlass(g,x,y,ww,hh,lit,R);if(lit){q.fillStyle='#ffc46e';q.fillRect(x,y,ww,hh);}
    g.fillStyle='#f3efe8';g.fillRect(x+ww/2-2,y,4,hh);g.fillRect(x,y+hh*.38,ww,4);
    if(R()<.35){g.fillStyle='rgba(240,236,228,.95)';g.fillRect(x,y,ww,hh*.3+R()*hh*.4);}
    g.fillStyle='#d9d3c8';g.fillRect(x-10,y+hh+4,ww+20,7);
    if(R()<.4){g.fillStyle='#5f7f6a';g.fillRect(x-22,y-4,14,hh+8);g.fillRect(x+ww+8,y-4,14,hh+8);
      g.fillStyle='rgba(0,0,0,.15)';for(let k=0;k<8;k++){g.fillRect(x-22,y+k*10,14,2);g.fillRect(x+ww+8,y+k*10,14,2);}}}
  const mk=cv=>{const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;};
  return mode==='lit'?[mk(c),mk(e)]:mk(c);}
function texBrick(seed){const R=rnd(seed);return canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#b9b0a6';g.fillRect(0,0,w,h);
  const bh=8,bw=22;for(let y=0;y<h;y+=bh){const o=(y/bh)%2?bw/2:0;for(let x=-bw;x<w+bw;x+=bw){const v=200+R()*40|0;g.fillStyle=`rgb(${v},${v*.86|0},${v*.8|0})`;g.fillRect(x+o+1,y+1,bw-2,bh-2);}}
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=i*128+38,y=j*128+30,ww=52,hh=72;
    g.fillStyle='#ece6dc';g.fillRect(x-6,y-12,ww+12,10);g.fillRect(x-6,y+hh,ww+12,8);
    winGlass(g,x,y,ww,hh,R()<.08,R);g.fillStyle='#f1ece4';g.fillRect(x,y+hh/2-2,ww,4);g.fillRect(x+ww/2-2,y,4,hh);}
  speckle(g,w,h,.08,R);});}
function texGlass(seed,tone){const R=rnd(seed);return canvasTex(128,256,(g,w,h)=>{
  const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,tone[0]);gr.addColorStop(.5,tone[1]);gr.addColorStop(1,tone[2]);g.fillStyle=gr;g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=32){g.fillStyle='rgba(255,255,255,'+(.05+R()*.12)+')';g.fillRect(0,y+2,w,28);g.fillStyle='rgba(20,30,40,.55)';g.fillRect(0,y,w,3);}
  for(let x=0;x<w;x+=32){g.fillStyle='rgba(20,30,40,.4)';g.fillRect(x,0,2,h);}
  g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.moveTo(0,h*.8);g.lineTo(w,h*.2);g.lineTo(w,h*.35);g.lineTo(0,h*.95);g.fill();});}
function texShop(seed){const R=rnd(seed);return canvasTex(256,128,(g,w,h)=>{
  g.fillStyle='#ece7df';g.fillRect(0,0,w,h);
  g.fillStyle='#3a3530';g.fillRect(14,20,150,96);const gr=g.createLinearGradient(0,20,0,116);gr.addColorStop(0,'#fff1d6');gr.addColorStop(1,'#e8c99a');g.fillStyle=gr;g.fillRect(18,24,142,88);
  for(let i=0;i<9;i++){g.fillStyle=['#c0553a','#2f7480','#d9a03a','#6a5aa0','#4c7a55','#e88aa0'][i%6];g.fillRect(26+i*15,70+R()*20,10,30);}
  g.fillStyle='rgba(255,255,255,.35)';g.fillRect(18,24,142,6);
  g.fillStyle='#4a3b30';g.fillRect(186,26,54,96);g.fillStyle='#f6e2b8';g.fillRect(192,32,42,40);g.fillStyle='#c9a46a';g.fillRect(226,80,4,8);});}
function texShutter(){return canvasTex(128,64,(g,w,h)=>{g.fillStyle='#9a9a98';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=4){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,y,w,1);}});}
function texAsphalt(){const R=rnd(5);return canvasTex(128,128,(g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);for(let i=0;i<1600;i++){const v=200+R()*55|0;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(R()*w,R()*h,2,2);}
  g.strokeStyle='rgba(60,60,60,.25)';g.lineWidth=1.5;g.beginPath();g.moveTo(R()*w,0);for(let i=0;i<6;i++)g.lineTo(R()*w,i*h/5);g.stroke();});}
function texPaving(){const R=rnd(9);return canvasTex(128,128,(g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=32)for(let x=0;x<w;x+=32){const v=225+R()*30|0;g.fillStyle=`rgb(${v},${v},${v-4})`;g.fillRect(x+1,y+1,30,30);}});}
function texGrass(){const R=rnd(13);return canvasTex(128,128,(g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);for(let i=0;i<2500;i++){const v=205+R()*50|0;g.fillStyle=`rgb(${v},${v+4|0},${v-10|0})`;g.fillRect(R()*w,R()*h,1.5,3);}});}
// Graffiti-Atlas 4x4
function texGraffitiAtlas(){const R=rnd(77);const words=['VIBE','LOS!','IDEE','MACH','LIFE','JETZT','KIEZ','HOME','WOW','YO!','ZUKUNFT','FREI','MUT','TRAUM','KUNST','BOOM'];
  const cols=['#ff5d8f','#ffd23f','#3ad3c5','#7b6cff','#ff8a3d','#68e06b','#ff4f4f','#4fc3ff'];
  return canvasTex(1024,512,(g,W,H)=>{const tw=256,th=128;
    words.forEach((word,k)=>{const ox=(k%4)*tw,oy=Math.floor(k/4)*th;g.save();g.beginPath();g.rect(ox,oy,tw,th);g.clip();
      for(let i=0;i<4;i++){g.fillStyle=cols[Math.floor(R()*cols.length)]+'66';g.beginPath();g.ellipse(ox+R()*tw,oy+R()*th,30+R()*60,14+R()*30,R()*3,0,7);g.fill();}
      const c1=cols[Math.floor(R()*cols.length)];g.translate(ox+tw/2,oy+th/2);g.rotate((R()-.5)*.2);
      g.font=`900 ${word.length>5?40:56}px "Arial Black",Impact,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
      g.lineWidth=11;g.strokeStyle='#1d1b22';g.strokeText(word,0,0);g.fillStyle=c1;g.fillText(word,0,0);g.lineWidth=2;g.strokeStyle='#fff';g.strokeText(word,-2,-2);
      g.fillStyle=c1;for(let i=0;i<5;i++)g.fillRect(-tw*.3+R()*tw*.6,th*.2,3,6+R()*18);g.restore();});},false);}
function texFence(){return canvasTex(64,64,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle='#9aa0a4';g.lineWidth=2;for(let i=-64;i<128;i+=12){g.beginPath();g.moveTo(i,0);g.lineTo(i+64,64);g.stroke();g.beginPath();g.moveTo(i+64,0);g.lineTo(i,64);g.stroke();}});}
function texCourt(){return canvasTex(256,512,(g,w,h)=>{g.fillStyle='#c46a4a';g.fillRect(0,0,w,h);g.fillStyle='#3f7aa0';g.fillRect(70,0,116,150);g.fillRect(70,h-150,116,150);
  g.strokeStyle='#fff';g.lineWidth=5;g.strokeRect(8,8,w-16,h-16);g.beginPath();g.moveTo(8,h/2);g.lineTo(w-8,h/2);g.stroke();g.beginPath();g.arc(w/2,h/2,40,0,7);g.stroke();
  g.beginPath();g.arc(w/2,20,90,0,Math.PI);g.stroke();g.beginPath();g.arc(w/2,h-20,90,Math.PI,0);g.stroke();},false);}
// ---- Autos: weiche Formen aus Seitenprofil, Scheiben, Räder mit Felgen ----
const CAR_TYPES={
  limo:{w:1.74,body:[[-2.15,.32],[-2.2,.72],[-1.75,.86],[-1.15,.9],[-.75,1.34],[.5,1.37],[1.05,.95],[1.95,.82],[2.2,.6],[2.15,.32]],glass:[[-1.05,.9],[-.7,1.3],[.48,1.32],[.98,.93]],wheels:[-1.35,1.32],r:.34},
  kombi:{w:1.76,body:[[-2.25,.34],[-2.25,.86],[-2.1,1.36],[.45,1.4],[1.05,.96],[1.95,.84],[2.22,.62],[2.18,.34]],glass:[[-2.12,.92],[-2.0,1.32],[.42,1.34],[.96,.95]],wheels:[-1.45,1.35],r:.35},
  klein:{w:1.68,body:[[-1.75,.32],[-1.8,.95],[-1.55,1.38],[.25,1.42],[.85,.98],[1.6,.82],[1.82,.6],[1.78,.32]],glass:[[-1.62,1.0],[-1.45,1.34],[.22,1.37],[.78,.99]],wheels:[-1.15,1.12],r:.32},
  bus:{w:1.95,body:[[-2.5,.4],[-2.5,2.05],[1.55,2.1],[2.2,1.25],[2.45,1.0],[2.45,.4]],glass:[[-2.35,1.35],[-2.35,1.85],[1.45,1.9],[1.95,1.3]],wheels:[-1.6,1.55],r:.38},
};
const _carCache={};
function shapeOf(pts){const sh=new THREE.Shape();pts.forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));sh.closePath();return sh;}
function pushGeo(out,geo,color,mat){const g=geo.index?geo.toNonIndexed():geo;if(mat)g.applyMatrix4(mat);const p=g.attributes.position.array,n=g.attributes.normal.array,c=new THREE.Color(color);
  for(let i=0;i<p.length;i++){out.p.push(p[i]);out.n.push(n[i]);}for(let i=0;i<p.length/3;i++)out.c.push(c.r,c.g,c.b);}
function carGeometry(type,color){const key=type+color;if(_carCache[key])return _carCache[key];const T2=CAR_TYPES[type],out={p:[],n:[],c:[]};
  const toCar=new THREE.Matrix4().makeRotationY(Math.PI/2);const m=new THREE.Matrix4();
  // Karosserie
  const bw=T2.w-.12;const body=new THREE.ExtrudeGeometry(shapeOf(T2.body),{depth:bw,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2,curveSegments:4});
  body.translate(0,0,-bw/2);pushGeo(out,body,color,toCar);
  // Scheiben: etwas größer, damit sie aus der Karosserie schauen
  const gl=T2.glass,cx=(gl[0][0]+gl[3][0])/2;const gpts=[...gl.map(([x,y])=>[cx+(x-cx)*1.035,y+.005]),[cx+(gl[3][0]-cx)*1.035,gl[3][1]-.01],[cx+(gl[0][0]-cx)*1.035,gl[0][1]-.01]];
  const glass=new THREE.ExtrudeGeometry(shapeOf(gpts.slice(0,4)),{depth:T2.w+.02,bevelEnabled:false});glass.translate(0,0,-(T2.w+.02)/2);pushGeo(out,glass,0x26303c,toCar);
  // Räder und Felgen
  const wheel=new THREE.CylinderGeometry(T2.r,T2.r,.26,16);wheel.rotateZ(Math.PI/2);const rim=new THREE.CylinderGeometry(T2.r*.55,T2.r*.55,.28,12);rim.rotateZ(Math.PI/2);
  for(const zz of T2.wheels)for(const sx of [-1,1]){m.makeTranslation(sx*(T2.w/2-.08),T2.r,-zz);pushGeo(out,wheel,0x1c1d20,m);pushGeo(out,rim,0xc9cdd2,m);}
  // Lichter, Stoßstangen, Kennzeichen
  const box=(w,h,d,x,y,z,c)=>{const b=new THREE.BoxGeometry(w,h,d);m.makeTranslation(x,y,z);pushGeo(out,b,c,m);};
  const front=-T2.body.reduce((a,p)=>Math.max(a,p[0]),0),rear=-T2.body.reduce((a,p)=>Math.min(a,p[0]),0);
  for(const sx of [-1,1]){box(.34,.13,.06,sx*(T2.w/2-.3),.68,front-.02,0xfff4d6);box(.3,.14,.06,sx*(T2.w/2-.28),.74,rear+.02,0xc8282e);}
  box(T2.w-.1,.16,.12,0,.36,front,0x2a2b2e);box(T2.w-.1,.16,.12,0,.36,rear,0x2a2b2e);box(.5,.12,.03,0,.5,rear+.07,0xf1efe8);
  box(.06,.1,.18,-(T2.w/2+.02),1.0,front+1.1,color);box(.06,.1,.18,(T2.w/2+.02),1.0,front+1.1,color); // Spiegel
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(out.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(out.c,3));
  _carCache[key]=g;return g;}
const CAR_PAINT=[0xb8322b,0xf2efe8,0x2c5b8c,0x34363b,0xe0a43a,0x5f9c98,0x9da3aa,0x6d4a86,0x3e6b4a,0xd9765a];
const carMat=()=>new THREE.MeshPhongMaterial({vertexColors:true,shininess:90,specular:0x666666});
// ---- Geometrie-Bausteine ----
function Geo(){return {p:[],n:[],uv:[],c:[],i:[]};}
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_n=new THREE.Vector3();
function addFace(G,pts,col,uvs,shade){
  _a.set(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1],pts[1][2]-pts[0][2]);_b.set(pts[2][0]-pts[0][0],pts[2][1]-pts[0][1],pts[2][2]-pts[0][2]);_n.crossVectors(_a,_b).normalize();
  const b=G.p.length/3;pts.forEach((p,k)=>{G.p.push(p[0],p[1],p[2]);G.n.push(_n.x,_n.y,_n.z);const u=uvs?uvs[k]:[.02,.02];G.uv.push(u[0],u[1]);
    const s=shade?shade[k]:1;G.c.push(col.r*s,col.g*s,col.b*s);});
  if(pts.length===3)G.i.push(b,b+1,b+2);else G.i.push(b,b+1,b+2,b,b+2,b+3);}
// Rahmen: lokale Achsen lx (quer zur Straße), lz (entlang der Straße)
function Frame(cx,cz,rot){const c=Math.cos(rot),s=Math.sin(rot);return {cx,cz,rot,P:(lx,ly,lz)=>[cx+lx*c+lz*s,ly,cz-lx*s+lz*c]};}
// Box in Rahmen; tex = [kachelBreite,kachelHöhe,vOffset] oder null; ao = Boden abdunkeln
function fbox(G,F,lx,ly,lz,w,h,d,color,tex,ao=true,topCol){
  const col=new THREE.Color(color),tc=topCol!==undefined?new THREE.Color(topCol):col;const x0=lx-w/2,x1=lx+w/2,z0=lz-d/2,z1=lz+d/2,y0=ly,y1=ly+h;
  const sh=(ao&&ly<.3)?[.72,.72,1,1]:[1,1,1,1];
  const U=(len)=>tex?[[0,(tex[2]||0)],[len/tex[0],(tex[2]||0)],[len/tex[0],(tex[2]||0)+h/tex[1]],[0,(tex[2]||0)+h/tex[1]]]:null;
  addFace(G,[F.P(x0,y0,z1),F.P(x1,y0,z1),F.P(x1,y1,z1),F.P(x0,y1,z1)],col,U(w),sh);
  addFace(G,[F.P(x1,y0,z0),F.P(x0,y0,z0),F.P(x0,y1,z0),F.P(x1,y1,z0)],col,U(w),sh);
  addFace(G,[F.P(x1,y0,z1),F.P(x1,y0,z0),F.P(x1,y1,z0),F.P(x1,y1,z1)],col,U(d),sh);
  addFace(G,[F.P(x0,y0,z0),F.P(x0,y0,z1),F.P(x0,y1,z1),F.P(x0,y1,z0)],col,U(d),sh);
  addFace(G,[F.P(x0,y1,z1),F.P(x1,y1,z1),F.P(x1,y1,z0),F.P(x0,y1,z0)],tc,null);}
function fprism(G,F,lx,ly,lz,w,h,d,color){const col=new THREE.Color(color),x0=lx-w/2,x1=lx+w/2,z0=lz-d/2,z1=lz+d/2,y1=ly+h;
  addFace(G,[F.P(x0,ly,z1),F.P(lx,y1,z1),F.P(lx,y1,z0),F.P(x0,ly,z0)],col,null);
  addFace(G,[F.P(x1,ly,z0),F.P(lx,y1,z0),F.P(lx,y1,z1),F.P(x1,ly,z1)],col,null);
  const gc=col.clone().multiplyScalar(.9);addFace(G,[F.P(x0,ly,z1),F.P(x1,ly,z1),F.P(lx,y1,z1)],gc,null);addFace(G,[F.P(x1,ly,z0),F.P(x0,ly,z0),F.P(lx,y1,z0)],gc,null);}
function fquad(G,F,a,b,c,d,color,uvs){addFace(G,[F.P(...a),F.P(...b),F.P(...c),F.P(...d)],new THREE.Color(color),uvs);}
function cyl(G,x,y,z,r0,r1,h,seg,color,ao=true){const col=new THREE.Color(color);for(let i=0;i<seg;i++){const a0=i/seg*6.283,a1=(i+1)/seg*6.283;
  const p=(a,r,yy)=>[x+Math.cos(a)*r,yy,z+Math.sin(a)*r];addFace(G,[p(a0,r0,y),p(a0,r1,y+h),p(a1,r1,y+h),p(a1,r0,y)],col,null,ao&&y<.3?[.75,1,1,.75]:null);
  if(r1>0)addFace(G,[[x,y+h,z],p(a1,r1,y+h),p(a0,r1,y+h)],col,null);}}
function geoMesh(G,mat){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(G.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(G.n,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(G.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(G.c,3));g.setIndex(G.i);return new THREE.Mesh(g,mat);}
function strip(G,fromS,toS,o0,o1,y0,y1,color,texW,side){ // Band entlang der Straße (Gehweg, Bordstein)
  const col=new THREE.Color(color);for(let s=fromS;s<toS;s+=2){const za=-s,zb=-(s+2);
    const pa=(o,y,z)=>{const a=roadAng(z),rw=rwAt(z);const off=side*(rw+o);return [roadX(z)+Math.cos(a)*off,y,z-Math.sin(a)*off];};
    const q=[pa(o0,y0,za),pa(o1,y1,za),pa(o1,y1,zb),pa(o0,y0,zb)];if(side<0)q.reverse();
    addFace(G,q,col,texW?[[0,s/texW],[ (o1-o0)/texW,s/texW],[(o1-o0)/texW,(s+2)/texW],[0,(s+2)/texW]]:null);}}
let cityTick=null;
function loopCopies(){const kids=[...world.children].filter(k=>!k.userData.nc);for(const sh of [-LOOPL,LOOPL])for(const k of kids){const c=k.clone();c.position.z+=sh;c.userData.copy=sh;world.add(c);}}
function gateCopies(s){for(const c of world.children){const sh=c.userData.copy;if(!sh)continue;c.visible=sh>0?(s<SA+200):(s>SA+LOOPL-200);}}
function buildCity(R,gL){
  const blobs=[];const people=[];const movers=[];const parked=[];
  const M={
    plaster:texPlaster(3,'day'),brick:texBrick(5),
    glassA:texGlass(6,['#46617c','#9db6cc','#3a5068']),glassB:texGlass(7,['#3f6f6c','#9fc9c0','#2f5250']),glassC:texGlass(8,['#6e6252','#d6c6a8','#5a4f42']),
    shop:texShop(9),shutter:texShutter(),asphalt:texAsphalt(),paving:texPaving(),grass:texGrass(),graff:texGraffitiAtlas(),fence:texFence(),court:texCourt()};
  [M.plasterLit,M.emit]=texPlaster(4,'lit');
  const G={plaster:Geo(),lit:Geo(),brick:Geo(),gA:Geo(),gB:Geo(),gC:Geo(),shop:Geo(),shutter:Geo(),solid:Geo(),glow:Geo(),paving:Geo(),graff:Geo(),fence:Geo()};

  // Boden
  const g=new THREE.PlaneGeometry(460,LOOPL,70,200);g.rotateX(-Math.PI/2);g.translate(0,0,-(SA+LOOPL/2));
  const pos=g.attributes.position,col=new Float32Array(pos.count*3),uv=g.attributes.uv;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),q=zoneF(z);const c=lerpC(CITY_GROUND[q.i],CITY_GROUND[q.j],q.t<.4?0:q.t>.6?1:(q.t-.4)/.2);
    col.set([c.r,c.g,c.b],i*3);uv.setXY(i,x/6,z/6);}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const ground=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,map:M.grass}));ground.receiveShadow=true;world.add(ground);

  // Straße mit Asphalt
  const rp=[],rc=[],ri=[],ruv=[],steps=LOOPL/1.5;
  for(let i=0;i<=steps;i++){const z=-SA-i*1.5,x=roadX(z),a=roadAng(z),w=rwAt(z),nx=Math.cos(a)*w,nz=-Math.sin(a)*w,c=new THREE.Color(smoothC(CITY_ROAD,z));
    rp.push(x-nx,.03,z-nz,x+nx,.03,z+nz);rc.push(c.r,c.g,c.b,c.r,c.g,c.b);ruv.push(0,-z/4.5,w*2/4.5,-z/4.5);if(i<steps){const b=i*2;ri.push(b,b+1,b+2,b+1,b+3,b+2);}}
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));rg.setAttribute('color',new THREE.Float32BufferAttribute(rc,3));rg.setAttribute('uv',new THREE.Float32BufferAttribute(ruv,2));rg.setIndex(ri);rg.computeVertexNormals();
  const road=new THREE.Mesh(rg,new THREE.MeshLambertMaterial({vertexColors:true,map:M.asphalt}));road.receiveShadow=true;world.add(road);
  // Gehwege mit Bordstein
  const sFrom=S0+SPACING*.5;
  for(const side of [-1,1]){strip(G.paving,sFrom,SA+LOOPL,.12,SW,.16,.16,0xd9d5ce,1.5,side);strip(G.solid,sFrom,SA+LOOPL,0,.12,.03,.16,0xbab5ad,0,side);strip(G.solid,sFrom,SA+LOOPL,0,.12,.16,.16,0xe8e4dc,0,side);}
  // Markierungen und Zebrastreifen
  for(let s=sFrom+8;s<SA+LOOPL;s+=6){const z=-s;{const zo=zoneOf(z);if(zo!==2&&zo!==3)continue;}const F=Frame(roadX(z),z,roadAng(z));fbox(G.glow,F,0,.035,0,.13,.005,2.4,0xe9e6dd,null,false);}
  for(let i=1;i<N;i++){const z=-stationS(i)+3,F=Frame(roadX(z),z,roadAng(z)),rw=rwAt(z);for(let x=-rw+.4;x<rw;x+=.9)fbox(G.glow,F,x,.036,0,.5,.005,3,0xf2efe6,null,false);}

  // Laternen
  const lamp=(x,z,side,warm)=>{const F=Frame(x,z,roadAng(z));fbox(G.solid,F,0,0,0,.16,4.6,.16,0x34363a);fbox(G.solid,F,-side*.5,4.5,0,1.1,.1,.1,0x34363a,null,false);
    fbox(G.solid,F,-side*1,4.35,0,.45,.18,.3,0x2c2e31,null,false);fbox(G.glow,F,-side*1,4.3,0,.36,.06,.22,warm?0xffd28a:0xfff4dc,null,false);};
  // Menschen
  const person=(x,z,rot,R)=>{const F=Frame(x,z,rot);const top=[0xc0553a,0x2f7480,0xd9a03a,0x4c7a55,0x6a5aa0,0xe88aa0,0xf0ede6,0x2b2d33][Math.floor(R()*8)],leg=[0x2b3445,0x5a4a3a,0x22252b,0x7a8a9a][Math.floor(R()*4)];
    const h=.9+R()*.15;fbox(G.solid,F,0,0,-.09,.14,.8*h,.14,leg,null,false);fbox(G.solid,F,0,0,.09,.14,.8*h,.14,leg,null,false);
    fbox(G.solid,F,0,.8*h,0,.26,.62*h,.4,top,null,false);blobs.push([F.P(0,0,0)[0],1.62*h,F.P(0,0,0)[2],.13,.13,.13,[0xe2b48f,0xc68c64,0x8a5a3c,0xf0c8a8][Math.floor(R()*4)]]);};
  // Auto
  const carCols=[0xc0392b,0xf3efe6,0x2f5d8a,0x3b3b3f,0xd9a03a,0x6aa3a0,0x9aa0a6,0x7a4b8a];
  const car=(G1,F,lx,lz,c,GG=G.glow)=>{fbox(G1,F,lx,.28,lz,1.7,.62,4.0,c,null,false);fbox(G1,F,lx,.9,lz-.2,1.5,.55,2.1,c,null,false,c);
    fbox(G1,F,lx,.93,lz-.2,1.52,.42,2.0,0x2c3440,null,false,c);
    for(const a of [-1,1])for(const b of [-1.3,1.3])fbox(G1,F,lx+a*.8,0,lz+b,.22,.56,.56,0x1d1e21,null,false);
    fbox(GG,F,lx-.55,.62,lz-2.01,.3,.14,.02,0xfff2cf,null,false);fbox(GG,F,lx+.55,.62,lz-2.01,.3,.14,.02,0xfff2cf,null,false);
    fbox(GG,F,lx-.6,.66,lz+2.01,.3,.12,.02,0xd23c3c,null,false);fbox(GG,F,lx+.6,.66,lz+2.01,.3,.12,.02,0xd23c3c,null,false);};
  // Baum
  const TREEC=[[0x5f8f55,0x77a05f,0x4c7a48,0x8db36a],[0x6f9a5a,0x86a95e],[0x5f8a58,0x6c9660],[0x6f8a4a,0x8a9a50,0xb07a3a],[0x55705a,0x667e5f]];
  const tree=(x,z,s,zone,R,kind)=>{const cs=TREEC[zone];const c=cs[Math.floor(R()*cs.length)];kind=kind??(R()<.6?0:R()<.5?1:2);
    if(kind===1){cyl(G.solid,x,0,z,.16*s,.12*s,1.4*s,5,0x6b5545);cyl(G.solid,x,1.2*s,z,1.3*s,0,4.2*s,7,c);return;}
    cyl(G.solid,x,0,z,.17*s,.12*s,2.4*s,5,0x6b5545);
    if(kind===2){blobs.push([x,3.6*s,z,.9*s,2.4*s,.9*s,c]);return;}
    const n=2+Math.floor(R()*3);for(let k=0;k<n;k++)blobs.push([x+(R()-.5)*1.4*s,(2.8+R()*1.2)*s,z+(R()-.5)*1.4*s,(.9+R()*.5)*s,(.8+R()*.4)*s,(.9+R()*.5)*s,c]);};
  // Graffiti-Fläche (Atlas)
  const graffiti=(F,lx,y,lz,w,h,face,R)=>{const k=Math.floor(R()*16),u0=(k%4)/4,v0=1-(Math.floor(k/4)+1)/4;
    fquad(G.graff,F,[lx,y,lz+face*w/2],[lx,y,lz-face*w/2],[lx,y+h,lz-face*w/2],[lx,y+h,lz+face*w/2],0xffffff,face>0?[[u0+.25,v0],[u0,v0],[u0,v0+.25],[u0+.25,v0+.25]]:[[u0,v0],[u0+.25,v0],[u0+.25,v0+.25],[u0,v0+.25]]);};

  // ---------- Häuser je Viertel ----------
  for(const side of [-1,1]){
    let z=-(S0*.5);
    // Park: nur Stadtsilhouette in der Ferne
    for(let zz=-SA;zz>-(S0+SPACING*.5);zz-=9){const F=Frame(roadX(zz)+side*(55+R()*30),zz,roadAng(zz));const h=12+R()*30,w=8+R()*6;fbox(R()<.5?G.plaster:G.gA,F,0,0,0,w,h,8,[0xd8d0c4,0xc9d2da,0xe6dccb][Math.floor(R()*3)],[6,6.4]);}
    z=-(S0+SPACING*.5);
    let lastLamp=0,lastString=0,courtDone=false;
    while(z>-(SA+LOOPL)+4){
      const zone=zoneOf(z),rw=rwAt(z);const fa=-side; // Fassade zeigt Richtung -side
      if(zone===1){ // Einkaufsviertel: Altbau, Läden, Markisen, Lichterketten
        const len=6+R()*5,dep=10,fl=2+Math.floor(R()*3),FH=3.2,GF=3.8,h=GF+fl*FH;const cz=z-len/2,F=Frame(roadX(cz)+side*(rw+SW+dep/2),cz,roadAng(cz));
        const c=[0xf0d9c4,0xdfd4bf,0xf2e2c2,0xcfded4,0xedc3b4,0xd9cde3,0xf4e7bd,0xe9e3da][Math.floor(R()*8)];
        fbox(G.shop,F,0,0,0,dep,GF,len,0xffffff,[len>8?8:len,GF]);
        fbox(G.plaster,F,0,GF,0,dep,fl*FH,len,c,[6,6.4]);
        fbox(G.solid,F,fa*.1,GF-.15,0,dep+.2,.3,len+.05,0xf1ede6,null,false);
        fbox(G.solid,F,fa*.15,h,0,dep+.3,.35,len+.1,0xf1ede6,null,false);
        if(R()<.55)fprism(G.solid,F,0,h+.35,0,dep,2.6+R(),len,[0xa8553e,0x6b6e78,0x8c4a3a][Math.floor(R()*3)]);
        else{fbox(G.solid,F,0,h+.35,0,dep,.5,len,c,null,false);if(R()<.5)fbox(G.solid,F,0,h+.85,len*.2,1.2,.8,1.2,0xb9bcc0,null,false);}
        if(R()<.45)for(let k=1;k<fl;k++){fbox(G.solid,F,fa*(dep/2+.55),GF+k*FH-.1,0,1.1,.12,len*.4,0xe9e5de,null,false);fbox(G.solid,F,fa*(dep/2+1.05),GF+k*FH,0,.05,.9,len*.4,0x3a3d42,null,false);}
        const aw=[0xc0553a,0x2f7480,0xd9a03a,0x4c7a55,0x9b4f7a,0x24323f][Math.floor(R()*6)];
        const ax=fa*dep/2;fquad(G.solid,F,[ax,3.5,len*.42],[ax,3.5,-len*.42],[ax+fa*1.5,2.7,-len*.42],[ax+fa*1.5,2.7,len*.42],aw);
        fquad(G.solid,F,[ax+fa*1.5,2.7,len*.42],[ax+fa*1.5,2.7,-len*.42],[ax+fa*1.5,2.4,-len*.42],[ax+fa*1.5,2.4,len*.42],aw);
        if(R()<.5){fbox(G.solid,F,fa*(dep/2+.5),4.4,len*.35,.9,.08,.08,0x2c2e31,null,false);fbox(G.glow,F,fa*(dep/2+.75),3.7,len*.35,.6,.6,.08,[0xffd6a0,0xff9eb5,0xa8f0e0,0xfff0b0][Math.floor(R()*4)],null,false);}
        if(R()<.5)tree(roadX(cz)+side*(rw+SW-.9),cz,.55,1,R,0);
        for(let k=0;k<2;k++)if(R()<.55)person(roadX(cz)+side*(rw+.7+R()*(SW-1)),cz+(R()-.5)*len,roadAng(cz)+(R()<.5?0:Math.PI)+(R()-.5)*.6,R);
        if(R()<.45)person(roadX(cz)+side*R()*(rw-.6),cz+(R()-.5)*len,R()*6,R);
        if(R()<.25){const Fp=Frame(roadX(cz)+side*(rw-.6),cz,roadAng(cz));fbox(G.solid,Fp,0,0,0,1,.7,1,0x9a8f84);blobs.push([Fp.cx,1,Fp.cz,.6,.5,.6,0x5f8a50]);}
        if(side>0&&Math.abs(z-lastString)>14){lastString=z;const zz=cz,Fs=Frame(roadX(zz),zz,roadAng(zz)),span=rwAt(zz)+SW+.2;for(let t=-1;t<=1.001;t+=.1){const y=5.4-(1-t*t)*1.1;fbox(G.glow,Fs,t*span,y,0,.12,.12,.12,0xffe3a0,null,false);}}
        z-=len+(R()<.3?2.5+R()*4:.05);
      } else if(zone===2){ // Skyline: Türme mit Absätzen, Plätze, Fahnen
        if(R()<.4){ // Platz mit Bäumen
          const len=12;const cz=z-len/2;for(let k=0;k<3;k++)tree(roadX(cz)+side*(rw+SW+2+R()*6),cz+(R()-.5)*len,.8,2,R,0);
          const F=Frame(roadX(cz)+side*(rw+SW+1),cz,roadAng(cz));for(let k=-1;k<=1;k++){fbox(G.solid,F,0,0,k*2.4,.08,6,.08,0xd8dade);fquad(G.solid,F,[0,5.9,k*2.4],[0,5.9,k*2.4-1.4],[0,5,k*2.4-1.4],[0,5,k*2.4],[0xc0392b,0x2f5d8a,0xf0c43a][k+1]);}
          for(let k=0;k<3;k++)person(roadX(cz)+side*(rw+.8+R()*5),cz+(R()-.5)*len,R()*6,R);z-=len;continue;}
        const len=12+R()*10,dep=12+R()*8,base=6.5,h=24+R()*60;const cz=z-len/2,F=Frame(roadX(cz)+side*(rw+SW+3+R()*6+dep/2),cz,roadAng(cz));
        const gk=['gA','gB','gC'][Math.floor(R()*3)];
        fbox(G.shop,F,0,0,0,dep,base,len,0xdfe3e8,[8,base]);fbox(G.solid,F,fa*.3,base,0,dep+.6,.5,len+.6,0x8b8f96,null,false);
        const stone=R()<.3;if(stone)fbox(G.plaster,F,0,base+.5,0,dep,h*.5,len,0xe2dccd,[6,6.4]);else fbox(G[gk],F,0,base+.5,0,dep,h,len,0xffffff,[4,8]);
        let top=base+.5+(stone?h*.5:h);if(R()<.6){const s=.7;fbox(G[gk],F,0,top,0,dep*s,h*.35,len*s,0xffffff,[4,8]);top+=h*.35;}
        fbox(G.solid,F,0,top,0,dep*.5,2,len*.4,0x9aa0a8,null,false);if(R()<.5)fbox(G.solid,F,0,top+2,0,.2,8,.2,0xc9ccd2,null,false);
        for(let k=0;k<2;k++)if(R()<.6)person(roadX(cz)+side*(rw+.6+R()*(SW-1)),cz+(R()-.5)*len,roadAng(cz)+(R()<.5?0:Math.PI),R);
        // Hintergrund-Skyline
        if(R()<.7){const zz=cz+(R()-.5)*8,Fb=Frame(roadX(zz)+side*(40+R()*60),zz,roadAng(zz));fbox(G[['gA','gB','gC'][Math.floor(R()*3)]],Fb,0,0,0,14+R()*8,50+R()*90,14+R()*8,0xffffff,[4,8]);}
        z-=len+1+R()*3;
      } else if(zone===3){ // Streetviertel: Backstein, Feuertreppen, Graffiti, Basketball
        if(!courtDone&&side>0&&z<-(S0+SPACING*2.75)){courtDone=true;const len=30,cz=z-len/2,F=Frame(roadX(cz)+side*(rw+SW+9),cz,roadAng(cz));
          const cg=new THREE.PlaneGeometry(14,26);cg.rotateX(-Math.PI/2);const cm=new THREE.Mesh(cg,new THREE.MeshLambertMaterial({map:M.court}));cm.position.set(F.cx,.05,F.cz);cm.rotation.y=F.rot;cm.receiveShadow=true;world.add(cm);
          for(const e of [-1,1]){fbox(G.solid,F,0,0,e*12.6,.18,3.4,.18,0x2c2e31);fbox(G.solid,F,0,2.9,e*12.3,1.8,1.1,.08,0xf3f1ec,null,false);fbox(G.solid,F,0,3.0,e*11.9,.5,.05,.5,0xe0643a,null,false);}
          for(const [a,b,c2,d] of [[-8,-14,-8,14],[-8,14,8,14],[-8,-14,8,-14]]){const x0=a,z0=b,x1=c2,z1=d;const L2=Math.hypot(x1-x0,z1-z0);fquad(G.fence,F,[x0,0,z0],[x1,0,z1],[x1,3.5,z1],[x0,3.5,z0],0xffffff,[[0,0],[L2/1.2,0],[L2/1.2,3.5/1.2],[0,3.5/1.2]]);}
          for(let k=0;k<5;k++)person(F.cx+(R()-.5)*8,F.cz+(R()-.5)*18,R()*6,R);z-=len;continue;}
        const len=7+R()*5,dep=10,fl=2+Math.floor(R()*4),FH=3.1,GF=3.4,h=GF+fl*FH;const cz=z-len/2,F=Frame(roadX(cz)+side*(rw+SW+dep/2),cz,roadAng(cz));
        const c=[0xffffff,0xf0d8d0,0xe8d0c0,0xd8c8c0,0xc8c0b8,0xf8e8d8][Math.floor(R()*6)];
        const shut=R()<.5;fbox(shut?G.shutter:G.shop,F,0,0,0,dep,GF,len,shut?0xb8b4ae:0xe8e0d8,shut?[3,1.2]:[len>8?8:len,GF]);
        fbox(G.brick,F,0,GF,0,dep,fl*FH,len,c,[6,6.4]);fbox(G.solid,F,fa*.12,h,0,dep+.25,.4,len+.1,0x5a4a42,null,false);
        if(R()<.6)graffiti(F,fa*(dep/2+.02),.3,0,Math.min(len*.85,6),2.6,side,R);
        if(R()<.75){const fx=fa*(dep/2+.6);for(let k=0;k<fl;k++){const y=GF+k*FH;fbox(G.solid,F,fx,y,len*.15,1.2,.08,len*.45,0x26272a,null,false);
          fbox(G.solid,F,fx+fa*.58,y,len*.15,.04,1,len*.45,0x26272a,null,false);
          if(k<fl-1)fquad(G.solid,F,[fx-.2,y+.08,len*.15-len*.2],[fx+.2,y+.08,len*.15-len*.2],[fx+.2,y+FH,len*.15+len*.2],[fx-.2,y+FH,len*.15+len*.2],0x323336);}}
        if(R()<.5){cyl(G.solid,F.P(fa*1,0,len*.1)[0],h+.4,F.P(fa*1,0,len*.1)[2],1.1,1.1,2.4,8,0x7a5a40,false);cyl(G.solid,F.P(fa*1,0,len*.1)[0],h+2.8,F.P(fa*1,0,len*.1)[2],1.2,0,.9,8,0x5a4a40,false);
        if(R()<.6)fbox(G.solid,F,R()*2-1,h+.4,-len*.25,1.2,.8,1.4,0xa8acb0,null,false);
        if(R()<.35){const Fd=Frame(roadX(cz)+side*(rw+SW-.8),cz-len*.3,roadAng(cz));fbox(G.solid,Fd,0,0,0,1.3,1.2,2,[0x3f6b4a,0x355a7a,0x6a6a6a][Math.floor(R()*3)]);fbox(G.solid,Fd,0,1.2,0,1.35,.08,2.05,0x2c3a30,null,false);
          for(let k=0;k<3;k++)blobs.push([Fd.cx+(R()-.5)*1.5,.3,Fd.cz+1.4+R(),.4,.35,.4,0x1f2226]);}
        if(R()<.25)cyl(G.solid,roadX(cz)+side*(rw+.5),.16,cz,.12,.12,.6,6,0xc0392b);
        const grp=R()<.35?2+Math.floor(R()*2):(R()<.5?1:0);const px=roadX(cz)+side*(rw+1.4),pz=cz+(R()-.5)*len;for(let k=0;k<grp;k++)person(px+(R()-.5)*1.2,pz+(R()-.5)*1.2,R()*6,R);
        if(R()<.3)parked.push([roadX(cz)+side*(rw-1.0),cz+(R()-.5)*len*.5,roadAng(cz)+(R()<.5?0:Math.PI),['limo','kombi','klein','klein'][Math.floor(R()*4)],CAR_PAINT[Math.floor(R()*CAR_PAINT.length)]]);
        if(side<0&&Math.abs(z-lastLamp)>18){lastLamp=z;const zz=cz;const Fp=Frame(roadX(zz)+side*(rw+.35),zz,roadAng(zz));fbox(G.solid,Fp,0,0,0,.22,8,.22,0x5a4636);fbox(G.solid,Fp,0,7.4,0,1.6,.12,.12,0x5a4636,null,false);
          const Fr=Frame(roadX(zz),zz,roadAng(zz)),half=rw+.35;fbox(G.solid,Fr,half,0,0,.22,8,.22,0x5a4636);for(let t=0;t<=1.001;t+=.05){const y=7.4-Math.sin(t*Math.PI)*.9;fbox(G.solid,Fr,-half+t*2*half,y,0,.06,.03,.3,0x222222,null,false);}}}
        z-=len+(R()<.3?2.5+R()*4:.05);
      } else { // Abendplatz: warme Fenster, Cafés, Lichterketten, Brunnen
        if(R()<.35){const len=14,cz=z-len/2;const Fc=Frame(roadX(cz)+side*(rw+2.3),cz,roadAng(cz));
          for(let k=0;k<3;k++){const lz=(k-1)*4;cyl(G.solid,Fc.P(0,0,lz)[0],0,Fc.P(0,0,lz)[2],.05,.05,2.3,5,0xeeeeee,false);cyl(G.solid,Fc.P(0,0,lz)[0],2.2,Fc.P(0,0,lz)[2],1.6,0,.6,8,[0xf0ede6,0xc0553a,0x2f7480][k],false);
            cyl(G.solid,Fc.P(0,0,lz)[0],0,Fc.P(0,0,lz)[2],.5,.5,.75,8,0x5a4a3e);for(let q=0;q<2;q++)person(Fc.P(0,0,lz)[0]+(q?.8:-.8),Fc.P(0,0,lz)[2],R()*6,R);}
          z-=len;continue;}
        const len=8+R()*6,dep=10,fl=2+Math.floor(R()*3),FH=3.2,GF=3.6,h=GF+fl*FH;const cz=z-len/2,F=Frame(roadX(cz)+side*(rw+SW+2+dep/2),cz,roadAng(cz));
        const c=[0xe8d8c4,0xd8c8d8,0xc8d4dc,0xe8d0b8][Math.floor(R()*4)];
        fbox(G.shop,F,0,0,0,dep,GF,len,0xffffff,[len>8?8:len,GF]);fbox(G.lit,F,0,GF,0,dep,fl*FH,len,c,[6,6.4]);fbox(G.solid,F,fa*.15,h,0,dep+.3,.35,len+.1,0xd8d0c4,null,false);
        if(R()<.6)fprism(G.solid,F,0,h+.35,0,dep,2.6,len,0x6b5a6a);
        if(Math.abs(z-lastLamp)>9){lastLamp=z;lamp(roadX(cz)+side*(rw+.45),cz,side,true);}
        if(side>0&&Math.abs(z-lastString)>10){lastString=z;const Fs=Frame(roadX(cz),cz,roadAng(cz)),span=rwAt(cz)+SW+.2;for(let t=-1;t<=1.001;t+=.08){const y=5.6-(1-t*t)*1.2;fbox(G.glow,Fs,t*span,y,0,.13,.13,.13,0xffd88a,null,false);}}
        for(let k=0;k<2;k++)if(R()<.6)person(roadX(cz)+side*(rw+.6+R()*(SW-1)),cz+(R()-.5)*len,R()*6,R);
        z-=len+.05;
      }
      if(zone===1||zone===2){if(Math.abs(z-lastLamp)>16){lastLamp=z;lamp(roadX(z)+side*(rw+.45),z,side,false);}}
    }
  }

  // ---------- Park ----------
  const pEnd=S0+SPACING*.5;
  for(let s=SA;s<pEnd;s+=2.2)for(const side of [-1,1]){const z=-s,rw=rwAt(z);
    if(R()<.42){const off=rw+3+Math.pow(R(),1.5)*34;if(!(Math.abs(s-S0-2)<9&&off<11))tree(roadX(z)+side*off,z+(R()-.5)*2,.8+R()*.6,0,R);}
    if(R()<.08){const Fb=Frame(roadX(z)+side*(rw+.9),z,roadAng(z));fbox(G.solid,Fb,0,0,0,.6,.45,1.8,0x7a5a3e);fbox(G.solid,Fb,side*.28,.45,0,.08,.55,1.8,0x7a5a3e,null,false);if(R()<.6)person(Fb.cx,Fb.cz,Fb.rot,R);}
    if(R()<.06){const Ff=Frame(roadX(z)+side*(rw+4+R()*6),z,roadAng(z));fbox(G.solid,Ff,0,0,0,2.2,.3,3.4,0x6b5040);for(let k=0;k<10;k++)blobs.push([Ff.cx+(R()-.5)*1.8,.4,Ff.cz+(R()-.5)*3,.22,.2,.22,[0xe8556d,0xf2c14e,0xf0f0f0,0xb37ad6,0xff8a3d][Math.floor(R()*5)]]);}
    if(R()<.12)blobs.push([roadX(z)+side*(rw+1.2+R()*2),.35,z,.7,.5,.9,0x4f7a48]);
    if(s%11<2.2&&side>0)lamp(roadX(z)+side*(rw+.5),z,side,false);}
  { // Teich mit Brunnen
    const z=-(S0+18),x=roadX(z)-14;const pg=new THREE.CircleGeometry(1,40);pg.rotateX(-Math.PI/2);const pm=new THREE.Mesh(pg,(MOBILE?new THREE.MeshLambertMaterial({color:0x7ab0c4}):new THREE.MeshPhongMaterial({color:0x6fa9bf,shininess:80,specular:0x99bbcc})));pm.scale.set(9,1,6);pm.position.set(x,.06,z);world.add(pm);
    const rimg=new THREE.RingGeometry(1,1.08,40);rimg.rotateX(-Math.PI/2);const rm=new THREE.Mesh(rimg,new THREE.MeshLambertMaterial({color:0xd8d2c4}));rm.scale.set(9,1,6);rm.position.set(x,.07,z);world.add(rm);
    cyl(G.solid,x,0,z,1.4,1.4,.5,14,0xd8d2c4);cyl(G.solid,x,.5,z,.25,.2,1.4,8,0xd8d2c4);
    const wm=new THREE.Mesh(new THREE.ConeGeometry(.9,1.6,14,1,true),new THREE.MeshLambertMaterial({color:0xcfe9f2,transparent:true,opacity:.55,depthWrite:false}));wm.position.set(x,1.4,z);wm.rotation.x=Math.PI;world.add(wm);
    for(let k=0;k<4;k++)blobs.push([x-5+R()*10,.18,z-3+R()*6,.18,.14,.26,0xf3efe6]);}

  // ---------- fahrende Autos ----------
  for(let k=0;k<8;k++){const ty=k===3?'bus':['limo','kombi','klein'][k%3];const m=new THREE.Mesh(carGeometry(ty,CAR_PAINT[(k*3)%CAR_PAINT.length]),carMat());m.castShadow=true;m.userData.nc=true;world.add(m);
    movers.push({m,s:S0+SPACING*1.5+R()*SPACING,v:(k%2?-1:1)*(7+R()*4)});}
  if(parked.length){const out={p:[],n:[],c:[]};const mm=new THREE.Matrix4(),qq2=new THREE.Quaternion();
    for(const [x,z,rot,ty,cl2] of parked){const g0=carGeometry(ty,cl2);qq2.setFromAxisAngle(new THREE.Vector3(0,1,0),rot);mm.compose(new THREE.Vector3(x,0,z),qq2,new THREE.Vector3(1,1,1));
      const gg=g0.clone();gg.applyMatrix4(mm);out.p.push(...gg.attributes.position.array);out.n.push(...gg.attributes.normal.array);out.c.push(...gg.attributes.color.array);}
    const pg2=new THREE.BufferGeometry();pg2.setAttribute('position',new THREE.Float32BufferAttribute(out.p,3));pg2.setAttribute('normal',new THREE.Float32BufferAttribute(out.n,3));pg2.setAttribute('color',new THREE.Float32BufferAttribute(out.c,3));
    const pm2=new THREE.Mesh(pg2,carMat());pm2.castShadow=true;pm2.receiveShadow=true;world.add(pm2);}
  // ---------- Wolken ----------
  const cloudG=new THREE.IcosahedronGeometry(1,1);const cloudM=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x8a8a8a,fog:false,flatShading:true});
  const cl=new THREE.InstancedMesh(cloudG,cloudM,90);const m4=new THREE.Matrix4(),qq=new THREE.Quaternion();
  for(let i=0;i<18;i++){const s=SA+R()*LOOPL,z=-s,x=roadX(z)+(R()<.5?-1:1)*(80+R()*120),y=70+R()*40;for(let k=0;k<5;k++){m4.compose(new THREE.Vector3(x+(R()-.5)*30,y+(R()-.5)*6,z+(R()-.5)*14),qq,new THREE.Vector3(10+R()*10,5+R()*4,8+R()*8));cl.setMatrixAt(i*5+k,m4);}}
  world.add(cl);

  // ---------- Meshes ----------
  const lam=(map,extra)=>new THREE.MeshLambertMaterial(Object.assign({vertexColors:true,map},extra||{}));
  const add=(G1,mat,shadow=true)=>{if(!G1.p.length)return;const m=geoMesh(G1,mat);m.castShadow=shadow;m.receiveShadow=true;world.add(m);return m;};
  add(G.plaster,lam(M.plaster));add(G.lit,lam(M.plasterLit,{emissive:0xffffff,emissiveMap:M.emit,emissiveIntensity:.9}));add(G.brick,lam(M.brick));
  add(G.gA,new THREE.MeshPhongMaterial({vertexColors:true,map:M.glassA,shininess:70,specular:0x556677}));add(G.gB,new THREE.MeshPhongMaterial({vertexColors:true,map:M.glassB,shininess:70,specular:0x557766}));add(G.gC,new THREE.MeshPhongMaterial({vertexColors:true,map:M.glassC,shininess:70,specular:0x776655}));
  add(G.shop,lam(M.shop,{emissive:0x332211,emissiveMap:M.shop,emissiveIntensity:.25}));add(G.shutter,lam(M.shutter));add(G.solid,lam(null,{side:THREE.DoubleSide}));add(G.paving,lam(M.paving),false);
  add(G.glow,new THREE.MeshBasicMaterial({vertexColors:true}),false);
  add(G.graff,new THREE.MeshLambertMaterial({map:M.graff,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),false);
  add(G.fence,new THREE.MeshLambertMaterial({map:M.fence,transparent:true,alphaTest:.3,side:THREE.DoubleSide}),false);
  // Kugeln (Baumkronen, Köpfe, Büsche)
  if(blobs.length){const bg=new THREE.IcosahedronGeometry(1,1);const im=new THREE.InstancedMesh(bg,new THREE.MeshLambertMaterial({flatShading:true}),blobs.length);const c=new THREE.Color();
    blobs.forEach(([x,y,z,sx,sy,sz,cl2],i)=>{qq.setFromAxisAngle(new THREE.Vector3(0,1,0),R()*6);m4.compose(new THREE.Vector3(x,y,z),qq,new THREE.Vector3(sx,sy,sz));im.setMatrixAt(i,m4);c.set(cl2).offsetHSL(0,0,(R()-.5)*.05);im.setColorAt(i,c);});
    im.castShadow=true;im.receiveShadow=true;world.add(im);}

  // Himmel als Verlauf
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color()},hor:{value:new THREE.Color()}},
    vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 top;uniform vec3 hor;varying vec3 vP;void main(){float t=clamp(vP.y*1.6,0.,1.);gl_FragColor=vec4(mix(hor,top,pow(t,.7)),1.);}'});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(330,24,16),skyMat);sky.renderOrder=-1;sky.userData.nc=true;world.add(sky);

  cityTick=(s,dt,cam)=>{const q=zoneF(-s),t=q.t;sky.position.copy(cam.position);
    skyMat.uniforms.top.value.copy(lerpC(CITY_TOP[q.i],CITY_TOP[q.j],t));const h=lerpC(CITY_HOR[q.i],CITY_HOR[q.j],t);skyMat.uniforms.hor.value.copy(h);scene.fog.color.copy(h);scene.background=h;
    hemi.intensity=CITY_HEMI[q.i]+(CITY_HEMI[q.j]-CITY_HEMI[q.i])*t;sun.intensity=CITY_SUNI[q.i]+(CITY_SUNI[q.j]-CITY_SUNI[q.i])*t;sun.color.copy(lerpC(CITY_SUN[q.i],CITY_SUN[q.j],t));
    sun.position.set(cam.position.x-26,40,cam.position.z+14);sun.target.position.set(cam.position.x,0,cam.position.z-14);sun.target.updateMatrixWorld();
    for(const c of movers){c.s+=c.v*dt;if(c.s<S0+SPACING*1.45)c.s=S0+SPACING*2.55;if(c.s>S0+SPACING*2.55)c.s=S0+SPACING*1.45;const z=-c.s,lane=(c.v>0?1:-1)*rwAt(z)*.62;
      const a=roadAng(z);c.m.position.set(roadX(z)+Math.cos(a)*lane,0,z-Math.sin(a)*lane);c.m.rotation.y=a+(c.v>0?0:Math.PI);}
    return h;};
}
function smoothC(arr,z){const q=zoneF(z);const t=q.t<.4?0:q.t>.6?1:(q.t-.4)/.2;return lerpC(arr[q.i],arr[q.j],t).getHex();}
function stations(city){
  // Stationen: Laterne/Pfosten mit Licht in Bereichsfarbe
  SECT.forEach((s,i)=>{const z=-stationS(i)-6,side=i%2?1:-1,x=roadX(z)+side*(city?rwAt(z)+.9:3.1);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,2.4,6),new THREE.MeshLambertMaterial({color:0x3b3a36}));post.position.set(x,1.2,z);world.add(post);
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.26,16,12),new THREE.MeshBasicMaterial({color:new THREE.Color(T.acc[i])}));orb.position.set(x,2.55,z);world.add(orb);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(.6,16,12),new THREE.MeshBasicMaterial({color:new THREE.Color(T.acc[i]),transparent:true,opacity:.18,depthWrite:false}));halo.position.copy(orb.position);world.add(halo);
  });
}

// ===================== Aufbau der Szene =====================
let shadows = true;
function build() {
  scene.remove(world);
  world.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
  world = new THREE.Group(); scene.add(world);
  scene.background = new THREE.Color(T.sky); scene.fog = new THREE.Fog(T.sky, 30, 210);
  cityTick = null;
  renderer.shadowMap.enabled = shadows; sun.castShadow = shadows;
  hemi.intensity = 0.55; sun.intensity = 0.5; sun.color.set(0xfff0dc); sun.position.set(-30, 40, 10); sun.target.position.set(0, 0, 0);
  buildCity(rnd(7), L + 260); stations(true); loopCopies();
}

// ===================== Oberfläche über der Szene =====================
const hud = opt.hud;
hud.innerHTML = `<div class="w-head"><div class="k"></div><h1></h1><div class="l"></div></div>
  <div class="w-rail" data-ui></div><div class="w-cards"></div>
  <div class="w-look" data-side="-1"></div><div class="w-look" data-side="1"></div>
  <div class="w-views"><i></i><i></i><i></i></div><div class="w-tip"></div>`;
const headEl = hud.querySelector('.w-head'), hk = headEl.querySelector('.k'), ht = headEl.querySelector('h1'), hl = headEl.querySelector('.l');
const cardsEl = hud.querySelector('.w-cards'), tipEl = hud.querySelector('.w-tip');
const lookL = hud.querySelector('.w-look[data-side="-1"]'), lookR = hud.querySelector('.w-look[data-side="1"]');
const vbox = hud.querySelector('.w-views'), vdots = [...vbox.children];
const rail = hud.querySelector('.w-rail');
const rb = SECT.map((sec, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span>${sec.title}</span><i></i>`; b.setAttribute('aria-label', sec.title);
  b.addEventListener('pointerup', (e) => { e.stopPropagation(); if (!paused) goTo(i); });
  rail.appendChild(b); return b;
});
lookL.addEventListener('pointerup', (e) => { e.stopPropagation(); setView(view - 1); }); lookR.addEventListener('pointerup', (e) => { e.stopPropagation(); setView(view + 1); });
lookL.dataset.ui = ''; lookR.dataset.ui = '';

// Abstände zum Rand (Notch, Home-Balken)
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
let ins = { t: 0, r: 0, b: 0, l: 0 };
function readInsets() { const c = getComputedStyle(probe); ins = { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; }
readInsets();

// ===================== Karten =====================
const VIEW = 55 * Math.PI / 180;
const D = 5.6;            // Abstand der Karten zur Kamera, wenn man an der Station steht (Maßstab 1)
const GAP = 12, STAG = 26, MORE_H = 40;
const ITEMS = SECT.map(() => new Map());
const ORDER = SECT.map(() => ({ '-1': [], 0: [], 1: [] }));
const EMPTY = SECT.map(() => ({}));
const BASEV = SECT.map((sec) => sec.views || [0]);
const VIEWS = BASEV.map((v) => v.slice());
const FREE = SECT.map((sec) => sec.free || []);
const FREEBY = SECT.map(() => ({ '-1': [], 0: [], 1: [] }));
const MOREAT = SECT.map(() => null);
let colW = 170;
let view = 0, curSt = opt.start || 0, paused = false;

const refCam = new THREE.PerspectiveCamera(58, W / H, 0.1, 700);
const _r = new THREE.Vector3();
// Bildschirmpunkt -> Platz neben dem Weg (Winkel a, Höhe y, Abstand r), bezogen auf die Blickrichtung an der Station.
function anchorOf(px, py, v) {
  const yw = v * VIEW, lift = Math.min(1, Math.abs(yw) / VIEW) * 0.55;
  refCam.position.set(0, 2.3, 0);
  refCam.lookAt(Math.sin(yw) * 12, 1.3 + lift * 2.2, -Math.cos(yw) * 12);
  refCam.updateMatrixWorld(); refCam.updateProjectionMatrix();
  _r.set(px / W * 2 - 1, -(py / H * 2 - 1), 0.5).unproject(refCam).sub(refCam.position).normalize();
  const dG = -_r.z, dR = _r.x;
  const a = Math.atan2(dR, dG), r = D * Math.hypot(dG, dR), y = 2.3 + _r.y * D;
  return isFinite(a) && isFinite(r) && isFinite(y) ? { a, r, y } : { a: v * VIEW, r: D, y: 2 };
}

function region() {
  const top = headEl.offsetTop + headEl.offsetHeight + 16;
  const bottom = H - ins.b - 64;
  const left = Math.max(12, ins.l + 12), right = W - Math.max(34, ins.r + 30);
  return { top, bottom, left, right };
}
function measure(it) { it.w = it.el.offsetWidth || colW; it.h = it.el.offsetHeight || 56; }

function mkEl(cls, html) {
  const el = document.createElement('div');
  el.className = 'wc ' + (cls || ''); el.innerHTML = html;
  el.style.visibility = 'hidden'; el.style.opacity = '0';
  cardsEl.appendChild(el); return el;
}
function mkItem(si, key, v, html, cls) {
  const R = rnd(Math.abs(hash(key)) + 3);
  const it = { si, key, v, html, cls: cls || '', el: mkEl(cls, html), a: v * VIEW, y: 2, r: D, va: 0, vy: 0, vr: 0, ta: v * VIEW, ty: 2, tr: D,
    rot: (R() - 0.5) * 2.4, ph: R() * 6.28, sp: 0.7 + R() * 0.6, fade: 0, fadeTo: 1, snap: true, slot: 0, X: 0, Y: 0, SC: 1, RT: 0, vis: false };
  measure(it); ITEMS[si].set(key, it); return it;
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
function dropItem(it) { it.gone = true; it.fadeTo = 0; }

// Einträge einer Station setzen. list: [{key, v, html, cls}] in der gewünschten Reihenfolge.
function setItems(si, list, o = {}) {
  const seen = new Set();
  const ord = { '-1': [], 0: [], 1: [] };
  for (const x of list) {
    seen.add(x.key);
    let it = ITEMS[si].get(x.key);
    if (it && it.gone) { it.el.remove(); ITEMS[si].delete(x.key); it = null; }
    if (!it) {
      it = mkItem(si, x.key, x.v, x.html, x.cls);
      if (!o.initial) {
        it.snap = true; it.pop = true;
        const from = o.fly && o.fly[x.key];
        if (from) it.el._fly = { t0: performance.now(), dur: 820, x: from.left + from.width / 2, y: from.top + from.height / 2, sc: Math.max(0.5, Math.min(1.4, from.width / Math.max(1, it.w))), arc: 60 };
      }
    } else {
      if (it.html !== x.html) { it.el.innerHTML = x.html; it.html = x.html; measure(it); }
      if (it.cls !== (x.cls || '')) { it.el.className = 'wc ' + (x.cls || '') + (it.el.classList.contains('lift') ? ' lift' : ''); it.cls = x.cls || ''; measure(it); }
      it.v = it.free && it.pos ? it.v : x.v; it.fadeTo = 1;
    }
    it.free = !!x.free; it.allowed = x.views || null;
    if (x.free) { if (x.pos && (!it.pos || it.pos.v !== x.pos.v || it.pos.x !== x.pos.x || it.pos.y !== x.pos.y) && !(drag && drag.it === it)) it.pos = { ...x.pos }; else if (!x.pos && !it.placed) it.pos = null; }
    if (!x.free) (ord[x.v] || ord[0]).push(x.key);
  }
  for (const [k, it] of ITEMS[si]) if (!seen.has(k) && !k.startsWith('__')) { if (drag && drag.it === it) endDrag(true); dropItem(it); }
  ORDER[si] = ord;
  if (o.empty) EMPTY[si] = o.empty;
  if (o.views) BASEV[si] = o.views;
  relayout(si);
  if (si === curSt && !VIEWS[si].includes(view)) setView(0);
  if (si === curSt) updHead(true);
}

// Zwei Spalten, versetzt; nichts ragt aus dem Bild, nichts überlappt. Was nicht passt, steckt hinter „+ N weitere“.
function pack(keys, si, reg) {
  const col = [reg.left + colW / 2, reg.right - colW / 2];
  const cy = [reg.top, reg.top + STAG];
  const pos = {}; let placed = 0;
  for (const k of keys) {
    const it = ITEMS[si].get(k); const h = it ? it.h : 56;
    const c = cy[0] <= cy[1] ? 0 : 1;
    if (cy[c] + h > reg.bottom) break;
    pos[k] = { x: col[c], y: cy[c] + h / 2 }; cy[c] += h + GAP; placed++;
  }
  return { pos, placed, cy, col };
}
function layoutView(si, v, keys, reg) {
  let L = pack(keys, si, reg);
  let more = 0;
  if (L.placed < keys.length) {
    let n = L.placed;
    for (;;) {
      L = pack(keys.slice(0, n), si, reg);
      const c = L.cy[0] <= L.cy[1] ? 0 : 1;
      if (L.cy[c] + MORE_H <= reg.bottom || n === 0) { more = keys.length - n; L.more = { x: L.col[c], y: L.cy[c] + MORE_H / 2 }; break; }
      n--;
    }
  }
  L.moreN = more;
  return L;
}
function relayout(si) {
  const reg = region();
  if (FREE[si].length) placeFree(si, reg);
  const vs = new Set(BASEV[si]);
  for (const v of [-1, 0, 1]) if ((ORDER[si][v] || []).length || FREEBY[si][v].length) vs.add(v);
  VIEWS[si] = [-1, 0, 1].filter((v) => vs.has(v));
  for (const v of [-1, 0, 1]) {
    if (FREE[si].includes(v)) { freeView(si, v, reg); continue; }
    const keys = ORDER[si][v] || [];
    const L = layoutView(si, v, keys, reg);
    keys.forEach((k, idx) => {
      const it = ITEMS[si].get(k); if (!it) return;
      const p = L.pos[k];
      it.slot = idx;
      if (!p) { it.hidden = true; it.fadeTo = 0; return; }
      it.hidden = false; if (!it.gone) it.fadeTo = 1;
      aim(it, p.x, p.y, v);
    });
    it_more(si, v, L);
    it_empty(si, v, reg, keys.length === 0 && VIEWS[si].includes(v));
    if (si === curSt && v === view) lastPlaced = L.placed;
  }
}
function aim(it, x, y, v) {
  it.sx = x; it.sy = y;
  const an = anchorOf(x, y, v);
  it.ta = an.a; it.ty = an.y; it.tr = an.r;
  if (it.snap) { it.a = it.ta; it.y = it.ty; it.r = it.tr; it.va = it.vy = it.vr = 0; it.snap = false; }
}

// ---- Freie Plätze: jede Karte hat ihren eigenen Ort (Seite + x/y), neue bekommen einen zufälligen freien Platz ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const span = (reg, w, h) => ({ x0: reg.left + w / 2, x1: reg.right - w / 2, y0: reg.top + h / 2, y1: reg.bottom - h / 2 });
function centerOf(it, reg) { const b = span(reg, it.w, it.h); return { x: b.x0 + it.pos.x * Math.max(0, b.x1 - b.x0), y: b.y0 + it.pos.y * Math.max(0, b.y1 - b.y0) }; }
function normOf(x, y, it, reg) { const b = span(reg, it.w, it.h); return { x: +clamp((x - b.x0) / Math.max(1, b.x1 - b.x0), 0, 1).toFixed(4), y: +clamp((y - b.y0) / Math.max(1, b.y1 - b.y0), 0, 1).toFixed(4) }; }
const hit2 = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP;
function solve(nodes, reg, iters = 60) {
  const inb = (n, ax, v) => (ax === 'x' ? v >= reg.left + n.w / 2 - 0.5 && v <= reg.right - n.w / 2 + 0.5 : v >= reg.top + n.h / 2 - 0.5 && v <= reg.bottom - n.h / 2 + 0.5);
  for (let k = 0; k < iters; k++) {
    let any = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; if (a.fixed && b.fixed) continue;
      const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      any = true;
      const sx = Math.sign(a.x - b.x) || (i % 2 ? 1 : -1), sy = Math.sign(a.y - b.y) || 1;
      const opts = ox < oy ? [['x', ox * sx], ['y', oy * sy]] : [['y', oy * sy], ['x', ox * sx]];
      let done = false;
      for (const [ax, d] of opts) {
        const ma = a.fixed ? 0 : b.fixed ? d : d / 2, mb = b.fixed ? 0 : a.fixed ? d : d / 2;
        if ((ma && !inb(a, ax, a[ax] + ma)) || (mb && !inb(b, ax, b[ax] - mb))) continue;
        a[ax] += ma; b[ax] -= mb; done = true; break;
      }
      if (!done) { const [ax, d] = opts[0]; if (!a.fixed) a[ax] += b.fixed ? d : d / 2; if (!b.fixed) b[ax] -= a.fixed ? d : d / 2; }
    }
    for (const n of nodes) if (!n.fixed) { n.x = clamp(n.x, reg.left + n.w / 2, reg.right - n.w / 2); n.y = clamp(n.y, reg.top + n.h / 2, reg.bottom - n.h / 2); }
    if (!any) break;
  }
  return nodes;
}
function findSpot(it, nodes, reg) {
  const R = rnd(Math.abs(hash(it.key)) + 11);
  const b = span(reg, it.w, it.h);
  let best = null;
  for (let t = 0; t < 80; t++) {
    const c = { x: b.x0 + R() * Math.max(0, b.x1 - b.x0), y: b.y0 + R() * Math.max(0, b.y1 - b.y0), w: it.w, h: it.h };
    if (!nodes.some((n) => hit2(n, c))) return c;
  }
  return best;
}
function placeFree(si, reg) {
  const cap = SECT[si].cap || 6, free = FREE[si];
  const by = { '-1': [], 0: [], 1: [] }, fresh = [], wait = [];
  for (const it of ITEMS[si].values()) {
    if (!it.free || it.gone) continue;
    if (it.pos && free.includes(it.pos.v) && (!it.allowed || it.allowed.includes(it.pos.v))) { it.v = it.pos.v; by[it.v].push(it); it.hidden = false; }
    else wait.push(it);
  }
  for (const it of wait) {
    const prefs = (it.allowed || [0, 1, -1]).filter((v) => free.includes(v));
    let spot = null, sv = null;
    for (const v of prefs) {
      if (by[v].length >= cap) continue;
      const nodes = by[v].map((n) => ({ ...centerOf(n, reg), w: n.w, h: n.h }));
      spot = findSpot(it, nodes, reg); if (spot) { sv = v; break; }
    }
    if (!spot) { it.hidden = true; it.fadeTo = 0; it.overflow = prefs[prefs.length - 1]; continue; }
    it.v = sv; it.pos = { v: sv, ...normOf(spot.x, spot.y, it, reg) }; it.placed = true; it.hidden = false; it.overflow = null;
    by[sv].push(it); fresh.push({ key: it.key, pos: it.pos });
  }
  FREEBY[si] = by;
  const over = wait.filter((it) => it.hidden);
  MOREAT[si] = over.length ? { v: over[0].overflow, n: over.length } : null;
  if (fresh.length && opt.onPlace) setTimeout(() => opt.onPlace(si, fresh), 0);
}
function freeView(si, v, reg) {
  const list = FREEBY[si][v];
  const nodes = list.map((it) => ({ it, ...centerOf(it, reg), w: it.w, h: it.h }));
  const m = MOREAT[si] && MOREAT[si].v === v ? MOREAT[si] : null;
  if (m) nodes.push({ more: true, x: (reg.left + reg.right) / 2, y: reg.bottom - MORE_H / 2, w: 120, h: MORE_H, fixed: true });
  const d = drag && drag.si === si && drag.v === v ? drag : null;
  if (d) { const n = nodes.find((x) => x.it === d.it); if (n) { n.x = d.px; n.y = d.py; n.fixed = true; } }
  solve(nodes, reg);
  nodes.forEach((n, idx) => { if (!n.it) return; n.it.slot = idx; if (!n.it.gone) n.it.fadeTo = 1; if (d && n.it === d.it) return; aim(n.it, n.x, n.y, v); n.it.solved = { x: n.x, y: n.y }; });
  ORDER[si][v] = list.map((it) => it.key);
  it_more(si, v, m ? { moreN: m.n, more: { x: (reg.left + reg.right) / 2, y: reg.bottom - MORE_H / 2 } } : { moreN: 0 });
  it_empty(si, v, reg, list.length === 0 && VIEWS[si].includes(v));
  if (si === curSt && v === view) lastPlaced = list.length;
}
let lastPlaced = 0;
function it_more(si, v, L) {
  const key = '__more:' + v; let it = ITEMS[si].get(key);
  if (!L.moreN) { if (it && !it.gone) dropItem(it); return; }
  const html = `<b>+ ${L.moreN}</b> weitere`;
  if (!it || it.gone) { if (it) { it.el.remove(); ITEMS[si].delete(key); } it = mkItem(si, key, v, html, 'more'); it.rot = 0; }
  else if (it.html !== html) { it.el.innerHTML = html; it.html = html; }
  it.fadeTo = 1; it.slot = 99; it.v = v;
  aim(it, L.more.x, L.more.y, v);
}
function it_empty(si, v, reg, show) {
  const key = '__empty:' + v; let it = ITEMS[si].get(key); const txt = EMPTY[si][v];
  if (!show || !txt) { if (it && !it.gone) dropItem(it); return; }
  if (!it || it.gone) { if (it) { it.el.remove(); ITEMS[si].delete(key); } it = mkItem(si, key, v, txt, 'empty'); it.rot = 0; }
  else if (it.html !== txt) { it.el.innerHTML = txt; it.html = txt; measure(it); }
  it.fadeTo = 1;
  const x = (reg.left + reg.right) / 2, y = reg.top + (reg.bottom - reg.top) * 0.36;
  const an = anchorOf(x, y, v); it.ta = an.a; it.ty = an.y; it.tr = an.r; it.sx = x; it.sy = y;
  if (it.snap) { it.a = it.ta; it.y = it.ty; it.r = it.tr; it.snap = false; }
}
function relayoutAll() {
  readInsets();
  colW = Math.round(Math.min(196, Math.max(120, (W - Math.max(12, ins.l + 12) - Math.max(34, ins.r + 30) - GAP) / 2)));
  hud.style.setProperty('--cw', colW + 'px');
  ITEMS.forEach((m) => m.forEach(measure));
  SECT.forEach((_, si) => relayout(si));
}

// ===================== Bewegung =====================
let s = stationS(curSt) - 26, target = stationS(curSt);
const wrapD = (x) => ((((x + LOOPL / 2) % LOOPL) + LOOPL) % LOOPL - LOOPL / 2);
const near = (i) => { let t = stationS(i); while (t - s > LOOPL / 2) t -= LOOPL; while (s - t > LOOPL / 2) t += LOOPL; return t; };
let yaw = 0, yawV = 0, yawDrag = false, dragBase = 0, dragX = 0, lastYaw = 0, lastYT = 0, lastSwitch = 0;
const hasView = (si, v) => VIEWS[si].includes(v);
function setView(v) {
  v = Math.max(-1, Math.min(1, v));
  if (!hasView(curSt, v)) return;
  view = v; yawDrag = false; lastSwitch = performance.now();
}
const canGo = (d) => { const v = view + d; return Math.abs(v) <= 1 && hasView(curSt, v); };
function goTo(i) { if (view !== 0) setView(0); target = near(i); }
const atStation = () => Math.abs(wrapD(s - stationS(curSt))) < 10;
const settled = () => atStation() && Math.abs(yaw - view * VIEW) < 0.12 && Math.abs(target - s) < 3;

// ---- Treffer: eigene Erkennung statt Browser-Klick (Karten bewegen sich, das iPhone trifft sonst daneben) ----
function hitTest(x, y) {
  let best = null;
  for (const it of ITEMS[curSt].values()) {
    if (!it.vis || it.gone || it.hidden || it.cls === 'empty') continue;
    const dx = x - it.X, dy = y - it.Y, c = Math.cos(-it.RT * Math.PI / 180), sn = Math.sin(-it.RT * Math.PI / 180);
    const lx = (dx * c - dy * sn) / it.SC, ly = (dx * sn + dy * c) / it.SC;
    if (Math.abs(lx) <= it.w / 2 + 6 && Math.abs(ly) <= it.h / 2 + 6) {
      if (!best || it.Z > best.it.Z) best = { it, lx: lx + it.w / 2, ly: ly + it.h / 2 };
    }
  }
  return best;
}

let down = false, lock = null, tx = 0, ty = 0, ts = 0, vel = 0, lt = 0, ly = 0, moved = false, lpT = null, pressIt = null;
let drag = null;
const skip = (e) => paused || (e.target.closest && e.target.closest('[data-ui]'));
addEventListener('pointerdown', (e) => {
  if (skip(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
  down = true; moved = false; lock = null; tx = e.clientX; ty = e.clientY; ts = target; vel = 0; lt = performance.now(); ly = e.clientY;
  const h = settled() ? hitTest(tx, ty) : null;
  if (h && !h.it.key.startsWith('__')) {
    pressIt = h.it; pressIt.press = 1;
    if (h.it.v === view && SECT[curSt].drag !== false) lpT = setTimeout(() => { lpT = null; startDrag(h.it); }, 330);
  }
});
addEventListener('pointermove', (e) => {
  if (!down) return;
  if (drag) { moveDrag(e.clientX, e.clientY); return; }
  const dy = ty - e.clientY, dx = e.clientX - tx;
  if (Math.hypot(dx, dy) > 8) { cancelPress(); }
  if (!lock && Math.hypot(dx, dy) > 6) {
    moved = true; lock = (Math.abs(dx) > Math.abs(dy) && Math.abs(wrapD(s - stationS(curSt))) < 16) ? 'x' : 'y';
    if (lock === 'x') { yawDrag = true; dragBase = yaw; dragX = e.clientX; lastYaw = yaw; lastYT = performance.now(); }
    else { ty = e.clientY; ts = target; if (view !== 0) setView(0); }
  }
  if (lock === 'x') {
    const want = dragBase - (e.clientX - dragX) / W * 1.05 * VIEW, off = want - view * VIEW, lim = canGo(Math.sign(off) || 1) ? VIEW * 1.15 : VIEW * 0.12;
    const y2 = view * VIEW + lim * Math.tanh(off / lim); const nw = performance.now(), dtt = Math.max(1, nw - lastYT);
    yawV = Math.max(-6, Math.min(6, yawV * 0.5 + ((y2 - lastYaw) / dtt * 1000) * 0.5)); lastYaw = y2; lastYT = nw; yaw = y2; return;
  }
  if (lock !== 'y') return;
  target = ts + dy * 0.28; const now = performance.now(); vel = (ly - e.clientY) / Math.max(1, now - lt); ly = e.clientY; lt = now;
});
function cancelPress() { if (lpT) { clearTimeout(lpT); lpT = null; } if (pressIt) { pressIt.press = 0; pressIt = null; } }
function release() {
  if (!down) return; down = false;
  if (drag) { endDrag(); return; }
  const tapped = pressIt; cancelPress();
  if (lock === 'x') {
    lock = null; yawDrag = false; if (performance.now() - lastYT > 80) yawV *= 0.2;
    const proj = yaw - view * VIEW + yawV * 0.12; const dir = Math.abs(proj) > VIEW * 0.2 ? Math.sign(proj) : 0;
    if (dir && canGo(dir)) view += dir; return;
  }
  if (lock !== 'y' && !moved) { tap(tx, ty, tapped); return; }
  lock = null;
  const f = (target - S0) / SPACING + vel * 0.9; target = stationS(Math.round(f));
}
addEventListener('pointerup', release); addEventListener('pointercancel', () => { if (drag) endDrag(); down = false; cancelPress(); lock = null; yawDrag = false; });

function tap(x, y) {
  if (!settled()) return;
  const h = hitTest(x, y);
  if (h) {
    const it = h.it;
    if (it.key.startsWith('__more')) { opt.onMore && opt.onMore(curSt, it.v); return; }
    opt.onCardTap && opt.onCardTap({ si: curSt, v: it.v, key: it.key, lx: h.lx, ly: h.ly, w: it.w, h: it.h, el: it.el, x, y });
    return;
  }
  opt.onEmptyTap && opt.onEmptyTap({ si: curSt, v: view, x, y });
}

// ---- Halten und Ziehen: Karte folgt dem Finger, die anderen weichen weich aus ----
function startDrag(it) {
  if (!down || moved || !settled()) return;
  if (pressIt) pressIt.press = 0; pressIt = null;
  drag = { it, si: curSt, v: it.v, offX: tx - it.X, offY: ty - it.Y, x: tx, y: ty, px: it.X, py: it.Y, vx: 0, lt: performance.now(), sc: it.SC || 1, scv: 0, tilt: 0, tv: 0, moved: false };
  it.el.classList.add('lift'); lock = 'drag';
  try { navigator.vibrate && navigator.vibrate(8); } catch { /* egal */ }
  opt.onDragStart && opt.onDragStart();
}
function dragBounds(it) {
  const reg = region(), w = it.w * 1.06, h = it.h * 1.06;
  return { x0: reg.left + w / 2 - 4, x1: reg.right - w / 2 + 4, y0: reg.top + h / 2 - 6, y1: reg.bottom - h / 2 + 6 };
}
const rubber = (v, a, b) => (v < a ? a - Math.sqrt(a - v) * 2.2 : v > b ? b + Math.sqrt(v - b) * 2.2 : v);
function moveDrag(x, y) {
  const d = drag, now = performance.now(), dt = Math.max(8, now - d.lt);
  d.vx = d.vx * 0.6 + ((x - d.x) / dt * 16) * 0.4; d.x = x; d.y = y; d.lt = now; d.moved = true;
  const b = dragBounds(d.it);
  d.px = rubber(x - d.offX, b.x0, b.x1); d.py = rubber(y - d.offY, b.y0, b.y1);
  if (FREE[d.si].includes(d.v)) relayout(d.si); else reorder();
}
function reorder() {
  const d = drag, si = d.si, v = d.v, key = d.it.key;
  const cur = ORDER[si][v]; const others = cur.filter((k) => k !== key);
  const reg = region(); const maxK = Math.max(0, Math.min(others.length, lastPlaced - 1));
  let best = null, curD = Infinity;
  for (let k = 0; k <= maxK; k++) {
    const arr = [...others.slice(0, k), key, ...others.slice(k)];
    const p = pack(arr, si, reg).pos[key]; if (!p) continue;
    const dist = Math.hypot(p.x - d.px, p.y - d.py);
    if (arr.join('|') === cur.join('|')) curD = dist;
    if (!best || dist < best.d) best = { d: dist, arr };
  }
  if (best && best.arr.join('|') !== cur.join('|') && best.d < curD - 14) { ORDER[si][v] = best.arr; relayout(si); }
}
function endDrag(silent) {
  const d = drag; if (!d) return; drag = null; lock = null;
  const it = d.it;
  const an = anchorOf(d.px, d.py, d.v);
  it.a = an.a; it.y = an.y; it.r = an.r; it.va = it.vy = it.vr = 0;
  it.dropSc = d.sc; it.dropT = d.tilt;
  if (FREE[d.si].includes(d.v)) {
    // Abgelegt: die Karte bleibt hier, ausgewichene Karten behalten ihren neuen Platz.
    const reg = region(), b = dragBounds(it);
    const px = clamp(d.px, b.x0 + 4, b.x1 - 4), py = clamp(d.py, b.y0 + 6, b.y1 - 6);
    const moved = [];
    it.pos = { v: d.v, ...normOf(px, py, it, reg) }; moved.push({ key: it.key, pos: it.pos });
    for (const o of FREEBY[d.si][d.v]) {
      if (o === it || !o.solved) continue;
      const np = { v: d.v, ...normOf(o.solved.x, o.solved.y, o, reg) };
      if (!o.pos || Math.abs(np.x - o.pos.x) > 0.002 || Math.abs(np.y - o.pos.y) > 0.002) { o.pos = np; moved.push({ key: o.key, pos: np }); }
    }
    relayout(d.si);
    setTimeout(() => it.el.classList.remove('lift'), 260);
    if (!silent && d.moved && opt.onPlace) opt.onPlace(d.si, moved);
    return;
  }
  relayout(d.si);
  setTimeout(() => it.el.classList.remove('lift'), 260);
  if (!silent && d.moved && opt.onReorder) opt.onReorder(d.si, d.v, ORDER[d.si][d.v].slice());
}

addEventListener('wheel', (e) => {
  if (paused || (e.target.closest && e.target.closest('[data-ui]'))) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { if (Math.abs(e.deltaX) > 12 && performance.now() - lastSwitch > 500) setView(view + Math.sign(e.deltaX)); return; }
  if (view !== 0) setView(0); target += e.deltaY * 0.12;
  clearTimeout(wheelT); wheelT = setTimeout(() => { target = stationS(Math.round((target - S0) / SPACING)); }, 140);
}, { passive: true });
let wheelT;
addEventListener('keydown', (e) => {
  if (paused || (e.target.closest && e.target.closest('input,textarea,[data-ui]'))) return;
  if (e.key === 'ArrowLeft') { setView(view - 1); return; }
  if (e.key === 'ArrowRight') { setView(view + 1); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  if (view !== 0) setView(0); const i = Math.round((target - S0) / SPACING);
  target = stationS(e.key === 'ArrowDown' ? i + 1 : i - 1);
});
function fitSize() {
  const nw = innerWidth, nh = innerHeight; if (nw < 50 || nh < 50) return;
  if (nw === W && nh === H && renderer.domElement.width > 0) return;
  W = nw; H = nh; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); refCam.aspect = W / H;
  relayoutAll();
}
addEventListener('resize', fitSize); addEventListener('orientationchange', () => setTimeout(fitSize, 300));

// ===================== Kopfzeile =====================
let headKey = '';
function updHead(force) {
  const k = curSt + ':' + view;
  if (!force && k === headKey) return; headKey = k;
  const h = opt.head(curSt, view) || {};
  hk.textContent = h.k || ''; ht.textContent = h.t || SECT[curSt].title; hl.textContent = h.l || '';
  tipEl.textContent = (opt.tip && opt.tip(curSt, view)) || '';
  rb.forEach((b, i) => b.classList.toggle('on', i === curSt));
}

// ===================== Bild für Bild =====================
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const _v = new THREE.Vector3();
let tm0 = performance.now(), frameN = 0, lastSt = -1, probeT = 0, blk = 0;
const KS = 150, CS = 2 * Math.sqrt(KS) * 0.74; // Feder: weich mit einem Hauch Nachschwingen
function spring(it, dt) {
  const n = 3, h = dt / n;
  for (let i = 0; i < n; i++) {
    it.va += (-KS * (it.a - it.ta) - CS * it.va) * h; it.a += it.va * h;
    it.vy += (-KS * (it.y - it.ty) - CS * it.vy) * h; it.y += it.vy * h;
    it.vr += (-KS * (it.r - it.tr) - CS * it.vr) * h; it.r += it.vr * h;
  }
  if (!isFinite(it.a + it.y + it.r)) { it.a = it.ta; it.y = it.ty; it.r = it.tr; it.va = it.vy = it.vr = 0; }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - tm0) / 1000); tm0 = now; frameN++;
  s += (target - s) * (1 - Math.pow(0.0009, dt));
  if (s >= SA + LOOPL) { s -= LOOPL; target -= LOOPL; ts -= LOOPL; }
  if (s < SA) { s += LOOPL; target += LOOPL; ts += LOOPL; }
  if (!isFinite(s) || !isFinite(target)) { s = target = stationS(curSt); }
  if (!isFinite(yaw) || !isFinite(yawV)) { yaw = view * VIEW; yawV = 0; }
  const z = -s, x = roadX(z), ahead = roadX(z - 10);
  const f = (((s - S0) / SPACING) % N + N) % N; const ai = Math.round(f) % N;
  if (ai !== curSt) { curSt = ai; if (view !== 0) view = 0; opt.onStation && opt.onStation(ai); }
  const dist = wrapD(s - stationS(ai));
  if (view !== 0 && Math.abs(dist) > 16) setView(0);
  const bob = Math.sin(s * 0.55) * 0.04 * Math.min(1, Math.abs(dist) / 12);
  if (!yawDrag) {
    const goal = view * VIEW, om = 8.5, ze = 0.88, n = 4, h = dt / n;
    for (let k = 0; k < n; k++) { const acc = -2 * ze * om * yawV - om * om * (yaw - goal); yawV += acc * h; yaw += yawV * h; }
    if (Math.abs(yaw - goal) < 1e-4 && Math.abs(yawV) < 1e-3) { yaw = goal; yawV = 0; }
  }
  const fx = ahead - x, fz = -12, fl = Math.hypot(fx, fz), Fx = fx / fl, Fz = fz / fl, Rx = -Fz, Rz = Fx;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), lift = Math.min(1, Math.abs(yaw) / VIEW) * 0.55;
  camera.position.set(x, 2.3 + bob, z + 2); camera.lookAt(x + (Fx * cy + Rx * sy) * 12, 1.3 + lift * 2.2, z + 2 + (Fz * cy + Rz * sy) * 12);

  if (cityTick) {
    gateCopies(s); const c = cityTick(s, dt, camera);
    if (!isFinite(hemi.intensity) || !isFinite(sun.intensity)) { hemi.intensity = 0.6; sun.intensity = 0.6; }
    if (frameN % 10 === 0) document.body.style.background = '#' + c.getHexString();
  }
  document.documentElement.style.setProperty('--acc', ACC[ai]);
  updHead(ai !== lastSt); lastSt = ai;
  const hv = 1 - Math.min(1, Math.abs(dist) / 38);
  headEl.style.opacity = ease(hv).toFixed(3); headEl.style.transform = `translateY(${(dist * 0.6).toFixed(1)}px)`;
  tipEl.style.opacity = (Math.abs(dist) < 8 && !paused ? 1 : 0);

  // Karten
  camera.updateMatrixWorld(); const t0 = now * 0.001; const cnt = { '-1': 0, 0: 0, 1: 0 };
  ITEMS.forEach((map, si) => {
    const d = wrapD(s - stationS(si));
    if (d < -50 || d > 30) { map.forEach((it) => { if (it.vis) { it.vis = false; it.el.style.visibility = 'hidden'; } if (it.gone) { it.el.remove(); map.delete(it.key); } }); return; }
    const S = s - d, az = -S, ax = roadX(az), aah = roadX(az - 10);
    const gx = aah - ax, gz = -12, gl = Math.hypot(gx, gz), GX = gx / gl, GZ = gz / gl, RX = -GZ, RZ = GX, ox = ax, oz = az + 2;
    map.forEach((it) => {
      const isDrag = drag && drag.it === it;
      if (!isDrag) spring(it, dt);
      const fs = it.fadeTo > it.fade ? 4 : 5; it.fade += Math.max(-dt * fs, Math.min(dt * fs, it.fadeTo - it.fade));
      if (it.gone && it.fade <= 0.001) { it.el.remove(); map.delete(it.key); return; }
      const st = -46 + Math.min(it.slot, 18) * 2, en = -6;
      const vin = ease(Math.min(1, Math.max(0, (d - st) / (en - st)))), vout = ease(Math.min(1, Math.max(0, (26 - d) / 18)));
      const vv = Math.min(vin, vout);
      const op = vv * it.fade;
      if (si === curSt && vv > 0.5 && !it.gone && !it.hidden && !it.key.startsWith('__')) cnt[it.v]++;
      if (op <= 0.002 && !it.el._fly && !isDrag) { if (it.vis) { it.vis = false; it.el.style.visibility = 'hidden'; } return; }
      const side = (it.ta - it.v * VIEW) > 0 ? 1 : -1;
      const a = it.a + side * (1 - vv) * 0.8 + Math.sin(t0 * it.sp * 0.7 + it.ph) * 0.004;
      const r = it.r + (1 - vv) * 3, y = it.y + Math.sin(t0 * it.sp + it.ph) * 0.012;
      _v.set(ox + (GX * Math.cos(a) + RX * Math.sin(a)) * r, y, oz + (GZ * Math.cos(a) + RZ * Math.sin(a)) * r);
      const dd = _v.distanceTo(camera.position); _v.project(camera);
      if (!it.el._fly && !isDrag && (_v.z > 1 || Math.abs(_v.x) > 1.5 || Math.abs(_v.y) > 1.4)) { if (it.vis) { it.vis = false; it.el.style.visibility = 'hidden'; } return; }
      let sc = Math.max(0.5, Math.min(1.25, D / dd));
      // Antippen: kurz eindrücken. Neu: mit kleinem Sprung erscheinen.
      it.pr = (it.pr || 0) + ((it.press ? 1 : 0) - (it.pr || 0)) * Math.min(1, dt * 18);
      const popS = it.pop ? 0.82 + 0.18 * Math.min(1.06, ease(it.fade) * 1.06) : 1; if (it.pop && it.fade >= 1) it.pop = false;
      let X = (_v.x + 1) / 2 * W, Y = (1 - _v.y) / 2 * H;
      let SC = sc * popS * (1 - it.pr * 0.04), RT = it.rot + Math.sin(t0 * it.sp * 0.8 + it.ph) * 0.5, OP = op, Z = 1000 - Math.round(dd * 10);
      if (it.dropSc) { const k = Math.min(1, dt * 10); it.dropSc += (1 - it.dropSc) * k; it.dropT += (0 - it.dropT) * k; SC *= it.dropSc; RT += it.dropT; Z = 2400; if (Math.abs(it.dropSc - 1) < 0.002 && Math.abs(it.dropT) < 0.05) it.dropSc = 0; }
      if (isDrag) {
        const dg = drag; const tsc = 1.06;
        dg.scv += (-260 * (dg.sc - tsc) - 22 * dg.scv) * dt; dg.sc += dg.scv * dt;
        const tt = Math.max(-7, Math.min(7, dg.vx * 0.9)); dg.tv += (-200 * (dg.tilt - tt) - 20 * dg.tv) * dt; dg.tilt += dg.tv * dt;
        dg.vx *= Math.pow(0.02, dt);
        X = dg.px; Y = dg.py; SC = dg.sc; RT = dg.tilt; OP = 1; Z = 3000;
      }
      if (it.el._fly) {
        const fl2 = it.el._fly, tt = Math.min(1, (now - fl2.t0) / fl2.dur), e2 = easeIO(tt);
        if (_v.z > 1) X = W / 2 + (it.v || 1) * W * 1.4; X = Math.max(-W * 0.9, Math.min(W * 1.9, X));
        const arc = Math.sin(tt * Math.PI) * fl2.arc; X = fl2.x + (X - fl2.x) * e2; Y = fl2.y + (Y - fl2.y) * e2 - arc;
        SC = fl2.sc + (SC - fl2.sc) * e2; RT *= e2; OP = 1; Z = 2600;
        if (tt >= 1) { it.el._fly = null; it.el.classList.add('fresh'); setTimeout(() => it.el.classList.remove('fresh'), 1800); }
      }
      it.X = X; it.Y = Y; it.SC = SC; it.RT = RT; it.Z = Z;
      if (!it.vis) { it.vis = true; it.el.style.visibility = 'visible'; }
      it.el.style.transform = `translate3d(${(X - it.w / 2).toFixed(1)}px,${(Y - it.h / 2).toFixed(1)}px,0) scale(${SC.toFixed(3)}) rotate(${RT.toFixed(2)}deg)`;
      it.el.style.opacity = OP.toFixed(3); it.el.style.zIndex = String(Z);
    });
  });
  const nl = view > -1 && hasView(curSt, view - 1) ? cnt[view - 1] : 0, nr = view < 1 && hasView(curSt, view + 1) ? cnt[view + 1] : 0;
  const showL = view > -1 && hasView(curSt, view - 1), showR = view < 1 && hasView(curSt, view + 1);
  lookL.textContent = '‹ ' + nl; lookR.textContent = nr + ' ›';
  lookL.style.opacity = showL && atStation() ? 1 : 0; lookR.style.opacity = showR && atStation() ? 1 : 0;
  lookL.style.pointerEvents = showL ? 'auto' : 'none'; lookR.style.pointerEvents = showR ? 'auto' : 'none';
  vdots.forEach((d2, i) => { d2.classList.toggle('on', i - 1 === view); d2.style.display = hasView(curSt, i - 1) ? '' : 'none'; });
  vbox.style.opacity = VIEWS[curSt].length > 1 && atStation() ? 1 : 0;

  // Rendern: bei offenem Blatt nur selten (spart Akku)
  if (!ctxLost && (!paused || frameN % 8 === 0)) renderer.render(scene, camera);
  // Bild schwarz geworden? (alte iPhones) Schrittweise reparieren.
  if (!ctxLost && now - probeT > 2000) {
    probeT = now; const gl = renderer.getContext(); const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const rd = (px, py) => { const p = new Uint8Array(4); gl.readPixels(Math.floor(bw * px), Math.floor(bh * py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p[0] + p[1] + p[2]; };
    if (rd(0.5, 0.08) < 14 && rd(0.25, 0.4) < 14) {
      blk++; console.warn('Weg: Bild schwarz, Stufe', blk);
      if (blk === 2) { sun.shadow.map && sun.shadow.map.dispose(); sun.shadow.map = null; renderer.shadowMap.needsUpdate = true; }
      if (blk === 3) { shadows = false; renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
      if (blk === 4) build();
    } else blk = 0;
  }
}

build();
relayoutAll();
requestAnimationFrame(frame);
opt.onStation && opt.onStation(curSt);

return {
  setItems,
  relayoutAll,
  refreshHead: () => updHead(true),
  goTo,
  setView,
  get station() { return curSt; },
  get view() { return view; },
  get atStation() { return atStation(); },
  pause(p) { paused = !!p; if (p) { cancelPress(); if (drag) endDrag(); down = false; lock = null; yawDrag = false; } },
  cardRect(si, key) { const it = ITEMS[si].get(key); if (!it || !it.vis) return null; const w = it.w * it.SC, h = it.h * it.SC; return { left: it.X - w / 2, top: it.Y - h / 2, width: w, height: h }; },
  cardEl(si, key) { const it = ITEMS[si].get(key); return it ? it.el : null; },
  remeasure(si, key) { const it = ITEMS[si].get(key); if (it) { measure(it); relayout(si); } },
};
}
