const TF={crypto:{'15м':'15m','1ч':'1h','4ч':'4h','1д':'1d'},moex:{'10м':10,'1ч':60,'1д':24,'1н':7}};
const DAYS={10:4,60:30,24:480,7:2500};
const $=id=>document.getElementById(id);
const S={src:'crypto',sym:'BTCUSDT',tf:'1h',draw:false,data:[],lines:[]};
const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

const chart=LightweightCharts.createChart($('chart'),{
  layout:{background:{color:'#10151c'},textColor:'#7d8a9a'},
  grid:{vertLines:{color:'#18202b'},horzLines:{color:'#18202b'}},
  rightPriceScale:{borderColor:'#243040'},
  timeScale:{borderColor:'#243040',timeVisible:true,secondsVisible:false},
  crosshair:{mode:0},autoSize:true});
let main=null;
const vol=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'v'});
chart.priceScale('v').applyOptions({scaleMargins:{top:.82,bottom:0}});
const sma=chart.addLineSeries({color:'#e0b04a',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
const ema=chart.addLineSeries({color:'#6aa5e8',lineWidth:1,priceLineVisible:false,lastValueVisible:false});

function mkMain(){
  if(main)chart.removeSeries(main);
  main=$('style').value==='c'
    ?chart.addCandlestickSeries({upColor:'#2fb89a',downColor:'#e5604d',borderVisible:false,wickUpColor:'#2fb89a',wickDownColor:'#e5604d'})
    :chart.addLineSeries({color:'#e0b04a',lineWidth:2});
  paint();drawLines();
}
const val=(b)=>$('style').value==='c'?b:{time:b.time,value:b.close};
function calcSMA(d,n){const o=[];let s=0;d.forEach((b,i)=>{s+=b.close;if(i>=n)s-=d[i-n].close;if(i>=n-1)o.push({time:b.time,value:s/n})});return o}
function calcEMA(d,n){const o=[],k=2/(n+1);let e=null;d.forEach((b,i)=>{e=e===null?b.close:b.close*k+e*(1-k);if(i>=n-1)o.push({time:b.time,value:e})});return o}
function paint(){
  main.setData(S.data.map(val));
  vol.setData(S.data.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#2fb89a55':'#e5604d55'})));
  sma.setData($('sma').checked?calcSMA(S.data,20):[]);
  ema.setData($('ema').checked?calcEMA(S.data,50):[]);
}

async function fetchBars(short){
  if(S.src==='crypto'){
    const q=`/api/v3/klines?symbol=${S.sym}&interval=${S.tf}&limit=500`;
    let r;
    try{r=await fetch('https://data-api.binance.vision'+q)}catch(e){r=await fetch('https://api.binance.com'+q)}
    if(!r.ok)throw new Error('Binance: тикер '+S.sym+' не найден');
    return (await r.json()).map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
  }
  const days=short?(+S.tf===7?14:3):DAYS[S.tf];
  const from=new Date(Date.now()-days*864e5).toISOString().slice(0,10);
  const u=`https://iss.moex.com/iss/engines/stock/markets/shares/securities/${S.sym}/candles.json?interval=${S.tf}&from=${from}`;
  const r=await fetch(u);
  if(!r.ok)throw new Error('MOEX недоступен');
  const j=await r.json(),c=j.candles.columns,rows=j.candles.data;
  if(!rows.length)throw new Error('MOEX: нет данных по '+S.sym);
  const ix=n=>c.indexOf(n);
  return rows.map(x=>({time:Date.parse(x[ix('begin')].replace(' ','T')+'Z')/1000,open:x[ix('open')],high:x[ix('high')],low:x[ix('low')],close:x[ix('close')],volume:x[ix('volume')]}));
}
function err(m){const e=$('err');e.textContent=m;e.style.display=m?'block':'none'}
let seq=0;
async function load(first){
  const my=++seq;
  try{
    const d=await fetchBars();
    if(my!==seq)return;
    err('');S.data=d;paint();
    if(first){chart.timeScale().fitContent();live()}
    legend(d[d.length-1],d[d.length-2]);
  }catch(e){if(first)err(e.message||'Ошибка загрузки (проверь интернет/VPN)')}
}

/* таймер до закрытия свечи — справа, под ценой */
const IV={crypto:{'15m':900,'1h':3600,'4h':14400,'1d':86400},moex:{10:600,60:3600,24:86400,7:604800}};
const p2=n=>String(n).padStart(2,'0');
const fmtT=s=>{const d=new Date(s*1000);return p2(d.getUTCDate())+'.'+p2(d.getUTCMonth()+1)+' '+p2(d.getUTCHours())+':'+p2(d.getUTCMinutes())};
function tickCd(){
  const e=$('cdTag'),b=S.data[S.data.length-1];
  if(!b||!main||(S.src==='moex'&&+S.tf>=24)){e.style.display='none';return}
  const iv=IV[S.src][S.tf],real=S.src==='crypto'?b.time:b.time-10800;
  const r=real+iv-Math.floor(Date.now()/1000);
  const y=main.priceToCoordinate(b.close);
  if(r<=0||r>iv||y==null||y<0||y>$('chart').clientHeight-60){e.style.display='none';return}
  const h=Math.floor(r/3600),m=Math.floor(r%3600/60),s=r%60;
  e.innerHTML=(h?h+':'+p2(m):m)+':'+p2(s)+'<br><span class="dim">до '+fmtT(b.time+iv).slice(6)+'</span>';
  e.style.width=chart.priceScale('right').width()+'px';
  e.style.top=(y+11)+'px';
  e.style.display='block';
}
setInterval(tickCd,250);

function legend(b,p){
  if(!b)return;
  const ref=p?p.close:b.open,ch=b.close-ref,pc=ch/ref*100,col=ch>=0?'var(--up)':'var(--down)';
  const f=n=>n>=100?n.toFixed(2):n.toPrecision(5).replace(/\.?0+$/,'');
  $('legend').innerHTML=`<b>${S.sym}</b> <span style="color:var(--dim)">${S.tf}</span><br>
  О ${f(b.open)} &nbsp;В ${f(b.high)} &nbsp;Н ${f(b.low)} &nbsp;З <span style="color:${col}">${f(b.close)} (${ch>=0?'+':''}${pc.toFixed(2)}%)</span>`;
}
chart.subscribeCrosshairMove(p=>{
  if(!p.time||!S.data.length)return;
  const i=S.data.findIndex(b=>b.time===p.time);
  if(i>=0)legend(S.data[i],S.data[i-1]);
});


/* реальное время */
let ws=null,wsTry=0,poll=null,liveId=0;
function setStatus(t,on){const e=$('status');e.textContent='● '+t;e.style.color=on?'var(--up)':'var(--dim)'}
function applyBar(b){
  const L=S.data[S.data.length-1];
  if(L&&b.time<L.time)return;
  if(L&&b.time===L.time)S.data[S.data.length-1]=b;else S.data.push(b);
  main.update(val(b));
  vol.update({time:b.time,value:b.volume,color:b.close>=b.open?'#2fb89a55':'#e5604d55'});
  if($('sma').checked){const a=calcSMA(S.data,20);if(a.length)sma.update(a[a.length-1])}
  if($('ema').checked){const a=calcEMA(S.data,50);if(a.length)ema.update(a[a.length-1])}
  legend(S.data[S.data.length-1],S.data[S.data.length-2]);
}
function live(){
  const id=++liveId;
  if(mq.matches&&document.body.classList.contains('m-list'))return;
  if(ws){ws.onclose=null;ws.close();ws=null}
  clearInterval(poll);
  if(S.src==='crypto')openWs(id);
  else{setStatus('обновление каждые 5 с',true);poll=setInterval(()=>pollMoex(id),5000)}
}
function openWs(id){
  const hosts=['wss://stream.binance.com:9443','wss://data-stream.binance.vision'];
  setStatus('подключение…',false);
  ws=new WebSocket(`${hosts[wsTry%2]}/ws/${S.sym.toLowerCase()}@kline_${S.tf}`);
  ws.onopen=()=>{const re=wsTry>0;wsTry=0;setStatus('live',true);if(re)load(false)};
  ws.onmessage=m=>{
    if(id!==liveId)return;
    const k=JSON.parse(m.data).k;if(!k)return;
    applyBar({time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v});
  };
  ws.onclose=()=>{
    if(id!==liveId)return;
    wsTry++;setStatus('переподключение…',false);
    setTimeout(()=>{if(id===liveId)openWs(id)},Math.min(1000*wsTry,5000));
  };
}
async function pollMoex(id){
  if(document.hidden||id!==liveId)return;
  try{
    const d=await fetchBars(true);
    if(id!==liveId)return;
    d.slice(-3).forEach(applyBar);setStatus('обновление каждые 5 с',true);
  }catch(e){setStatus('нет связи',false)}
}

/* уровни */
const lkey=()=>'lines:'+S.src+':'+S.sym;
function drawLines(){
  S.lines.forEach(l=>main.removePriceLine(l));S.lines=[];
  store.get(lkey(),[]).forEach(p=>S.lines.push(main.createPriceLine({price:p,color:'#e0b04a',lineWidth:1,lineStyle:2,axisLabelVisible:true})));
}
chart.subscribeClick(p=>{
  if(!S.draw||!p.point)return;
  const price=main.coordinateToPrice(p.point.y);
  if(price==null)return;
  const a=store.get(lkey(),[]);a.push(price);store.set(lkey(),a);drawLines();
  S.draw=false;$('draw').classList.remove('on');
});
$('draw').onclick=()=>{S.draw=!S.draw;$('draw').classList.toggle('on',S.draw)};
$('clr').onclick=()=>{store.set(lkey(),[]);drawLines()};

/* интерфейс */
function buildTf(){
  const t=TF[S.src];S.tf=Object.values(t).includes(S.tf)||String(Object.values(t)).includes(S.tf)?S.tf:Object.values(t)[1];
  $('tfs').innerHTML='';
  for(const [k,v] of Object.entries(t)){
    const b=document.createElement('button');b.textContent=k;b.classList.toggle('on',String(v)===String(S.tf));
    b.onclick=()=>{S.tf=v;buildTf();load(true)};$('tfs').append(b);
  }
}
function setSrc(s){
  S.src=s;$('srcB').classList.toggle('on',s==='crypto');$('srcM').classList.toggle('on',s==='moex');
  S.tf=Object.values(TF[s])[1];
}
$('srcB').onclick=()=>{setSrc('crypto');$('sym').value='BTCUSDT';open_()};
$('srcM').onclick=()=>{setSrc('moex');$('sym').value='SBER';open_()};
function open_(){if(mq.matches)view('chart');S.sym=$('sym').value.trim().toUpperCase()||S.sym;buildTf();drawLines();load(true);save()}
$('go').onclick=open_;
$('sym').addEventListener('keydown',e=>{if(e.key==='Enter')open_()});
$('style').onchange=mkMain;
$('sma').onchange=$('ema').onchange=paint;

/* список */
let wl=store.get('wl',[{src:'crypto',sym:'BTCUSDT'},{src:'crypto',sym:'ETHUSDT'},{src:'moex',sym:'SBER'},{src:'moex',sym:'GAZP'}]);
const mq=matchMedia('(max-width:700px)');
function view(v){document.body.classList.toggle('m-chart',v==='chart');document.body.classList.toggle('m-list',v!=='chart');
  if(v==='chart'){try{history.pushState({c:1},'')}catch(e){}}}
function goList(){
  liveId++;if(ws){ws.onclose=null;ws.close();ws=null}clearInterval(poll);
  view('list');loadPrices();
}
$('back').onclick=()=>{if(history.state&&history.state.c)history.back();else goList()};
addEventListener('popstate',()=>{if(mq.matches&&document.body.classList.contains('m-chart'))goList()});

const px={};
const fmtP=n=>n==null?'':n>=100?n.toFixed(2):String(+n.toPrecision(5));
function renderWl(){
  $('wl').innerHTML='';
  wl.forEach((w,i)=>{
    const d=document.createElement('div');d.className='wl';
    const b=document.createElement('button');b.textContent=w.sym;
    b.onclick=()=>{setSrc(w.src);$('sym').value=w.sym;open_()};
    const p=px[w.src+':'+w.sym],pr=document.createElement('span');pr.className='pr';
    if(p&&p.last!=null){
      const c=p.pct>=0?'var(--up)':'var(--down)';
      pr.innerHTML=fmtP(p.last)+'<br><span style="color:'+c+'">'+(p.pct>=0?'+':'')+(+p.pct||0).toFixed(2)+'%</span>';
    }
    const x=document.createElement('button');x.className='x';x.textContent='×';x.setAttribute('aria-label','Убрать');
    x.onclick=()=>{wl.splice(i,1);store.set('wl',wl);renderWl()};
    d.append(b,pr,x);$('wl').append(d);
  });
}
async function loadPrices(){
  const cr=wl.filter(w=>w.src==='crypto').map(w=>w.sym),mo=wl.filter(w=>w.src==='moex').map(w=>w.sym);
  const put=t=>{px['crypto:'+t.symbol]={last:+t.lastPrice,pct:+t.priceChangePercent}};
  if(cr.length){
    const base=async q=>{try{return await fetch('https://data-api.binance.vision'+q)}catch(e){return await fetch('https://api.binance.com'+q)}};
    try{
      const r=await base('/api/v3/ticker/24hr?symbols='+encodeURIComponent(JSON.stringify(cr)));
      if(r.ok)(await r.json()).forEach(put);
      else await Promise.all(cr.map(async s=>{try{const r1=await base('/api/v3/ticker/24hr?symbol='+s);if(r1.ok)put(await r1.json())}catch(e){}}));
    }catch(e){}
  }
  if(mo.length){
    try{
      const r=await fetch('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE&securities='+mo.join(','));
      if(r.ok)(await r.json()).marketdata.data.forEach(x=>{px['moex:'+x[0]]={last:x[1],pct:x[2]}});
    }catch(e){}
  }
  renderWl();
}
$('add').onclick=()=>{
  const s=($('sym').value.trim().toUpperCase())||S.sym;
  if(!wl.some(w=>w.sym===s&&w.src===S.src)){wl.push({src:S.src,sym:s});store.set('wl',wl);renderWl();loadPrices()}
};
function save(){store.set('last',{src:S.src,sym:S.sym,tf:S.tf})}

const last=store.get('last',null);
if(last){setSrc(last.src);S.sym=last.sym;S.tf=last.tf;$('sym').value=last.sym}
buildTf();renderWl();mkMain();
if(mq.matches)view('list');else load(true);
loadPrices();
setInterval(()=>{if(!document.hidden&&(!mq.matches||document.body.classList.contains('m-list')))loadPrices()},10000);