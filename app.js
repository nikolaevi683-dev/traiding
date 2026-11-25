import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { DrawingManager } from 'lightweight-charts-drawing';

const TF_BASE={
  crypto:{'1с':'1s','5с':'5s','15с':'15s','30с':'30s','1м':'1m','5м':'5m','15м':'15m','30м':'30m','1ч':'1h','2ч':'2h','4ч':'4h','8ч':'8h','1д':'1d','1н':'1w','1мес':'1M'},
  moex:{'1м':1,'10м':10,'1ч':60,'1д':24,'1н':7,'1мес':31,'1кв':4},
  futures:{'1м':1,'10м':10,'1ч':60,'1д':24,'1н':7,'1мес':31,'1кв':4}
};
const TF_DEFAULT={crypto:'1h',moex:60,futures:60};
const DAYS={1:2,5:3,10:7,60:30,240:120,24:480,7:2500,31:2500,4:2500};
const $=id=>document.getElementById(id);
const S={src:'crypto',sym:'BTCUSDT',tf:'1h',data:[],tfCustom:{}};
const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ============ ОФОРМЛЕНИЕ ============ */
const DEFAULTS={
  bgType:'gradient',bgAngle:135,appbg:'#0e141c',appbg2:'#1a2637',
  panel:'#161d27',utext:'#d6dde6',dimtext:'#7d8a9a',border:'#243040',acc:'#e0b04a',
  up:'#2fb89a',down:'#e5604d',chartBg:'#10151c',chartGrid:'#18202b',
  chartText:'#7d8a9a',chartBorder:'#243040',line:'#e0b04a',sma:'#e0b04a',ema:'#6aa5e8'
};
const BUILTIN={
  dark:{...DEFAULTS},
  light:{bgType:'gradient',bgAngle:135,appbg:'#eef2f9',appbg2:'#dbe4f2',panel:'#ffffff',utext:'#1c2530',dimtext:'#6b7889',border:'#dbe2ea',acc:'#c8922a',up:'#1a9e7f',down:'#d64b3a',chartBg:'#ffffff',chartGrid:'#eef2f6',chartText:'#6b7889',chartBorder:'#dbe2ea',line:'#c8922a',sma:'#c8922a',ema:'#3b7fd4'},
  night:{bgType:'mesh',bgAngle:135,appbg:'#080d1a',appbg2:'#1a2b55',panel:'#111a2e',utext:'#c8d4e6',dimtext:'#6a7a96',border:'#1f2b45',acc:'#ffc94a',up:'#33d1a8',down:'#ff6b5a',chartBg:'#0a1020',chartGrid:'#141e33',chartText:'#6a7a96',chartBorder:'#1f2b45',line:'#ffc94a',sma:'#ffc94a',ema:'#5fa8ff'},
  contrast:{bgType:'solid',bgAngle:0,appbg:'#000000',appbg2:'#000000',panel:'#0a0a0a',utext:'#ffffff',dimtext:'#999999',border:'#333333',acc:'#ffd400',up:'#00ff9d',down:'#ff3b30',chartBg:'#000000',chartGrid:'#1a1a1a',chartText:'#999999',chartBorder:'#333333',line:'#ffd400',sma:'#ffd400',ema:'#00b0ff'}
};
const BUILTIN_LABEL={dark:'Тёмная',light:'Светлая',night:'Ночная',contrast:'Контраст'};

let C={...DEFAULTS,...store.get('colors',{})};
let customs=store.get('presets',{});

/* ============ ГРАФИК ============ */
const chart=createChart($('chart'),{
  layout:{background:{color:C.chartBg},textColor:C.chartText},
  grid:{vertLines:{color:C.chartGrid},horzLines:{color:C.chartGrid}},
  rightPriceScale:{borderColor:C.chartBorder, scaleMargins:{top:0.1,bottom:0.3}},
  timeScale:{borderColor:C.chartBorder,timeVisible:true,secondsVisible:false},
  crosshair:{mode:0},autoSize:true});

let main=null,vol=null,drawingManager=null;
let magnetEnabled=false;

function createSeries(){
  if(drawingManager){try{drawingManager.destroy()}catch(e){}drawingManager=null}
  if(main){try{chart.removeSeries(main)}catch(e){}main=null}
  if(vol){try{chart.removeSeries(vol)}catch(e){}vol=null}
  indicators.forEach(ind=>{
    ind.series.forEach(s=>{try{chart.removeSeries(s)}catch(e){}});
    if(ind.pane){try{chart.removePane(ind.pane)}catch(e){}}
  });
  indicators=[];
  main=$('style').value==='c'
    ?chart.addSeries(CandlestickSeries,{upColor:C.up,downColor:C.down,borderVisible:false,wickUpColor:C.up,wickDownColor:C.down,priceScaleId:'right'})
    :chart.addSeries(LineSeries,{color:C.line,lineWidth:2,priceScaleId:'right'});
  vol=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'v'});
  chart.priceScale('v').applyOptions({scaleMargins:{top:.8,bottom:0}});
  drawingManager=new DrawingManager(chart,main,{magnet:magnetEnabled?'weak':'off'});
  loadDrawings();
  activeIndicators.forEach(key=>{try{addIndicatorById(key,true)}catch(e){}});
}

const val=b=>$('style').value==='c'?b:{time:b.time,value:b.close};
function calcSMA(d,n){const o=[];let s=0;d.forEach((b,i)=>{s+=b.close;if(i>=n)s-=d[i-n].close;if(i>=n-1)o.push({time:b.time,value:s/n})});return o}
function calcEMA(d,n){const o=[],k=2/(n+1);let e=null;d.forEach((b,i)=>{e=e===null?b.close:b.close*k+e*(1-k);if(i>=n-1)o.push({time:b.time,value:e})});return o}
function calcRSI(d,n=14){
  if(d.length<n+1)return[];
  const o=[];let g=0,l=0;
  for(let i=1;i<=n;i++){const diff=d[i].close-d[i-1].close;if(diff>0)g+=diff;else l-=diff}
  g/=n;l/=n;
  const rsi=()=>{const rs=l===0?100:g/l;return 100-100/(1+rs)};
  o.push({time:d[n].time,value:rsi()});
  for(let i=n+1;i<d.length;i++){
    const diff=d[i].close-d[i-1].close;
    g=(g*(n-1)+(diff>0?diff:0))/n;
    l=(l*(n-1)+(diff<0?-diff:0))/n;
    o.push({time:d[i].time,value:rsi()});
  }
  return o;
}
function calcBB(d,n=20,mult=2){
  const upper=[],middle=[],lower=[];
  for(let i=n-1;i<d.length;i++){
    let s=0;for(let j=i-n+1;j<=i;j++)s+=d[j].close;
    const mean=s/n;
    let variance=0;for(let j=i-n+1;j<=i;j++)variance+=(d[j].close-mean)**2;
    const sd=Math.sqrt(variance/n);
    upper.push({time:d[i].time,value:mean+mult*sd});
    middle.push({time:d[i].time,value:mean});
    lower.push({time:d[i].time,value:mean-mult*sd});
  }
  return {upper,middle,lower};
}
function calcMACD(d,fast=12,slow=26,signal=9){
  const emaF=calcEMA(d,fast),emaS=calcEMA(d,slow);
  const map={};emaF.forEach(p=>map[p.time]=p.value);
  const macd=[];emaS.forEach(p=>{if(map[p.time]!=null)macd.push({time:p.time,value:map[p.time]-p.value})});
  if(macd.length<signal)return{macd:[],signal:[],hist:[]};
  const k=2/(signal+1);let e=null;const sig=[];
  macd.forEach((p,i)=>{e=e===null?p.value:p.value*k+e*(1-k);if(i>=signal-1)sig.push({time:p.time,value:e})});
  const hist=[];const sigMap={};sig.forEach(p=>sigMap[p.time]=p.value);
  macd.forEach(p=>{if(sigMap[p.time]!=null)hist.push({time:p.time,value:p.value-sigMap[p.time]})});
  return {macd,signal:sig,hist};
}

function paint(){
  if(!main)return;
  main.setData(S.data.map(val));
  vol.setData(S.data.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?C.up+'55':C.down+'55'})));
  indicators.forEach(ind=>updateIndicator(ind));
}

/* ============ ИНДИКАТОРЫ ============ */
const INDICATORS_CATALOG=[
  {id:'sma20',name:'SMA 20',cat:'Trend'},
  {id:'ema50',name:'EMA 50',cat:'Trend'},
  {id:'sma200',name:'SMA 200',cat:'Trend'},
  {id:'bb',name:'Bollinger Bands',cat:'Volatility'},
  {id:'rsi',name:'RSI (14)',cat:'Momentum'},
  {id:'macd',name:'MACD (12,26,9)',cat:'Momentum'},
  {id:'volume',name:'Volume',cat:'Volume'}
];
let indicators=[];
let activeIndicators=store.get('activeIndicators',['sma20','ema50']);
let favoriteInds=store.get('favoriteInds',[]);

function addIndicatorById(id,silent){
  const exist=indicators.find(i=>i.id===id);
  if(exist)return;
  const ind={id,series:[]};
  if(id==='sma20'){
    ind.series.push(chart.addSeries(LineSeries,{color:'#e0b04a',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'SMA 20',priceScaleId:'right'}));
  }else if(id==='ema50'){
    ind.series.push(chart.addSeries(LineSeries,{color:'#6aa5e8',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'EMA 50',priceScaleId:'right'}));
  }else if(id==='sma200'){
    ind.series.push(chart.addSeries(LineSeries,{color:'#c47de0',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'SMA 200',priceScaleId:'right'}));
  }else if(id==='bb'){
    const c='#6aa5e8';
    ind.series.push(chart.addSeries(LineSeries,{color:c,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'BB upper',priceScaleId:'right'}));
    ind.series.push(chart.addSeries(LineSeries,{color:c+'88',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,title:'BB mid',priceScaleId:'right'}));
    ind.series.push(chart.addSeries(LineSeries,{color:c,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'BB lower',priceScaleId:'right'}));
  }else if(id==='rsi'){
    const pane=chart.addPane();
    ind.pane=pane;
    ind.series.push(chart.addSeries(LineSeries,{color:'#c47de0',lineWidth:2,priceLineVisible:false,lastValueVisible:false,title:'RSI',priceScaleId:'right'},pane));
    ind.series.push(chart.addSeries(LineSeries,{color:'#e5604d',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,title:'RSI 70',priceScaleId:'right'},pane));
    ind.series.push(chart.addSeries(LineSeries,{color:'#2fb89a',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,title:'RSI 30',priceScaleId:'right'},pane));
  }else if(id==='macd'){
    const pane=chart.addPane();
    ind.pane=pane;
    ind.series.push(chart.addSeries(HistogramSeries,{color:'#6aa5e8',priceLineVisible:false,lastValueVisible:false,title:'MACD hist',priceScaleId:'right'},pane));
    ind.series.push(chart.addSeries(LineSeries,{color:'#e0b04a',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'MACD',priceScaleId:'right'},pane));
    ind.series.push(chart.addSeries(LineSeries,{color:'#e5604d',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'Signal',priceScaleId:'right'},pane));
  }else if(id==='volume'){return;}
  indicators.push(ind);
  updateIndicator(ind);
  if(!silent){activeIndicators=[...new Set([...activeIndicators,id])];store.set('activeIndicators',activeIndicators);}
  renderIndicatorList();
}

function removeIndicator(id){
  const ind=indicators.find(i=>i.id===id);
  if(!ind)return;
  ind.series.forEach(s=>{try{chart.removeSeries(s)}catch(e){}});
  if(ind.pane){try{chart.removePane(ind.pane)}catch(e){}}
  indicators=indicators.filter(i=>i.id!==id);
  activeIndicators=activeIndicators.filter(i=>i!==id);
  store.set('activeIndicators',activeIndicators);
  renderIndicatorList();
}

function updateIndicator(ind){
  const d=S.data;
  if(!d.length)return;
  if(ind.id==='sma20'){ind.series[0].setData(calcSMA(d,20));}
  else if(ind.id==='ema50'){ind.series[0].setData(calcEMA(d,50));}
  else if(ind.id==='sma200'){ind.series[0].setData(calcSMA(d,200));}
  else if(ind.id==='bb'){
    const {upper,middle,lower}=calcBB(d);
    ind.series[0].setData(upper);ind.series[1].setData(middle);ind.series[2].setData(lower);
  }else if(ind.id==='rsi'){
    const rsi=calcRSI(d);
    ind.series[0].setData(rsi);
    ind.series[1].setData(rsi.map(p=>({time:p.time,value:70})));
    ind.series[2].setData(rsi.map(p=>({time:p.time,value:30})));
  }else if(ind.id==='macd'){
    const {macd,signal,hist}=calcMACD(d);
    ind.series[0].setData(hist.map(p=>({time:p.time,value:p.value,color:p.value>=0?C.up+'88':C.down+'88'})));
    ind.series[1].setData(macd);
    ind.series[2].setData(signal);
  }
}

/* ============ ПАНЕЛЬ ИНДИКАТОРОВ ============ */
function renderIndicatorList(filter=''){
  const list=$('indList');list.innerHTML='';
  const f=filter.toLowerCase();
  const items=INDICATORS_CATALOG.filter(i=>!f||i.name.toLowerCase().includes(f)||i.cat.toLowerCase().includes(f));
  if(!items.length){list.innerHTML='<div class="sb-empty">Ничего не найдено</div>';return}
  items.sort((a,b)=>{
    const fa=favoriteInds.includes(a.id),fb=favoriteInds.includes(b.id);
    if(fa&&!fb)return -1;if(!fa&&fb)return 1;return a.name.localeCompare(b.name);
  });
  items.forEach(it=>{
    const row=document.createElement('div');
    row.className='ind-item'+(indicators.find(i=>i.id===it.id)?' active':'');
    const star=document.createElement('span');
    star.className='ind-star'+(favoriteInds.includes(it.id)?' on':'');
    star.textContent=favoriteInds.includes(it.id)?'★':'☆';
    star.onclick=e=>{e.stopPropagation();toggleFav(it.id)};
    const name=document.createElement('span');
    name.className='ind-name';name.textContent=it.name;
    const cat=document.createElement('span');cat.className='ind-cat';cat.textContent=it.cat;
    row.append(star,name,cat);
    row.onclick=()=>{if(indicators.find(i=>i.id===it.id))removeIndicator(it.id);else addIndicatorById(it.id);};
    list.append(row);
  });
}
function toggleFav(id){
  if(favoriteInds.includes(id))favoriteInds=favoriteInds.filter(i=>i!==id);
  else favoriteInds.push(id);
  store.set('favoriteInds',favoriteInds);
  renderIndicatorList($('indSearch').value);
}
function openIndicators(){$('indicatorsModal').classList.remove('hidden');$('indSearch').value='';renderIndicatorList();setTimeout(()=>$('indSearch').focus(),0)}
function closeIndicators(){$('indicatorsModal').classList.add('hidden')}
$('indBtn').onclick=openIndicators;
$('indClose').onclick=closeIndicators;
$('indicatorsModal').onclick=e=>{if(e.target===$('indicatorsModal'))closeIndicators()};
$('indSearch').addEventListener('input',e=>renderIndicatorList(e.target.value));

/* ============ ФОН ПРИЛОЖЕНИЯ ============ */
function composeAppBg(){
  const {bgType,appbg,appbg2,bgAngle}=C;
  const a=bgAngle||135;let fill;
  if(bgType==='gradient')fill=`linear-gradient(${a}deg, ${appbg} 0%, ${appbg2} 100%)`;
  else if(bgType==='mesh')fill=`radial-gradient(ellipse at 15% 15%, ${appbg2}66 0%, transparent 55%),radial-gradient(ellipse at 85% 20%, ${appbg2}77 0%, transparent 50%),radial-gradient(ellipse at 70% 85%, ${appbg}cc 0%, transparent 65%),radial-gradient(ellipse at 20% 80%, ${appbg2}55 0%, transparent 60%),${appbg}`;
  else if(bgType==='dots')fill=`radial-gradient(${appbg2}88 1px, transparent 1.5px) 0 0/22px 22px, ${appbg}`;
  else if(bgType==='grid')fill=`linear-gradient(${appbg2}44 1px, transparent 1px) 0 0/34px 34px,linear-gradient(90deg, ${appbg2}44 1px, transparent 1px) 0 0/34px 34px,${appbg}`;
  else fill=appbg;
  document.documentElement.style.setProperty('--app-bg-fill',fill);
  document.documentElement.style.setProperty('--app-bg',appbg);
}

function applyColors(){
  store.set('colors',C);
  composeAppBg();
  const r=document.documentElement.style;
  r.setProperty('--panel',C.panel);r.setProperty('--text',C.utext);r.setProperty('--dim',C.dimtext);
  r.setProperty('--line',C.border);r.setProperty('--acc',C.acc);r.setProperty('--up',C.up);
  r.setProperty('--down',C.down);r.setProperty('--chart-bg',C.chartBg);
  chart.applyOptions({
    layout:{background:{color:C.chartBg},textColor:C.chartText},
    grid:{vertLines:{color:C.chartGrid},horzLines:{color:C.chartGrid}},
    rightPriceScale:{borderColor:C.chartBorder},
    timeScale:{borderColor:C.chartBorder}
  });
  if(main){
    if($('style').value==='c')main.applyOptions({upColor:C.up,downColor:C.down,wickUpColor:C.up,wickDownColor:C.down});
    else main.applyOptions({color:C.line});
  }
  if(S.data.length)paint();
  updatePresetHighlight();
}

function syncInputs(){
  document.querySelectorAll('#themePanel input[type=color]').forEach(inp=>{inp.value=C[inp.dataset.k]||'#000000'});
  $('bgType').value=C.bgType||'gradient';$('bgAngle').value=C.bgAngle||135;
}
function updatePresetHighlight(){
  document.querySelectorAll('.tp-presets button[data-preset]').forEach(b=>{
    const p=BUILTIN[b.dataset.preset];if(!p)return;
    const match=Object.keys(p).every(k=>String(p[k]).toLowerCase()===String(C[k]).toLowerCase());
    b.classList.toggle('on',match);
  });
}

/* ============ ПАНЕЛИ ============ */
function openSettings(){$('settingsPanel').classList.remove('hidden');$('settingsOverlay').classList.remove('hidden')}
function closeSettings(){$('settingsPanel').classList.add('hidden');$('settingsOverlay').classList.add('hidden')}
function openPanel(){$('themePanel').classList.remove('hidden');$('themeOverlay').classList.remove('hidden');syncInputs()}
function closePanel(){$('themePanel').classList.add('hidden');$('themeOverlay').classList.add('hidden')}
$('settingsBtn').onclick=openSettings;
$('settingsClose').onclick=closeSettings;
$('settingsOverlay').onclick=closeSettings;
$('openTheme').onclick=()=>{closeSettings();openPanel()};
$('themeClose').onclick=closePanel;
$('themeOverlay').onclick=closePanel;
document.querySelectorAll('#themePanel input[type=color]').forEach(inp=>{
  inp.oninput=e=>{C[inp.dataset.k]=e.target.value;applyColors()};
});
$('bgType').onchange=e=>{C.bgType=e.target.value;applyColors()};
$('bgAngle').oninput=e=>{C.bgAngle=+e.target.value;applyColors()};

/* ============ ПРЕСЕТЫ ============ */
function renderPresets(){
  const bEl=$('presetBuiltin');bEl.innerHTML='';
  for(const key of Object.keys(BUILTIN)){
    const b=document.createElement('button');b.textContent=BUILTIN_LABEL[key];b.dataset.preset=key;
    b.onclick=()=>{C={...BUILTIN[key]};applyColors();syncInputs()};bEl.append(b);
  }
  const cEl=$('presetCustom');cEl.innerHTML='';
  const names=Object.keys(customs);
  if(!names.length){cEl.innerHTML='<div class="tp-empty">Нет сохранённых пресетов</div>';return}
  for(const name of names){
    const row=document.createElement('div');row.className='tp-saved';
    const nm=document.createElement('button');nm.className='tp-saved-name';nm.textContent=name;
    nm.onclick=()=>{C={...DEFAULTS,...customs[name]};applyColors();syncInputs()};
    const del=document.createElement('button');del.className='tp-del';del.textContent='×';
    del.onclick=e=>{e.stopPropagation();if(!confirm('Удалить "'+name+'"?'))return;delete customs[name];store.set('presets',customs);renderPresets()};
    row.append(nm,del);cEl.append(row);
  }
  updatePresetHighlight();
}
$('presetSave').onclick=()=>{
  const name=$('presetName').value.trim();if(!name)return;
  if(customs[name]&&!confirm('Перезаписать?'))return;
  customs[name]={...C};store.set('presets',customs);
  $('presetName').value='';renderPresets();
};
$('themeReset').onclick=()=>{C={...DEFAULTS};applyColors();syncInputs()};

/* ============ РИСОВАНИЕ ============ */
const drawingsKey=()=>'drawings:'+S.src+':'+S.sym;
function saveDrawings(){if(!drawingManager)return;try{store.set(drawingsKey(),drawingManager.exportJSON())}catch(e){}}
let saveTimer=null;
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDrawings,400)}
function loadDrawings(){if(!drawingManager)return;try{const j=store.get(drawingsKey(),null);if(j)drawingManager.importJSON(j)}catch(e){}}
function tryDeleteSelected(){
  if(!drawingManager)return false;
  const ms=['removeSelectedDrawings','removeSelectedDrawing','removeSelected','deleteSelectedDrawing','deleteSelected','removeDrawing','deleteDrawing'];
  for(const m of ms){if(typeof drawingManager[m]==='function'){try{drawingManager[m]();return true}catch(e){}}}
  return false;
}
function tryClearAll(){
  if(!drawingManager)return false;
  const ms=['clear','clearAll','removeAll','deleteAll','importJSON'];
  for(const m of ms){if(typeof drawingManager[m]==='function'){try{if(m==='importJSON')drawingManager[m]('[]');else drawingManager[m]();return true}catch(e){}}}
  return false;
}
function deleteAtEvent(ev){
  if(!drawingManager)return;
  const rect=chart.chartElement().getBoundingClientRect();
  const x=ev.clientX-rect.left,y=ev.clientY-rect.top;
  const drawings=(drawingManager.drawings?.()||[]).slice().reverse();
  const TOL=8;
  for(const d of drawings){
    if(!d.points?.length)continue;
    let minX=1/0,maxX=-1/0,minY=1/0,maxY=-1/0;
    for(const pt of d.points){
      const px=chart.timeScale().timeToCoordinate(pt.time);
      const py=main.priceToCoordinate(pt.price);
      if(px==null||py==null)continue;
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
    if(!isFinite(minX))continue;
    if(x>=minX-TOL&&x<=maxX+TOL&&y>=minY-TOL&&y<=maxY+TOL){
      drawingManager.remove(d.id);scheduleSave();flash('Фигура удалена');return;
    }
  }
}
chart.chartElement().addEventListener('mousedown',ev=>{
  if(ev.button===1){ev.preventDefault();ev.stopPropagation();deleteAtEvent(ev)}
},{capture:true});
['mouseup','touchend'].forEach(evt=>{
  chart.chartElement().addEventListener(evt,()=>{if(drawingManager)scheduleSave()},{passive:true});
});
setInterval(()=>{if(drawingManager)saveDrawings()},5000);

/* ============ ПАНЕЛЬ ИНСТРУМЕНТОВ ============ */
const toolGroups=[
  {icon:'／',title:'Линии',tools:[
    {icon:'╱',label:'Линия тренда',kind:'trend-line'},
    {icon:'→',label:'Луч',kind:'ray'},
    {icon:'─',label:'Горизонтальная',kind:'horizontal-line'},
    {icon:'│',label:'Вертикальная',kind:'vertical-line'},
    {icon:'✛',label:'Перекрестие',kind:'cross-line'},
    {icon:'══',label:'Канал',kind:'parallel-channel'},
    {icon:'⋔',label:'Вилы',kind:'pitchfork'}
  ]},
  {icon:'ƒ',title:'Фибоначчи',tools:[
    {icon:'Ⅲ',label:'Коррекция Фибо',kind:'fib-retracement'},
    {icon:'◇',label:'Расширение Фибо',kind:'trend-based-fib-extension'},
    {icon:'◌',label:'Веер Фибо',kind:'fib-speed-resistance-fan'},
    {icon:'◷',label:'Временные зоны',kind:'fib-time-zone'}
  ]},
  {icon:'◇',title:'Паттерны',tools:[
    {icon:'X',label:'XABCD',kind:'xabcd-pattern'},
    {icon:'∩',label:'Голова и плечи',kind:'head-and-shoulders'},
    {icon:'∿',label:'Импульс Эллиотта',kind:'elliott-impulse'},
    {icon:'△',label:'Треугольник',kind:'triangle-pattern'}
  ]},
  {icon:'↗',title:'Прогноз',tools:[
    {icon:'↗',label:'Длинная позиция',kind:'long-position'},
    {icon:'↘',label:'Короткая позиция',kind:'short-position'},
    {icon:'▦',label:'Диапазон дат',kind:'date-range'},
    {icon:'＄',label:'Диапазон цен',kind:'price-range'}
  ]},
  {icon:'▱',title:'Фигуры',tools:[
    {icon:'╱',label:'Кисть',kind:'brush'},
    {icon:'▭',label:'Прямоугольник',kind:'rectangle'},
    {icon:'○',label:'Круг',kind:'circle'},
    {icon:'△',label:'Треугольник',kind:'triangle'},
    {icon:'→',label:'Стрелка',kind:'arrow'}
  ]},
  {icon:'T',title:'Аннотации',tools:[
    {icon:'T',label:'Текст',kind:'text'},
    {icon:'⌖',label:'Заметка',kind:'note'},
    {icon:'◇',label:'Ценовая метка',kind:'price-label'},
    {icon:'□',label:'Выноска',kind:'callout'}
  ]}
];

function setupToolbar(){
  const tb=$('drawing-toolbar');tb.innerHTML='';
  const cursorBtn=document.createElement('button');
  cursorBtn.className='cursor-btn active';cursorBtn.innerHTML='✛';cursorBtn.title='Курсор (Esc)';
  cursorBtn.onclick=()=>{activateTool('cross');setActive(cursorBtn)};
  tb.appendChild(cursorBtn);
  const magnetBtn=document.createElement('button');
  magnetBtn.className='magnet-btn';magnetBtn.innerHTML=magnetEnabled?'⌁':'○';
  magnetBtn.title='Магнит';
  magnetBtn.onclick=()=>{
    magnetEnabled=!magnetEnabled;
    if(drawingManager)drawingManager.setMagnet(magnetEnabled?'weak':'off');
    magnetBtn.innerHTML=magnetEnabled?'⌁':'○';
    magnetBtn.classList.toggle('active',magnetEnabled);
  };
  if(magnetEnabled)magnetBtn.classList.add('active');
  tb.appendChild(magnetBtn);
  toolGroups.forEach(group=>{
    const g=document.createElement('div');g.className='drawing-group';
    const btn=document.createElement('button');btn.innerHTML=group.icon;btn.title=group.title;
    btn.onclick=e=>{e.stopPropagation();if(group.tools[0])activateTool(group.tools[0].kind,btn)};
    const menu=document.createElement('div');menu.className='drawing-group-menu';
    group.tools.forEach(t=>{
      const b=document.createElement('button');
      b.innerHTML=`<span>${t.icon}</span><span>${t.label}</span>`;
      b.onclick=()=>{activateTool(t.kind,btn);menu.style.display='none'};
      menu.appendChild(b);
    });
    g.append(btn,menu);tb.appendChild(g);
  });
  const clearBtn=document.createElement('button');
  clearBtn.className='clear-btn';clearBtn.innerHTML='×';clearBtn.title='Удалить все рисунки';
  clearBtn.onclick=()=>{
    if(!drawingManager)return;
    if(!confirm('Удалить все рисунки для '+S.sym+'?'))return;
    tryClearAll();store.set(drawingsKey(),'[]');flash('Все рисунки удалены');
  };
  tb.appendChild(clearBtn);
}
function setActive(btn){
  document.querySelectorAll('#drawing-toolbar button').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
}
function activateTool(kind,btn){
  if(!drawingManager)return;
  try{drawingManager.setTool(kind)}catch(e){console.warn('Tool not supported:',kind);try{drawingManager.setTool('cross')}catch(_){}}
  if(btn)setActive(btn);
  else if(kind==='cross')setActive(document.querySelector('.cursor-btn'));
  else document.querySelectorAll('#drawing-toolbar button').forEach(b=>b.classList.remove('active'));
}

/* ============ КОНТЕКСТНОЕ МЕНЮ ============ */
const ctxMenu=$('ctxMenu');
function showCtx(x,y){
  ctxMenu.innerHTML='';
  const items=[
    {label:'Индикаторы…',hot:'/',act:openIndicators},
    {label:'Настройки графика…',hot:'',act:openSettings},
    {sep:true},
    {label:'Скрыть все рисунки',hot:'Ctrl+Alt+H',act:()=>{
      if(!drawingManager)return;
      try{drawingManager.hideAll?.()}catch(e){}
      document.querySelectorAll('canvas').forEach(c=>c.style.opacity=c.style.opacity==='0'?'1':'0');
    }},
    {label:'Сбросить масштаб',hot:'',act:()=>{chart.timeScale().fitContent();focusToPrice(S.data.length)}},
    {sep:true},
    {label:'Скопировать тикер',hot:'',act:()=>{navigator.clipboard?.writeText(S.sym);flash('Скопировано: '+S.sym)}},
    {label:'Скриншот',hot:'',act:()=>{flash('Скриншот — в разработке')}}
  ];
  items.forEach(it=>{
    if(it.sep){const d=document.createElement('div');d.className='ctx-sep';ctxMenu.appendChild(d);return}
    const d=document.createElement('div');d.className='ctx-item';
    d.innerHTML=`<span>${it.label}</span>${it.hot?`<span class="ctx-hot">${it.hot}</span>`:''}`;
    d.onclick=()=>{hideCtx();it.act()};
    ctxMenu.appendChild(d);
  });
  ctxMenu.classList.remove('hidden');
  const w=ctxMenu.offsetWidth,h=ctxMenu.offsetHeight;
  ctxMenu.style.left=Math.min(x,window.innerWidth-w-8)+'px';
  ctxMenu.style.top=Math.min(y,window.innerHeight-h-8)+'px';
}
function hideCtx(){ctxMenu.classList.add('hidden')}
document.addEventListener('contextmenu',e=>{
  if(e.target.closest('#chart')||e.target.closest('#wrap')){e.preventDefault();showCtx(e.clientX,e.clientY);}
});
document.addEventListener('click',e=>{if(!e.target.closest('#ctxMenu'))hideCtx()});

/* ============ ГОРЯЧИЕ КЛАВИШИ ============ */
document.addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toUpperCase();
  const inInput=tag==='INPUT'||tag==='TEXTAREA'||e.target.isContentEditable;
  if(inInput)return;
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();return}
  if(e.key==='/'){e.preventDefault();openIndicators();return}
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==='a'){e.preventDefault();$('bottom').classList.toggle('collapsed');return}
  if(ctrl&&e.altKey&&e.key.toLowerCase()==='h'){e.preventDefault();document.querySelectorAll('canvas').forEach(c=>c.style.opacity=c.style.opacity==='0'?'1':'0');return}
  if(ctrl&&e.key.toLowerCase()==='s'){e.preventDefault();saveDrawings();save();flash('Сохранено');return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(tryDeleteSelected()){scheduleSave();flash('Фигура удалена')}return}
  if(e.key==='Escape'){activateTool('cross',document.querySelector('.cursor-btn'));hideCtx();closeSearch();closeIndicators();return}
  if(ctrl&&e.key.toLowerCase()==='z'){if(typeof drawingManager?.undo==='function'){e.preventDefault();drawingManager.undo();scheduleSave()}return}
  if(ctrl&&e.key.toLowerCase()==='y'){if(typeof drawingManager?.redo==='function'){e.preventDefault();drawingManager.redo();scheduleSave()}return}
  const map={'t':'trend-line','h':'horizontal-line','v':'vertical-line','r':'rectangle','f':'fib-retracement'};
  if(map[e.key.toLowerCase()]&&!ctrl&&!e.altKey){e.preventDefault();activateTool(map[e.key.toLowerCase()]);}
});

/* ============ ТОСТ ============ */
let toastEl=null;
function flash(msg){
  if(!toastEl){toastEl=document.createElement('div');toastEl.id='toast';document.body.appendChild(toastEl)}
  toastEl.textContent=msg;toastEl.classList.add('on');
  clearTimeout(toastEl._t);toastEl._t=setTimeout(()=>toastEl.classList.remove('on'),1500);
}

/* ============ НИЖНЯЯ ПАНЕЛЬ ============ */
document.querySelectorAll('.bottom-tabs button[data-tab]').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.bottom-tabs button[data-tab]').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    document.querySelectorAll('.bottom-pane').forEach(p=>p.classList.remove('on'));
    $(btn.dataset.tab+'Tab').classList.add('on');
    $('bottom').classList.remove('collapsed');
    if(btn.dataset.tab==='screener')renderScreener();
    if(btn.dataset.tab==='alerts')renderAlerts();
  };
});
$('bottomToggle').onclick=()=>$('bottom').classList.toggle('collapsed');

function renderScreener(){
  const body=$('screenerBody');body.innerHTML='';
  if(!wl.length){body.innerHTML='<div class="sb-empty">Добавьте тикеры в список</div>';return}
  wl.forEach(w=>{
    const p=px[w.src+':'+w.sym];
    const row=document.createElement('div');row.className='screener-row';
    const price=p?.last!=null?fmtP(p.last):'—';
    const pct=p?.pct!=null?((p.pct>=0?'+':'')+p.pct.toFixed(2)+'%'):'—';
    const pctClass=p?.pct>=0?'up':(p?.pct<0?'down':'');
    const vol=p?.vol!=null?fmtVol(p.vol):'—';
    const srcName={crypto:'Крипто',moex:'MOEX',futures:'Фьюч'}[w.src];
    row.innerHTML=`<span>${w.sym}</span><span>${price}</span><span class="${pctClass}">${pct}</span><span>${vol}</span><span style="color:var(--dim)">${srcName}</span>`;
    row.onclick=()=>{setSrc(w.src);$('sym').value=w.sym;open_()};
    body.appendChild(row);
  });
}
function fmtVol(v){
  if(v>=1e9)return (v/1e9).toFixed(2)+'B';
  if(v>=1e6)return (v/1e6).toFixed(2)+'M';
  if(v>=1e3)return (v/1e3).toFixed(2)+'K';
  return v.toFixed(0);
}

/* ============ АЛЕРТЫ ============ */
let alerts=store.get('alerts',[]);
function renderAlerts(){
  const list=$('alertsList');list.innerHTML='';
  if(!alerts.length){list.innerHTML='<div class="sb-empty">Нет алертов</div>';return}
  alerts.forEach((a,i)=>{
    const d=document.createElement('div');d.className='alert-item'+(a.triggered?' triggered':'');
    d.innerHTML=`<span class="alert-sym">${a.sym}</span>
      <span class="alert-cond">${a.cond==='gt'?'выше':'ниже'}</span>
      <span class="alert-price">${a.price}</span>
      ${a.triggered?'<span style="color:var(--up)">✓ сработал</span>':''}
      <button class="alert-x">×</button>`;
    d.querySelector('.alert-x').onclick=()=>{alerts.splice(i,1);store.set('alerts',alerts);renderAlerts()};
    list.appendChild(d);
  });
}
$('alertAdd').onclick=()=>{
  const sym=$('alertSym').value.trim();
  const cond=$('alertCond').value;
  const price=parseFloat($('alertPrice').value);
  if(!sym||!isFinite(price)){flash('Укажите тикер и цену');return}
  const finalSym=S.src==='crypto'?sym.toUpperCase():sym;
  alerts.push({sym:finalSym,cond,price,triggered:false});
  store.set('alerts',alerts);
  $('alertSym').value='';$('alertPrice').value='';
  renderAlerts();
  flash('Алерт добавлен');
};
function checkAlerts(sym,price){
  if(!alerts.length)return;
  let changed=false;
  alerts.forEach(a=>{
    if(a.sym!==sym||a.triggered)return;
    if((a.cond==='gt'&&price>a.price)||(a.cond==='lt'&&price<a.price)){
      a.triggered=true;changed=true;
      flash(`⚡ ${a.sym} ${a.cond==='gt'?'выше':'ниже'} ${a.price} (сейчас ${price})`);
      if('Notification' in window&&Notification.permission==='granted'){
        new Notification(`${a.sym}`,{body:`Цена ${price} ${a.cond==='gt'?'выше':'ниже'} ${a.price}`});
      }
    }
  });
  if(changed){store.set('alerts',alerts);renderAlerts()}
}
if('Notification' in window&&Notification.permission==='default'){Notification.requestPermission();}

/* ============ ПОИСК ============ */
let searchIndex=null,searchResults=[],searchActive=-1,searchSrcFilter='all';
const SRC_LABEL={crypto:'Крипто',moex:'MOEX',futures:'Фьючерсы'};
const SRC_ORDER=['crypto','moex','futures'];

/* fetch с таймаутом — спасает от вечной загрузки на iOS Safari */
function fetchTO(url,ms=8000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{signal:ctrl.signal}).finally(()=>clearTimeout(t));
}

async function loadCryptoIndex(){
  let r;
  try{r=await fetchTO('https://data-api.binance.vision/api/v3/exchangeInfo',6000)}
  catch(e){r=await fetchTO('https://api.binance.com/api/v3/exchangeInfo',6000)}
  if(!r.ok)throw new Error('binance');
  const j=await r.json();
  return j.symbols
    .filter(s=>s.status==='TRADING'&&(s.quoteAsset==='USDT'||s.quoteAsset==='BTC'||s.quoteAsset==='ETH'))
    .map(s=>({sym:s.symbol,name:`${s.baseAsset} / ${s.quoteAsset}`}));
}
async function loadMoexSharesIndex(){
  const r=await fetchTO('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.only=securities&securities.columns=SECID,SHORTNAME',8000);
  if(!r.ok)throw new Error('moex');
  const j=await r.json(),c=j.securities.columns,rows=j.securities.data;
  const iS=c.indexOf('SECID'),iN=c.indexOf('SHORTNAME');
  return rows.map(x=>({sym:x[iS],name:x[iN]}));
}
async function loadFuturesIndex(){
  const r=await fetchTO('https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE',8000);
  if(!r.ok)throw new Error('moex');
  const j=await r.json(),c=j.securities.columns,rows=j.securities.data;
  const iS=c.indexOf('SECID'),iN=c.indexOf('SHORTNAME'),iD=c.indexOf('LASTTRADEDATE');
  const today=new Date().toISOString().slice(0,10);
  return rows.filter(x=>!x[iD]||x[iD]>=today).map(x=>({sym:x[iS],name:x[iN]||x[iS]}));
}

async function ensureSearchIndex(){
  if(searchIndex&&searchIndex.crypto&&searchIndex.crypto.length)return searchIndex;
  const c=store.get('searchIndex',null);
  // 864e5 = 1 сутки. Раньше стояло 864e1 (8.6 сек) — это был баг!
  if(c&&c.ts>Date.now()-864e5&&c.data&&c.data.crypto&&c.data.crypto.length){
    searchIndex=c.data;
    return searchIndex;
  }
  let crypto=[];
  try{crypto=await loadCryptoIndex();}
  catch(e){console.warn('[search] Binance index failed:',e);}
  searchIndex={crypto,moex:[],futures:[]};
  try{store.set('searchIndex',{ts:Date.now(),data:searchIndex})}catch(e){}
  // MOEX/фьючерсы грузим в фоне — не блокируем поиск
  Promise.all([
    loadMoexSharesIndex().catch(()=>[]),
    loadFuturesIndex().catch(()=>[])
  ]).then(([moex,futures])=>{
    if(!searchIndex)return;
    searchIndex.moex=moex;
    searchIndex.futures=futures;
    try{store.set('searchIndex',{ts:Date.now(),data:searchIndex})}catch(e){}
    const modal=$('searchModal');
    if(modal&&!modal.classList.contains('hidden')){
      const q=($('sbInput').value||'').trim();
      searchResults=searchSymbols(q,searchSrcFilter);
      if(searchActive<0&&searchResults.length)searchActive=0;
      renderSearchResults();
      if(searchResults.length)scheduleQuotes();
    }
  });
  return searchIndex;
}

function searchSymbols(q,srcFilter='all'){
  if(!searchIndex)return[];
  q=q.trim().toLowerCase();
  if(!q)return[];
  const PER_SRC=25;
  const out=[];
  const order=srcFilter==='all'?SRC_ORDER:[srcFilter];
  for(const src of order){
    const arr=searchIndex[src];
    if(!arr||!arr.length)continue;
    let count=0;
    for(const it of arr){
      if(it.sym.toLowerCase().includes(q)||(it.name&&it.name.toLowerCase().includes(q))){
        out.push({src,sym:it.sym,name:it.name});
        count++;
        if(count>=PER_SRC)break;
      }
    }
  }
  return out;
}

function fmtPrice(n){
  if(n==null)return '—';
  const a=Math.abs(n);
  if(a>=1000)return n.toLocaleString('en-US',{maximumFractionDigits:2});
  if(a>=100)return n.toFixed(2);
  if(a>=1)return n.toFixed(3);
  if(a>=0.01)return n.toFixed(4);
  return String(+n.toPrecision(4));
}

function updateQuoteCells(){
  document.querySelectorAll('#sbList .sb-item').forEach(item=>{
    const sym=item.dataset.sym,src=item.dataset.src;
    if(!sym||!src)return;
    const p=px[src+':'+sym];
    if(!p||p.last==null)return;
    const priceEl=item.querySelector('.sb-last');
    const pctEl=item.querySelector('.sb-pct');
    if(priceEl){priceEl.textContent=fmtPrice(p.last);priceEl.classList.remove('dim')}
    if(pctEl&&p.pct!=null){
      pctEl.textContent=(p.pct>=0?'+':'')+(+p.pct).toFixed(2)+'%';
      pctEl.classList.remove('up','down');
      pctEl.classList.add(p.pct>=0?'up':'down');
    }
  });
}

let quoteTimer=null;
function scheduleQuotes(){clearTimeout(quoteTimer);quoteTimer=setTimeout(loadQuotes,350);}

async function loadQuotes(){
  const LIMIT=25;
  const crypto=[],moex=[],futures=[];
  searchResults.forEach(r=>{
    if(r.src==='crypto'&&crypto.length<LIMIT)crypto.push(r.sym);
    else if(r.src==='moex'&&moex.length<LIMIT)moex.push(r.sym);
    else if(r.src==='futures'&&futures.length<LIMIT)futures.push(r.sym);
  });
  const jobs=[];
  if(crypto.length){
    jobs.push((async()=>{
      try{
        const q=encodeURIComponent(JSON.stringify(crypto));
        let r;
        try{r=await fetchTO('https://data-api.binance.vision/api/v3/ticker/24hr?symbols='+q,6000)}
        catch(e){r=await fetchTO('https://api.binance.com/api/v3/ticker/24hr?symbols='+q,6000)}
        if(!r.ok)return;
        (await r.json()).forEach(t=>{px['crypto:'+t.symbol]={last:+t.lastPrice,pct:+t.priceChangePercent,vol:+t.quoteVolume};});
      }catch(e){}
    })());
  }
  if(moex.length){
    jobs.push((async()=>{
      try{
        const r=await fetchTO('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VOLTODAY&securities='+moex.join(','),8000);
        if(!r.ok)return;
        (await r.json()).marketdata.data.forEach(x=>{px['moex:'+x[0]]={last:x[1],pct:x[2],vol:x[3]};});
      }catch(e){}
    })());
  }
  if(futures.length){
    jobs.push((async()=>{
      try{
        const r=await fetchTO('https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VOLTODAY&securities='+futures.join(','),8000);
        if(!r.ok)return;
        (await r.json()).marketdata.data.forEach(x=>{px['futures:'+x[0]]={last:x[1],pct:x[2],vol:x[3]};});
      }catch(e){}
    })());
  }
  await Promise.all(jobs);
  updateQuoteCells();
}

function renderSearchResults(){
  const list=$('sbList');list.innerHTML='';
  if(!searchResults.length){
    const q=($('sbInput')?.value||'').trim();
    const total=(searchIndex?.crypto?.length||0)+(searchIndex?.moex?.length||0)+(searchIndex?.futures?.length||0);
    let hint='Загрузка списка…';
    if(searchIndex){
      if(total===0)hint='Не удалось загрузить список.<br>Binance и MOEX недоступны.<br>Проверьте интернет / VPN / блокировщик.';
      else if(q)hint='Ничего не найдено';
      else hint='Начните вводить тикер';
    }
    list.innerHTML='<div class="sb-empty">'+hint+'</div>';
    return;
  }
  const counts={};
  searchResults.forEach(r=>{counts[r.src]=(counts[r.src]||0)+1});
  const BADGE={crypto:'К',moex:'М',futures:'Ф'};
  let lastSrc=null;
  searchResults.forEach((r,idx)=>{
    if(r.src!==lastSrc){
      lastSrc=r.src;
      const head=document.createElement('div');
      head.className='sb-group-head';
      head.innerHTML=`<span class="sb-badge ${r.src}">${BADGE[r.src]}</span><span class="sb-group-title">${SRC_LABEL[r.src]}</span><span class="sb-count">${counts[r.src]}</span>`;
      list.appendChild(head);
    }
    const item=document.createElement('div');
    item.className='sb-item'+(idx===searchActive?' active':'');
    item.dataset.sym=r.sym;item.dataset.src=r.src;
    item.innerHTML=`
      <div class="sb-item-sym">
        <div class="sb-sym">${r.sym}</div>
        <div class="sb-name">${r.name||''}</div>
      </div>
      <div class="sb-item-price">
        <div class="sb-last dim">—</div>
        <div class="sb-pct"></div>
      </div>`;
    item.onclick=()=>selectSearchResult(r);
    list.appendChild(item);
  });
  updateQuoteCells();
}

function scrollToActive(){
  const el=document.querySelector('.sb-item.active');
  if(el)el.scrollIntoView({block:'nearest'});
}

function selectSearchResult(r){
  closeSearch();
  setSrc(r.src);
  $('sym').value=r.sym;
  open_();
}

function openSearch(){
  $('searchModal').classList.remove('hidden');
  $('sbInput').value='';
  searchActive=-1;searchResults=[];searchSrcFilter='all';
  document.querySelectorAll('#sbFilters button').forEach(b=>b.classList.toggle('on',b.dataset.src==='all'));
  $('sbList').innerHTML='<div class="sb-empty">Загрузка списка…</div>';
  setTimeout(()=>$('sbInput').focus(),0);
  ensureSearchIndex().then(()=>{
    const q=$('sbInput').value;
    if(q.trim()){searchResults=searchSymbols(q,searchSrcFilter);searchActive=searchResults.length?0:-1;}
    renderSearchResults();
    if(searchResults.length)scheduleQuotes();
  }).catch(err=>{
    console.warn('[search] fatal:',err);
    $('sbList').innerHTML='<div class="sb-empty">Не удалось загрузить список</div>';
  });
}
function closeSearch(){$('searchModal').classList.add('hidden')}

$('searchBtn').onclick=openSearch;
$('sbClose').onclick=closeSearch;
$('searchModal').onclick=e=>{if(e.target===$('searchModal'))closeSearch()};

document.querySelectorAll('#sbFilters button').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('#sbFilters button').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    searchSrcFilter=btn.dataset.src;
    searchResults=searchSymbols($('sbInput').value,searchSrcFilter);
    searchActive=searchResults.length?0:-1;
    renderSearchResults();scrollToActive();scheduleQuotes();
  };
});

$('sbInput').addEventListener('input',e=>{
  searchResults=searchSymbols(e.target.value,searchSrcFilter);
  searchActive=searchResults.length?0:-1;
  renderSearchResults();scrollToActive();scheduleQuotes();
});
$('sbInput').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeSearch();return}
  if(e.key==='ArrowDown'){e.preventDefault();if(searchResults.length){searchActive=Math.min(searchActive+1,searchResults.length-1);renderSearchResults();scrollToActive()}}
  else if(e.key==='ArrowUp'){e.preventDefault();if(searchResults.length){searchActive=Math.max(searchActive-1,0);renderSearchResults();scrollToActive()}}
  else if(e.key==='Enter'){e.preventDefault();if(searchActive>=0&&searchResults[searchActive])selectSearchResult(searchResults[searchActive])}
});

/* ============ ЗАГРУЗКА ДАННЫХ ============ */
async function fetchBars(short){
  if(S.src==='crypto'){
    const q=`/api/v3/klines?symbol=${encodeURIComponent(S.sym)}&interval=${encodeURIComponent(S.tf)}&limit=500`;
    let r;
    try{r=await fetchTO('https://data-api.binance.vision'+q,8000)}
    catch(e){r=await fetchTO('https://api.binance.com'+q,8000)}
    if(!r.ok)throw new Error('Binance: тикер '+S.sym+' не найден');
    return (await r.json()).map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
  }
  const days=short?(+S.tf===7?14:3):(DAYS[+S.tf]||30);
  const from=new Date(Date.now()-days*864e5).toISOString().slice(0,10);
  const base=S.src==='futures'?`https://iss.moex.com/iss/engines/futures/markets/forts/securities/${S.sym}/candles.json`:`https://iss.moex.com/iss/engines/stock/markets/shares/securities/${S.sym}/candles.json`;
  const r=await fetchTO(`${base}?interval=${S.tf}&from=${from}`,10000);
  if(!r.ok)throw new Error(S.src==='futures'?'MOEX (фьючерсы) недоступен':'MOEX недоступен');
  const j=await r.json(),c=j.candles.columns,rows=j.candles.data;
  if(!rows.length)throw new Error('Нет данных по '+S.sym);
  const ix=n=>c.indexOf(n);
  return rows.map(x=>{
    const open=x[ix('open')],high=x[ix('high')],low=x[ix('low')],close=x[ix('close')],volume=x[ix('volume')]||0;
    if(open==null||high==null||low==null||close==null)return null;
    return {time:Date.parse(x[ix('begin')].replace(' ','T')+'Z')/1000,open,high,low,close,volume};
  }).filter(x=>x!==null);
}
function err(m){const e=$('err');e.textContent=m;e.style.display=m?'block':'none'}
function focusToPrice(len){
  if(!len)return;
  const N=mq.matches?80:120;const visible=Math.min(N,len);
  const apply=()=>{try{chart.timeScale().setVisibleLogicalRange({from:Math.max(0,len-visible),to:len+2})}catch(e){try{chart.timeScale().fitContent()}catch(_){}}};
  requestAnimationFrame(()=>requestAnimationFrame(apply));
}
let seq=0;
async function load(first){
  const my=++seq;
  try{
    const d=await fetchBars();
    if(my!==seq)return;
    err('');S.data=d;paint();
    focusToPrice(d.length);
    if(first)live();
    legend(d[d.length-1],d[d.length-2]);
  }catch(e){if(first)err(e.message||'Ошибка загрузки')}
}

/* ============ ТАЙМЕР ============ */
const IV={
  crypto:{'1s':1,'5s':5,'15s':15,'30s':30,'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'8h':28800,'1d':86400,'1w':604800,'1M':2592000},
  moex:{1:60,10:600,60:3600,24:86400,7:604800,31:2592000,4:7776000},
  futures:{1:60,10:600,60:3600,24:86400,7:604800,31:2592000,4:7776000}
};
function tfSeconds(src,tf){
  if(IV[src]&&IV[src][tf]!=null)return IV[src][tf];
  if(src==='crypto'){
    const m=String(tf).match(/^(\d+)([smhdwM])$/);
    if(!m)return null;
    const unit={s:1,m:60,h:3600,d:86400,w:604800,M:2592000}[m[2]];
    return unit?+m[1]*unit:null;
  }
  return null;
}
const p2=n=>String(n).padStart(2,'0');
const fmtT=s=>{const d=new Date(s*1000);return p2(d.getUTCDate())+'.'+p2(d.getUTCMonth()+1)+' '+p2(d.getUTCHours())+':'+p2(d.getUTCMinutes())};
function tickCd(){
  const e=$('cdTag'),b=S.data[S.data.length-1];
  const needHide=(S.src!=='crypto'&&+S.tf>=24)||(S.src==='crypto'&&(S.tf==='1w'||S.tf==='1M'));
  if(!b||!main||needHide){e.style.display='none';return}
  const iv=tfSeconds(S.src,S.tf);if(!iv){e.style.display='none';return}
  const real=S.src==='crypto'?b.time:b.time-10800;
  const r=real+iv-Math.floor(Date.now()/1000);
  const y=main.priceToCoordinate(b.close);
  if(r<=0||r>iv||y==null||y<0||y>$('chart').clientHeight-60){e.style.display='none';return}
  const h=Math.floor(r/3600),m=Math.floor(r%3600/60),s=r%60;
  e.innerHTML=(h?h+':'+p2(m):m)+':'+p2(s)+'<br><span class="dim">до '+fmtT(b.time+iv).slice(6)+'</span>';
  e.style.width=chart.priceScale('right').width()+'px';e.style.top=(y+11)+'px';e.style.display='block';
}
setInterval(tickCd,250);

function tfLabel(src,tf){
  const t=getTF(src);
  for(const [k,v] of Object.entries(t)){
    if(String(v)===String(tf))return k;
  }
  return String(tf);
}

function legend(b,p){
  if(!b)return;
  const ref=p?p.close:b.open,ch=b.close-ref,pc=ch/ref*100,col=ch>=0?'var(--up)':'var(--down)';
  const f=n=>n>=100?n.toFixed(2):n.toPrecision(5).replace(/\.?0+$/,'');
  $('legend').innerHTML=`<b>${S.sym}</b> <span style="color:var(--dim)">${tfLabel(S.src,S.tf)}</span><br>О ${f(b.open)} В ${f(b.high)} Н ${f(b.low)} З <span style="color:${col}">${f(b.close)} (${ch>=0?'+':''}${pc.toFixed(2)}%)</span>`;
}
chart.subscribeCrosshairMove(p=>{
  if(!p.time||!S.data.length)return;
  const i=S.data.findIndex(b=>b.time===p.time);
  if(i>=0)legend(S.data[i],S.data[i-1]);
});

/* ============ REAL-TIME ============ */
let ws=null,wsTry=0,poll=null,liveId=0;
function setStatus(t,on){
  const e=$('status');
  e.innerHTML='<span class="status-dot"></span> '+t;
  e.style.color=on?'var(--up)':'var(--dim)';
  const dot=e.querySelector('.status-dot');
  if(dot)dot.style.background=on?'var(--up)':'var(--dim)';
}
function applyBar(b){
  const L=S.data[S.data.length-1];
  if(L&&b.time<L.time)return;
  if(L&&b.time===L.time)S.data[S.data.length-1]=b;else S.data.push(b);
  if(main)main.update(val(b));
  if(vol)vol.update({time:b.time,value:b.volume,color:b.close>=b.open?C.up+'55':C.down+'55'});
  indicators.forEach(ind=>updateIndicator(ind));
  legend(S.data[S.data.length-1],S.data[S.data.length-2]);
  checkAlerts(S.sym,b.close);
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
  ws.onopen=()=>{if(id!==liveId)return;const re=wsTry>0;wsTry=0;setStatus('live',true);if(re)load(false)};
  ws.onmessage=m=>{if(id!==liveId)return;const k=JSON.parse(m.data).k;if(!k)return;applyBar({time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v})};
  ws.onclose=()=>{if(id!==liveId)return;wsTry++;setStatus('переподключение…',false);setTimeout(()=>{if(id===liveId)openWs(id)},Math.min(1000*wsTry,5000))};
}
async function pollMoex(id){
  if(document.hidden||id!==liveId)return;
  try{const d=await fetchBars(true);if(id!==liveId)return;d.slice(-3).forEach(applyBar);setStatus('обновление каждые 5 с',true)}catch(e){setStatus('нет связи',false)}
}

/* ============ ИНТЕРФЕЙС ============ */
function getTF(src){const custom=S.tfCustom[src]||{};return {...TF_BASE[src],...custom};}
function buildTf(){
  const t=getTF(S.src);
  $('addTf').style.display=S.src==='crypto'?'':'none';
  const vals=Object.values(t);
  if(!vals.some(v=>String(v)===String(S.tf)))S.tf=TF_DEFAULT[S.src];
  $('tfs').innerHTML='';
  for(const [k,v] of Object.entries(t)){
    const b=document.createElement('button');
    b.textContent=k;b.classList.toggle('on',String(v)===String(S.tf));
    b.onclick=()=>{S.tf=v;buildTf();load(true)};$('tfs').append(b);
  }
  const customKeys=Object.keys(S.tfCustom[S.src]||{});
  customKeys.forEach(k=>{
    const del=document.createElement('button');
    del.textContent='× '+k;del.className='tf-custom';
    del.title='Удалить кастомный интервал';
    del.onclick=()=>{delete S.tfCustom[S.src][k];store.set('tfCustom',S.tfCustom);buildTf()};
    $('tfs').append(del);
  });
}

const BINANCE_TF=new Set(['1s','1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']);
const MOEX_TF_MAP={'1м':1,'10м':10,'1ч':60,'1д':24,'1н':7,'1мес':31,'1кв':4};

$('addTf').onclick=()=>{
  const raw=prompt('Свой интервал (например: 3ч, 45м, 2д, 5м).\nЕдиницы: с/s — сек, м/m — мин, ч/h — час, д/d — день, н/w — неделя');
  if(!raw)return;
  const m=raw.trim().match(/^(\d+)\s*([смчднsmhdw])$/i);
  if(!m){flash('Неверный формат. Например: 3ч или 3h');return}
  const n=+m[1];
  const LAT_TO_CYR={s:'с',m:'м',h:'ч',d:'д',w:'н'};
  const unit=LAT_TO_CYR[m[2].toLowerCase()]||m[2].toLowerCase();
  const key=n+unit;
  let tfValue;
  if(S.src==='crypto'){
    const map={'с':'s','м':'m','ч':'h','д':'d','н':'w'};
    tfValue=n+map[unit];
    if(!BINANCE_TF.has(tfValue)){flash('Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M');return;}
  }else{
    if(!(key in MOEX_TF_MAP)){flash('MOEX: только 1м, 10м, 1ч, 1д, 1н, 1мес, 1кв');return;}
    tfValue=MOEX_TF_MAP[key];
  }
  if(Object.values(getTF(S.src)).some(v=>String(v)===String(tfValue))){flash('Такой интервал уже есть');return;}
  if(!S.tfCustom[S.src])S.tfCustom[S.src]={};
  S.tfCustom[S.src][key]=tfValue;
  store.set('tfCustom',S.tfCustom);
  S.tf=tfValue;
  buildTf();load(true);
};

function setSrc(s){
  S.src=s;
  $('srcB').classList.toggle('on',s==='crypto');
  $('srcM').classList.toggle('on',s==='moex');
  $('srcF').classList.toggle('on',s==='futures');
  S.tf=TF_DEFAULT[s];
}
$('srcB').onclick=()=>{setSrc('crypto');$('sym').value='BTCUSDT';open_()};
$('srcM').onclick=()=>{setSrc('moex');$('sym').value='SBER';open_()};
$('srcF').onclick=()=>{setSrc('futures');$('sym').value='SiZ6';open_()};

function open_(){
  if(mq.matches)view('chart');
  saveDrawings();
  const raw=$('sym').value.trim();
  S.sym=raw?(S.src==='crypto'?raw.toUpperCase():raw):S.sym;
  buildTf();createSeries();load(true);save();
}
$('go').onclick=open_;
$('sym').addEventListener('keydown',e=>{if(e.key==='Enter')open_()});
$('style').onchange=()=>{createSeries();paint()};

/* ============ СПИСОК ============ */
let wl=store.get('wl',[
  {src:'crypto',sym:'BTCUSDT'},{src:'crypto',sym:'ETHUSDT'},
  {src:'moex',sym:'SBER'},{src:'moex',sym:'GAZP'}
]);
const mq=matchMedia('(max-width:700px)');
mq.addEventListener('change',()=>{
  if(!mq.matches){
    document.body.classList.remove('m-chart','m-list');
    focusToPrice(S.data.length);
  } else if(!document.body.classList.contains('m-chart')){
    view('list');
  }
});

function view(v){
  const wasChart=document.body.classList.contains('m-chart');
  document.body.classList.toggle('m-chart',v==='chart');
  document.body.classList.toggle('m-list',v!=='chart');
  if(v==='chart'&&mq.matches&&!wasChart){try{history.pushState({c:1},'')}catch(e){}}
}
function goList(){
  liveId++;if(ws){ws.onclose=null;ws.close();ws=null}clearInterval(poll);
  view('list');loadPrices();
}
$('back').onclick=()=>{if(history.state&&history.state.c)history.back();else goList()};
addEventListener('popstate',()=>{if(mq.matches&&document.body.classList.contains('m-chart'))goList()});

const px={};
const fmtP=n=>n==null?'':n>=100?n.toFixed(2):String(+n.toPrecision(5));
function renderWl(){
  const wc=$('watchCount');
  if(wc)wc.textContent=wl.length;
  $('wl').innerHTML='';
  wl.forEach((w,i)=>{
    const d=document.createElement('div');d.className='wl';
    const b=document.createElement('button');b.textContent=w.sym;
    b.onclick=()=>{setSrc(w.src);$('sym').value=w.sym;open_()};
    const p=px[w.src+':'+w.sym],pr=document.createElement('span');pr.className='pr';
    if(p&&p.last!=null){
      if(p.pct!=null){
        const c=p.pct>=0?'var(--up)':'var(--down)';
        pr.innerHTML=fmtP(p.last)+'<br><span style="color:'+c+'">'+(p.pct>=0?'+':'')+(+p.pct).toFixed(2)+'%</span>';
      }else{
        pr.textContent=fmtP(p.last);
      }
    }
    const x=document.createElement('button');x.className='x';x.textContent='×';
    x.onclick=()=>{wl.splice(i,1);store.set('wl',wl);renderWl();renderScreener()};
    d.append(b,pr,x);$('wl').append(d);
  });
  renderScreener();
}
async function loadPrices(){
  const cr=wl.filter(w=>w.src==='crypto').map(w=>w.sym);
  const mo=wl.filter(w=>w.src==='moex').map(w=>w.sym);
  const fu=wl.filter(w=>w.src==='futures').map(w=>w.sym);
  const put=t=>{px['crypto:'+t.symbol]={last:+t.lastPrice,pct:+t.priceChangePercent,vol:+t.quoteVolume}};
  if(cr.length){
    const base=async q=>{
      try{return await fetchTO('https://data-api.binance.vision'+q,6000)}
      catch(e){return await fetchTO('https://api.binance.com'+q,6000)}
    };
    try{
      const r=await base('/api/v3/ticker/24hr?symbols='+encodeURIComponent(JSON.stringify(cr)));
      if(r.ok)(await r.json()).forEach(put);
      else await Promise.all(cr.map(async s=>{try{const r1=await base('/api/v3/ticker/24hr?symbol='+s);if(r1.ok)put(await r1.json())}catch(e){}}));
    }catch(e){}
  }
  if(mo.length){
    try{
      const r=await fetchTO('https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json?iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VOLTODAY&securities='+mo.join(','),8000);
      if(r.ok)(await r.json()).marketdata.data.forEach(x=>{px['moex:'+x[0]]={last:x[1],pct:x[2],vol:x[3]}});
    }catch(e){}
  }
  if(fu.length){
    try{
      const r=await fetchTO('https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VOLTODAY&securities='+fu.join(','),8000);
      if(r.ok)(await r.json()).marketdata.data.forEach(x=>{px['futures:'+x[0]]={last:x[1],pct:x[2],vol:x[3]}});
    }catch(e){}
  }
  wl.forEach(w=>{
    const p=px[w.src+':'+w.sym];
    if(p&&p.last!=null)checkAlerts(w.sym,p.last);
  });
  renderWl();
}
function detectSrc(sym){
  if(!sym)return S.src;
  const u=sym.toUpperCase();
  if(/(USDT|USDC|BUSD|BTC|ETH|BNB)$/.test(u)&&u.length>4)return 'crypto';
  if(/^[A-Z]{2,4}[FGHJKMNQUVXZ]\d$/.test(u))return 'futures';
  if(searchIndex){
    if(searchIndex.crypto?.some(it=>it.sym===u))return 'crypto';
    if(searchIndex.moex?.some(it=>it.sym===u))return 'moex';
    if(searchIndex.futures?.some(it=>it.sym===u))return 'futures';
  }
  return S.src;
}
$('add').onclick=()=>{
  const s=($('sym').value.trim())||S.sym;
  if(!s)return;
  const src=detectSrc(s);
  const sym=src==='crypto'?s.toUpperCase():s;
  if(!wl.some(w=>w.sym===sym&&w.src===src)){
    wl.push({src,sym});store.set('wl',wl);renderWl();loadPrices();
  }
};
function save(){store.set('last',{src:S.src,sym:S.sym,tf:S.tf})}

/* ============ СТАРТ ============ */
const last=store.get('last',null);
S.tfCustom=store.get('tfCustom',{});
if(last){setSrc(last.src);S.sym=last.sym;S.tf=last.tf;$('sym').value=last.sym}
buildTf();renderWl();renderPresets();renderAlerts();
setupToolbar();createSeries();applyColors();
if(mq.matches)view('list');else load(true);
loadPrices();
setInterval(()=>{if(!document.hidden&&(!mq.matches||document.body.classList.contains('m-list')))loadPrices()},10000);