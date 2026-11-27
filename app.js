import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { createDrawings } from './drawings.js';

const TF_BASE={
  crypto:{'1с':'1s','1м':'1m','3м':'3m','5м':'5m','15м':'15m','30м':'30m','1ч':'1h','2ч':'2h','4ч':'4h','6ч':'6h','8ч':'8h','12ч':'12h','1д':'1d','3д':'3d','1н':'1w','1мес':'1M'},
  moex:{'1м':1,'10м':10,'1ч':60,'1д':24,'1н':7,'1мес':31,'1кв':4},
  futures:{'1м':1,'10м':10,'1ч':60,'1д':24,'1н':7,'1мес':31,'1кв':4}
};
const TF_DEFAULT={crypto:'1h',moex:60,futures:60};
const DAYS={1:2,5:3,10:7,60:30,240:120,24:480,7:2500,31:2500,4:2500};
const $=id=>document.getElementById(id);
const S={src:'crypto',sym:'BTCUSDT',tf:'1h',data:[],tfCustom:{}};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ============ ОФОРМЛЕНИЕ ============ */
const DEFAULTS={
  bgType:'solid',bgAngle:135,appbg:'#131722',appbg2:'#1e222d',
  panel:'#1e222d',utext:'#d1d4dc',dimtext:'#787b86',border:'#2a2e39',acc:'#2962ff',
  up:'#089981',down:'#f23645',chartBg:'#131722',chartGrid:'#1f2330',
  chartText:'#787b86',chartBorder:'#2a2e39',line:'#2962ff',sma:'#ff9800',ema:'#42a5f5'
};
const BUILTIN={
  dark:{...DEFAULTS},
  light:{bgType:'solid',bgAngle:135,appbg:'#ffffff',appbg2:'#f0f3fa',panel:'#ffffff',utext:'#131722',dimtext:'#6a6d78',border:'#e0e3eb',acc:'#2962ff',up:'#089981',down:'#f23645',chartBg:'#ffffff',chartGrid:'#f0f3fa',chartText:'#6a6d78',chartBorder:'#e0e3eb',line:'#2962ff',sma:'#ff9800',ema:'#2962ff'},
  night:{bgType:'solid',bgAngle:135,appbg:'#0c0f17',appbg2:'#121722',panel:'#121722',utext:'#cfd5e3',dimtext:'#6c768a',border:'#212838',acc:'#4c8dff',up:'#26a69a',down:'#ef5350',chartBg:'#0c0f17',chartGrid:'#161c28',chartText:'#6c768a',chartBorder:'#212838',line:'#4c8dff',sma:'#ffb74d',ema:'#64b5f6'},
  contrast:{bgType:'solid',bgAngle:0,appbg:'#000000',appbg2:'#000000',panel:'#0a0a0a',utext:'#ffffff',dimtext:'#9a9a9a',border:'#333333',acc:'#ffd400',up:'#00ff9d',down:'#ff3b30',chartBg:'#000000',chartGrid:'#1a1a1a',chartText:'#9a9a9a',chartBorder:'#333333',line:'#ffd400',sma:'#ffd400',ema:'#00b0ff'}
};
const BUILTIN_LABEL={dark:'Тёмная',light:'Светлая',night:'Ночная',contrast:'Контраст'};

if(store.get('themeVer',0)<2){store.set('colors',{});store.set('themeVer',2)}
let C={...DEFAULTS,...store.get('colors',{})};
let customs=store.get('presets',{});

/* ============ ГРАФИК ============ */
const chart=createChart($('chart'),{
  layout:{background:{color:C.chartBg},textColor:C.chartText,fontSize:12,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'},
  grid:{vertLines:{color:C.chartGrid},horzLines:{color:C.chartGrid}},
  rightPriceScale:{borderColor:C.chartBorder, scaleMargins:{top:0.1,bottom:0.3}},
  timeScale:{borderColor:C.chartBorder,timeVisible:true,secondsVisible:false},
  crosshair:{mode:0,vertLine:{style:2,width:1,color:'#758696',labelBackgroundColor:'#363a45'},horzLine:{style:2,width:1,color:'#758696',labelBackgroundColor:'#363a45'}},autoSize:true});

let main=null,vol=null;
let drawings=null;
/* Движок рисования (drawings.js) живёт всё время и не пересоздаётся вместе с серией */
drawings=createDrawings({
  chart,wrap:$('wrap'),
  getSeries:()=>main,getBars:()=>S.data,
  storage:store,fmtPrice:n=>fmtPrice(n),
  toast:m=>flash(m),
  onState:()=>syncToolbar()
});

function createSeries(){
  if(main){try{chart.removeSeries(main)}catch(e){}main=null}
  if(vol){try{chart.removeSeries(vol)}catch(e){}vol=null}
  indicators.forEach(ind=>{
    ind.series.forEach(s=>{try{chart.removeSeries(s)}catch(e){}});
  });
  /* пустые панели v5 удаляет сам при удалении последней серии */
  indicators=[];
  main=$('style').value==='c'
    ?chart.addSeries(CandlestickSeries,{upColor:C.up,downColor:C.down,borderVisible:false,wickUpColor:C.up,wickDownColor:C.down,priceScaleId:'right'})
    :chart.addSeries(LineSeries,{color:C.line,lineWidth:2,priceScaleId:'right'});
  vol=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'v'});
  chart.priceScale('v').applyOptions({scaleMargins:{top:.8,bottom:0}});
  vol.applyOptions({visible:volOn});
  drawings.markDirty();
  activeIndicators.forEach(key=>{try{addIndicatorById(key,true)}catch(e){}});
  if(volOn&&!indicators.find(i=>i.id==='volume'))indicators.push({id:'volume',series:[]});
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
  drawings.markDirty();
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
let volOn=store.get('volOn',true);
let activeIndicators=store.get('activeIndicators',['sma20','ema50']);
let favoriteInds=store.get('favoriteInds',[]);

function addIndicatorById(id,silent){
  const exist=indicators.find(i=>i.id===id);
  if(exist)return;
  const ind={id,series:[]};
  if(id==='sma20'){
    ind.series.push(chart.addSeries(LineSeries,{color:C.sma,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'SMA 20',priceScaleId:'right'}));
  }else if(id==='ema50'){
    ind.series.push(chart.addSeries(LineSeries,{color:C.ema,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'EMA 50',priceScaleId:'right'}));
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
    const pi=typeof pane.paneIndex==='function'?pane.paneIndex():chart.panes().length-1;
    ind.series.push(chart.addSeries(LineSeries,{color:'#c47de0',lineWidth:2,priceLineVisible:false,lastValueVisible:false,title:'RSI',priceScaleId:'right'},pi));
    ind.series.push(chart.addSeries(LineSeries,{color:C.down,lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,title:'RSI 70',priceScaleId:'right'},pi));
    ind.series.push(chart.addSeries(LineSeries,{color:C.up,lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,title:'RSI 30',priceScaleId:'right'},pi));
  }else if(id==='macd'){
    const pane=chart.addPane();
    ind.pane=pane;
    const pi=typeof pane.paneIndex==='function'?pane.paneIndex():chart.panes().length-1;
    ind.series.push(chart.addSeries(HistogramSeries,{color:'#6aa5e8',priceLineVisible:false,lastValueVisible:false,title:'MACD hist',priceScaleId:'right'},pi));
    ind.series.push(chart.addSeries(LineSeries,{color:'#e0b04a',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'MACD',priceScaleId:'right'},pi));
    ind.series.push(chart.addSeries(LineSeries,{color:'#e5604d',lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'Signal',priceScaleId:'right'},pi));
  }else if(id==='volume'){volOn=true;store.set('volOn',true);if(vol)vol.applyOptions({visible:true});}
  indicators.push(ind);
  updateIndicator(ind);
  if(!silent){activeIndicators=[...new Set([...activeIndicators,id])];store.set('activeIndicators',activeIndicators);}
  renderIndicatorList();
}

function removeIndicator(id){
  const ind=indicators.find(i=>i.id===id);
  if(!ind)return;
  ind.series.forEach(s=>{try{chart.removeSeries(s)}catch(e){}});
  if(id==='volume'){volOn=false;store.set('volOn',false);if(vol)vol.applyOptions({visible:false});}
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
  indicators.forEach(ind=>{try{
    if(ind.id==='sma20')ind.series[0].applyOptions({color:C.sma});
    else if(ind.id==='ema50')ind.series[0].applyOptions({color:C.ema});
    else if(ind.id==='rsi'){ind.series[1].applyOptions({color:C.down});ind.series[2].applyOptions({color:C.up})}
  }catch(e){}});
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
/* Весь движок — в drawings.js. Ключ хранения привязан к тикеру; движок помнит
   СВОЙ текущий ключ, поэтому flush() всегда пишет под тем тикером, где рисовали
   (раньше ключ строился из уже изменённого S.src и портил данные). */
const drawingsKey=()=>'dr2:'+S.src+':'+S.sym;
function saveDrawings(){drawings.flush()}
function loadDrawings(){drawings.load(drawingsKey())}
addEventListener('pagehide',saveDrawings);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDrawings()});

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

const toolMeta={};
toolGroups.forEach(g=>g.tools.forEach(t=>{toolMeta[t.kind]=t}));
const groupLast={};
function closeToolMenus(){document.querySelectorAll('#drawing-toolbar .drawing-group-menu.open').forEach(m=>m.classList.remove('open'))}
document.addEventListener('click',e=>{if(!e.target.closest('#drawing-toolbar'))closeToolMenus()});
document.addEventListener('touchstart',e=>{if(!e.target.closest('#drawing-toolbar'))closeToolMenus()},{passive:true});
function placeMenu(btn,menu){
  const r=btn.getBoundingClientRect();
  menu.style.left=(r.right+6)+'px';
  const h=menu.offsetHeight;
  menu.style.top=Math.max(8,Math.min(r.top,window.innerHeight-h-8))+'px';
}
const ico=p=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
const IC={
  cursor:ico('<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  magnet:ico('<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/><path d="M6 7h4M14 7h4"/>'),
  lock:ico('<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  undo:ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo:ico('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  eye:ico('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  trash:ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
};
function setupToolbar(){
  const tb=$('drawing-toolbar');tb.innerHTML='';
  const mk=(cls,html,title,fn)=>{
    const b=document.createElement('button');
    b.className=cls;b.innerHTML=html;b.title=title;b.onclick=e=>{e.stopPropagation();fn()};
    tb.appendChild(b);return b;
  };
  mk('cursor-btn',IC.cursor,'Курсор (Esc)',()=>{closeToolMenus();drawings.setTool('cross')});
  mk('magnet-btn',IC.magnet,'Магнит',()=>{drawings.cycleMagnet()});
  mk('keep-btn',IC.lock,'Оставаться в режиме рисования',()=>{drawings.setKeep(!drawings.getKeep())});
  toolGroups.forEach(group=>{
    const g=document.createElement('div');g.className='drawing-group';
    const btn=document.createElement('button');btn.className='group-btn';btn.dataset.group=group.title;
    btn.innerHTML=(groupLast[group.title]||group.tools[0]).icon;btn.title=group.title;
    const menu=document.createElement('div');menu.className='drawing-group-menu';
    group.tools.forEach(t=>{
      const b=document.createElement('button');b.dataset.kind=t.kind;
      b.innerHTML=`<span>${t.icon}</span><span>${t.label}</span>`;
      b.onclick=e=>{e.stopPropagation();groupLast[group.title]=t;btn.innerHTML=t.icon;closeToolMenus();activateTool(t.kind)};
      menu.appendChild(b);
    });
    btn.onclick=e=>{
      e.stopPropagation();
      const was=menu.classList.contains('open');
      closeToolMenus();
      if(!was){menu.classList.add('open');placeMenu(btn,menu)}
    };
    g.append(btn,menu);tb.appendChild(g);
  });
  const sp=document.createElement('div');sp.className='tb-spacer';tb.appendChild(sp);
  mk('undo-btn',IC.undo,'Отменить (Ctrl+Z)',()=>{drawings.undo()});
  mk('redo-btn',IC.redo,'Повторить (Ctrl+Y)',()=>{drawings.redo()});
  mk('hide-btn',IC.eye,'Скрыть / показать рисунки (Ctrl+Alt+H)',()=>{drawings.toggleHidden()});
  mk('clear-btn',IC.trash,'Удалить все рисунки',()=>{
    if(!drawings.count())return;
    if(!confirm('Удалить все рисунки для '+S.sym+'?'))return;
    drawings.clearAll();flash('Все рисунки удалены');
  });
  syncToolbar();
}
function syncToolbar(){
  if(!drawings)return;
  const tb=$('drawing-toolbar');if(!tb)return;
  const tool=drawings.getTool();
  const q=s=>tb.querySelector(s);
  q('.cursor-btn')?.classList.toggle('active',tool==='cross');
  const mg=drawings.getMagnet(),mb=q('.magnet-btn');
  if(mb){
    mb.classList.toggle('active',mg!=='off');
    mb.dataset.lvl=mg==='weak'?'1':mg==='strong'?'2':'';
    mb.title='Магнит: '+({off:'выкл',weak:'слабый',strong:'сильный'}[mg]);
  }
  q('.keep-btn')?.classList.toggle('active',drawings.getKeep());
  q('.hide-btn')?.classList.toggle('active',drawings.isHidden());
  const u=q('.undo-btn'),r=q('.redo-btn');
  if(u)u.disabled=!drawings.canUndo();
  if(r)r.disabled=!drawings.canRedo();
  toolGroups.forEach(group=>{
    const gb=tb.querySelector('.group-btn[data-group="'+group.title+'"]');
    if(gb)gb.classList.toggle('active',group.tools.some(t=>t.kind===tool));
  });
  tb.querySelectorAll('.drawing-group-menu button').forEach(b=>b.classList.toggle('active',b.dataset.kind===tool));
}
function activateTool(kind){
  closeToolMenus();
  drawings.setTool(kind);
}

/* ============ КОНТЕКСТНОЕ МЕНЮ ============ */
const ctxMenu=$('ctxMenu');
function showCtx(x,y){
  ctxMenu.innerHTML='';
  const items=[
    {label:'Индикаторы…',hot:'/',act:openIndicators},
    {label:'Настройки графика…',hot:'',act:openSettings},
    {sep:true},
    {label:'Скрыть / показать рисунки',hot:'Ctrl+Alt+H',act:()=>{drawings.toggleHidden()}},
    {label:'Сбросить масштаб',hot:'',act:()=>{chart.timeScale().fitContent();focusToPrice(S.data.length)}},
    {sep:true},
    {label:'Скопировать тикер',hot:'',act:()=>{navigator.clipboard?.writeText(S.sym);flash('Скопировано: '+S.sym)}},
    {label:'Скриншот',hot:'',act:takeShot}
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
function takeShot(){
  try{
    drawings.render();
    const shot=chart.takeScreenshot();
    const el=chart.chartElement(),wrapEl=$('wrap');
    const r=shot.width/el.clientWidth;
    const out=document.createElement('canvas');out.width=shot.width;out.height=shot.height;
    const c=out.getContext('2d');c.drawImage(shot,0,0);
    const dc=drawings.canvas;
    if(dc&&!drawings.isHidden()){
      const wr=wrapEl.getBoundingClientRect(),cr=el.getBoundingClientRect();
      c.drawImage(dc,(wr.left-cr.left)*r,(wr.top-cr.top)*r,wrapEl.clientWidth*r,wrapEl.clientHeight*r);
    }
    out.toBlob(b=>{
      if(!b){flash('Не удалось сделать скриншот');return}
      const a=document.createElement('a');
      a.href=URL.createObjectURL(b);
      a.download=S.sym+'_'+S.tf+'_'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.png';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      flash('Скриншот сохранён');
    });
  }catch(e){console.warn('[screenshot]',e);flash('Скриншот недоступен')}
}
document.addEventListener('contextmenu',e=>{
  if(e.target.closest('#chart')||e.target.closest('#wrap')){e.preventDefault();showCtx(e.clientX,e.clientY);}
});
document.addEventListener('click',e=>{if(!e.target.closest('#ctxMenu'))hideCtx()});

/* ============ ГОРЯЧИЕ КЛАВИШИ ============ */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('indicatorsModal').classList.contains('hidden')){closeIndicators();return}
  const tag=(e.target.tagName||'').toUpperCase();
  const inInput=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||e.target.isContentEditable;
  if(inInput)return;
  const ctrl=e.ctrlKey||e.metaKey;
  /* физическая клавиша — работает на любой раскладке (в т.ч. русской) */
  const k=/^Key[A-Z]$/.test(e.code||'')?e.code.slice(3).toLowerCase():(e.key||'').toLowerCase();
  if(ctrl&&k==='k'){e.preventDefault();openSearch();return}
  if(!ctrl&&(e.key==='/'||e.code==='Slash')){e.preventDefault();openIndicators();return}
  if(ctrl&&e.shiftKey&&k==='a'){e.preventDefault();$('bottom').classList.toggle('collapsed');return}
  if(ctrl&&e.altKey&&k==='h'){e.preventDefault();drawings.toggleHidden();return}
  if(ctrl&&k==='s'){e.preventDefault();saveDrawings();save();flash('Сохранено');return}
  if(e.key==='Delete'||e.key==='Backspace'){if(drawings.deleteSelected()){e.preventDefault();flash('Фигура удалена')}return}
  if(e.key==='Escape'){drawings.escape();hideCtx();closeSearch();closeIndicators();return}
  if(ctrl&&k==='z'){e.preventDefault();if(e.shiftKey)drawings.redo();else drawings.undo();return}
  if(ctrl&&k==='y'){e.preventDefault();drawings.redo();return}
  if(ctrl&&k==='d'){if(drawings.hasSelection()){e.preventDefault();drawings.duplicate()}return}
  const map={'t':'trend-line','h':'horizontal-line','v':'vertical-line','r':'rectangle','f':'fib-retracement','b':'brush','a':'arrow','l':'long-position','s':'short-position','x':'text'};
  if(map[k]&&!ctrl&&!e.altKey&&!e.metaKey){e.preventDefault();activateTool(map[k]);}
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
  const body=$('screenerBody');const st0=body.scrollTop;body.innerHTML='';
  if(!wl.length){body.innerHTML='<div class="sb-empty">Добавьте тикеры в список</div>';return}
  wl.forEach(w=>{
    const p=px[w.src+':'+w.sym];
    const row=document.createElement('div');row.className='screener-row';
    const price=p?.last!=null?fmtP(p.last):'—';
    const pct=p?.pct!=null?((p.pct>=0?'+':'')+p.pct.toFixed(2)+'%'):'—';
    const pctClass=p?.pct>=0?'up':(p?.pct<0?'down':'');
    const vol=p?.vol!=null?fmtVol(p.vol):'—';
    const srcName={crypto:'Крипто',moex:'MOEX',futures:'Фьюч'}[w.src];
    row.innerHTML=`<span>${esc(w.sym)}</span><span>${price}</span><span class="${pctClass}">${pct}</span><span>${vol}</span><span style="color:var(--dim)">${srcName}</span>`;
    row.onclick=()=>{setSrc(w.src);$('sym').value=w.sym;open_()};
    body.appendChild(row);
  });
  body.scrollTop=st0;
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
    d.innerHTML=`<span class="alert-sym">${esc(a.sym)}</span>
      <span class="alert-cond">${a.cond==='gt'?'выше':'ниже'}</span>
      <span class="alert-price">${a.price}</span>
      ${a.triggered?'<span style="color:var(--up)">✓ сработал</span>':''}
      <button class="alert-x">×</button>`;
    d.querySelector('.alert-x').onclick=()=>{alerts.splice(i,1);store.set('alerts',alerts);renderAlerts()};
    list.appendChild(d);
  });
}
$('alertAdd').onclick=()=>{
  const raw=($('alertSym').value.trim()||S.sym||'').trim();
  const cond=$('alertCond').value;
  const price=parseFloat(($('alertPrice').value||'').replace(',','.'));
  if(!raw||!isFinite(price)){flash('Укажите тикер и цену');return}
  const src=detectSrc(raw);
  const finalSym=src==='crypto'?raw.toUpperCase():raw;
  const cur=px[src+':'+finalSym]?.last;
  if(cur!=null&&((cond==='gt'&&cur>=price)||(cond==='lt'&&cur<=price))){
    flash('Условие уже выполнено: сейчас '+cur);return;
  }
  alerts.push({sym:finalSym,src,cond,price,triggered:false});
  store.set('alerts',alerts);
  /* разрешение на уведомления просим по клику пользователя — иначе браузеры блокируют */
  if('Notification' in window&&Notification.permission==='default'){try{Notification.requestPermission()}catch(e){}}
  $('alertSym').value='';$('alertPrice').value='';
  renderAlerts();
  flash('Алерт добавлен');
  loadPrices();
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

const SI_TTL=864e5;
const siTs={crypto:0,moex:0,futures:0};
const siP={};
function persistIndex(){
  store.set('searchIndex2',{ts:siTs,data:{crypto:searchIndex.crypto,moex:searchIndex.moex,futures:searchIndex.futures}});
}
function refreshSearchModal(){
  const modal=$('searchModal');
  if(modal&&!modal.classList.contains('hidden')){
    const q=($('sbInput').value||'').trim();
    searchResults=searchSymbols(q,searchSrcFilter);
    if(searchActive<0&&searchResults.length)searchActive=0;
    renderSearchResults();
    if(searchResults.length)scheduleQuotes();
  }
}
function loadSrcIndex(s){
  if(siP[s])return siP[s];
  const loader={crypto:loadCryptoIndex,moex:loadMoexSharesIndex,futures:loadFuturesIndex}[s];
  siP[s]=loader().then(arr=>{
    /* пустой ответ не кэшируем — иначе источник «залипает» пустым на сутки */
    if(arr&&arr.length){searchIndex[s]=arr;siTs[s]=Date.now();persistIndex()}
  }).catch(e=>console.warn('[search] '+s+' index failed:',e))
    .finally(()=>{siP[s]=null;refreshSearchModal()});
  return siP[s];
}
async function ensureSearchIndex(){
  if(!searchIndex){
    searchIndex={crypto:[],moex:[],futures:[]};
    const c=store.get('searchIndex2',null);
    if(c&&c.ts&&c.data){
      for(const s of SRC_ORDER){
        if(c.ts[s]&&Date.now()-c.ts[s]<SI_TTL&&Array.isArray(c.data[s])&&c.data[s].length){
          searchIndex[s]=c.data[s];siTs[s]=c.ts[s];
        }
      }
    }
  }
  SRC_ORDER.forEach(s=>{if(!searchIndex[s].length)loadSrcIndex(s)});
  /* поиск ждёт только крипту, MOEX и фьючерсы подгружаются в фоне */
  if(!searchIndex.crypto.length&&siP.crypto)await siP.crypto;
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
        <div class="sb-sym">${esc(r.sym)}</div>
        <div class="sb-name">${esc(r.name)}</div>
      </div>
      <div class="sb-item-price">
        <div class="sb-last dim">—</div>
        <div class="sb-pct"></div>
      </div>
      <button class="sb-add" title="Добавить в список" aria-label="Добавить в список">+</button>`;
    item.onclick=()=>selectSearchResult(r);
    item.querySelector('.sb-add').onclick=e=>{e.stopPropagation();addWl(r.src,r.sym)};
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
async function binanceKlines(sym,tf,endTime){
  let q=`/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(tf)}&limit=500`;
  if(endTime)q+='&endTime='+endTime;
  let r;
  try{r=await fetchTO('https://data-api.binance.vision'+q,8000)}
  catch(e){r=await fetchTO('https://api.binance.com'+q,8000)}
  if(!r.ok)throw new Error('Binance: '+sym+' ('+tf+') не найден или интервал не поддерживается');
  return (await r.json()).map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
}
/* время MOEX (МСК) храним как «UTC»-секунды, так же и форматируем обратно */
const moexDt=sec=>new Date(sec*1000).toISOString().slice(0,19).replace('T',' ');
async function fetchMoex(short){
  const base=S.src==='futures'?`https://iss.moex.com/iss/engines/futures/markets/forts/securities/${S.sym}/candles.json`:`https://iss.moex.com/iss/engines/stock/markets/shares/securities/${S.sym}/candles.json`;
  const L=S.data[S.data.length-1];
  const iv=tfSeconds(S.src,S.tf)||3600;
  let from;
  if(short&&L){
    /* опрос: берём только хвост (последние ~3 интервала), а не 3 дня — ISS отдаёт максимум 500 свечей на страницу */
    from=moexDt(Math.max(0,L.time-3*iv));
    if(+S.tf>=24)from=from.slice(0,10);
  }else{
    const days=short?(+S.tf===7?14:3):(DAYS[+S.tf]||30);
    from=new Date(Date.now()-days*864e5).toISOString().slice(0,10);
  }
  const rows=[];let cols=null,start=0;
  for(let page=0;page<12;page++){
    const r=await fetchTO(`${base}?interval=${S.tf}&from=${encodeURIComponent(from)}&start=${start}`,10000);
    if(!r.ok)throw new Error(S.src==='futures'?'MOEX (фьючерсы) недоступен':'MOEX недоступен');
    const j=await r.json();
    cols=j.candles.columns;
    const data=j.candles.data;
    for(const x of data)rows.push(x);
    if(short||data.length<500)break;
    start+=data.length;
  }
  if(!rows.length){
    if(short)return[];   /* выходной/праздник — это не «нет связи» */
    throw new Error('Нет данных по '+S.sym);
  }
  const ix=n=>cols.indexOf(n);
  const out=[];
  for(const x of rows){
    const open=x[ix('open')],high=x[ix('high')],low=x[ix('low')],close=x[ix('close')],volume=x[ix('volume')]||0;
    if(open==null||high==null||low==null||close==null)continue;
    out.push({time:Date.parse(x[ix('begin')].replace(' ','T')+'Z')/1000,open,high,low,close,volume});
  }
  out.sort((a,b)=>a.time-b.time);
  return out.filter((b,i)=>i===0||b.time!==out[i-1].time);
}
async function fetchBars(short){
  if(S.src==='crypto')return binanceKlines(S.sym,S.tf);
  return fetchMoex(short);
}

function err(m){const e=$('err');e.textContent=m;e.style.display=m?'block':'none'}
function focusToPrice(len){
  if(!len)return;
  const N=mq.matches?80:120;const visible=Math.min(N,len);
  const apply=()=>{try{chart.timeScale().setVisibleLogicalRange({from:Math.max(0,len-visible),to:len+2})}catch(e){try{chart.timeScale().fitContent()}catch(_){}}};
  requestAnimationFrame(()=>requestAnimationFrame(apply));
}
let seq=0;
let histLoading=false,histDone=false;
async function load(first){
  const my=++seq;
  histDone=false;
  /* сразу гасим старый live — иначе его свечи/цены попадут в новый тикер и алерты */
  if(first)stopLive();
  try{
    const d=await fetchBars();
    if(my!==seq)return;
    err('');S.data=d;paint();
    focusToPrice(d.length);
    if(first)live();
    legend(d[d.length-1],d[d.length-2]);
  }catch(e){
    if(first&&my===seq){
      S.data=[];paint();
      err(e.message||'Ошибка загрузки');setStatus('нет данных',false);
    }
  }
}

/* дозагрузка истории при прокрутке влево (крипта) */
async function loadOlder(){
  if(histLoading||histDone||S.src!=='crypto'||!S.data.length||S.data.length>=5000)return;
  histLoading=true;
  const my=seq,sym=S.sym,tf=S.tf,firstT=S.data[0].time;
  try{
    const arr=await binanceKlines(sym,tf,firstT*1000-1);
    if(my!==seq||sym!==S.sym||tf!==S.tf)return;
    if(!arr.length){histDone=true;return}
    const rng=chart.timeScale().getVisibleLogicalRange();
    S.data=arr.filter(b=>b.time<firstT).concat(S.data);
    paint();
    if(rng)chart.timeScale().setVisibleLogicalRange({from:rng.from+arr.length,to:rng.to+arr.length});
    if(arr.length<500)histDone=true;
  }catch(e){}
  finally{histLoading=false}
}
chart.timeScale().subscribeVisibleLogicalRangeChange(r=>{if(r&&r.from<15)loadOlder()});

/* ============ ТАЙМЕР ============ */
const IV={
  crypto:{'1s':1,'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'6h':21600,'8h':28800,'12h':43200,'1d':86400,'3d':259200,'1w':604800,'1M':2592000},
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
  const ref=p?p.close:b.open,ch=b.close-ref,pc=ref?ch/ref*100:0,dir=ch>=0?'up':'down';
  const f=n=>n>=100?n.toFixed(2):n.toPrecision(5).replace(/\.?0+$/,'');
  const ex={crypto:'Binance',moex:'MOEX',futures:'MOEX · FORTS'}[S.src]||'';
  const sg=ch>=0?'+':'−';
  $('legend').innerHTML=`<div class="lg-title"><b>${esc(S.sym)}</b><span class="lg-dot">·</span><span class="lg-tf">${esc(tfLabel(S.src,S.tf))}</span><span class="lg-dot">·</span><span class="lg-ex">${ex}</span></div>`
    +`<div class="lg-ohlc ${dir}"><span><i>O</i>${f(b.open)}</span><span><i>H</i>${f(b.high)}</span><span><i>L</i>${f(b.low)}</span><span><i>C</i>${f(b.close)}</span><span>${sg}${f(Math.abs(ch))} (${sg}${Math.abs(pc).toFixed(2)}%)</span></div>`;
}
function barIndex(t){
  let lo=0,hi=S.data.length-1;
  while(lo<=hi){const m=(lo+hi)>>1,v=S.data[m].time;if(v===t)return m;if(v<t)lo=m+1;else hi=m-1}
  return -1;
}
chart.subscribeCrosshairMove(p=>{
  const n=S.data.length;if(!n)return;
  if(!p.time){legend(S.data[n-1],S.data[n-2]);return}
  const i=barIndex(p.time);
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
let indT=0;
function scheduleInd(){
  if(indT)return;
  indT=setTimeout(()=>{indT=0;indicators.forEach(ind=>updateIndicator(ind))},300);
}
function stopLive(){
  liveId++;
  if(ws){ws.onclose=null;try{ws.close()}catch(e){}ws=null}
  clearInterval(poll);poll=null;
}
function applyBar(b){
  const L=S.data[S.data.length-1];
  if(L&&b.time<L.time)return;
  if(L&&b.time===L.time)S.data[S.data.length-1]=b;else S.data.push(b);
  if(main)main.update(val(b));
  if(vol)vol.update({time:b.time,value:b.volume,color:b.close>=b.open?C.up+'55':C.down+'55'});
  scheduleInd();
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
  const changed=S.src!==s;
  S.src=s;
  $('srcB').classList.toggle('on',s==='crypto');
  $('srcM').classList.toggle('on',s==='moex');
  $('srcF').classList.toggle('on',s==='futures');
  if(changed)S.tf=TF_DEFAULT[s];
}
$('srcB').onclick=()=>{setSrc('crypto');$('sym').value='BTCUSDT';open_()};
$('srcM').onclick=()=>{setSrc('moex');$('sym').value='SBER';open_()};
$('srcF').onclick=()=>{setSrc('futures');$('sym').value='SiZ6';open_()};

function open_(){
  if(mq.matches)view('chart');
  saveDrawings();
  const raw=$('sym').value.trim();
  S.sym=raw?(S.src==='crypto'?raw.toUpperCase():raw):S.sym;
  buildTf();createSeries();loadDrawings();load(true);save();markWl();
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
  stopLive();
  view('list');loadPrices();
}
$('back').onclick=()=>{if(history.state&&history.state.c)history.back();else goList()};
addEventListener('popstate',()=>{if(mq.matches&&document.body.classList.contains('m-chart'))goList()});

const px={};
const fmtP=n=>n==null?'':n>=100?n.toFixed(2):String(+n.toPrecision(5));
const wlShown={};
const wlKey=w=>w.src+':'+w.sym;
function markWl(){
  const cur=S.src+':'+S.sym;
  document.querySelectorAll('#wl .wl').forEach(r=>r.classList.toggle('active',r.dataset.key===cur));
}
function addWl(src,sym){
  if(wl.some(w=>w.sym===sym&&w.src===src)){flash('Уже в списке: '+sym);return false}
  wl.push({src,sym});store.set('wl',wl);renderWl();loadPrices();flash('Добавлено: '+sym);
  return true;
}
function renderWl(){
  const wc=$('watchCount');
  if(wc)wc.textContent=wl.length;
  const wlEl=$('wl'),st=wlEl.scrollTop;
  wlEl.innerHTML='';
  if(!wl.length){
    wlEl.innerHTML='<div class="wl-empty">Список пуст.<br>Найдите инструмент через поиск и нажмите «＋»</div>';
    renderScreener();return;
  }
  const EXN={crypto:'Binance',moex:'MOEX',futures:'FORTS'};
  wl.forEach((w,i)=>{
    const key=wlKey(w),p=px[key],has=p&&p.last!=null;
    let fl='';
    if(has){
      const prev=wlShown[key];
      if(prev!=null&&p.last!==prev)fl=p.last>prev?' fl-up':' fl-down';
      wlShown[key]=p.last;
    }
    const pct=has&&p.pct!=null?+p.pct:null;
    const d=document.createElement('div');
    d.className='wl';d.dataset.key=key;
    d.innerHTML=`<div class="wl-sym"><span class="wl-t">${esc(w.sym)}</span><span class="wl-src">${EXN[w.src]||''}</span></div>`
      +`<div class="wl-r"><span class="wl-last${fl}">${has?fmtP(p.last):'—'}</span><span class="wl-pct ${pct==null?'':pct>=0?'up':'down'}">${pct==null?'':(pct>=0?'+':'−')+Math.abs(pct).toFixed(2)+'%'}</span></div>`
      +`<button class="x" title="Удалить" aria-label="Удалить">×</button>`;
    d.onclick=()=>{setSrc(w.src);$('sym').value=w.sym;open_()};
    d.querySelector('.x').onclick=e=>{e.stopPropagation();wl.splice(i,1);store.set('wl',wl);renderWl()};
    wlEl.append(d);
  });
  wlEl.scrollTop=st;
  markWl();
  renderScreener();
}
async function loadPrices(){
  /* список наблюдения + тикеры активных алертов (иначе алерт не сработает, пока тикер не открыт) */
  const items=[...wl];
  alerts.filter(a=>!a.triggered).forEach(a=>{
    const src=a.src||detectSrc(a.sym);
    if(!items.some(w=>w.sym===a.sym&&w.src===src))items.push({src,sym:a.sym});
  });
  const cr=items.filter(w=>w.src==='crypto').map(w=>w.sym);
  const mo=items.filter(w=>w.src==='moex').map(w=>w.sym);
  const fu=items.filter(w=>w.src==='futures').map(w=>w.sym);
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
  items.forEach(w=>{
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
  if(mq.matches){openSearch();return}
  const t=($('sym').value.trim())||S.sym;
  if(!t)return;
  const src=detectSrc(t);
  addWl(src,src==='crypto'?t.toUpperCase():t);
};
function save(){store.set('last',{src:S.src,sym:S.sym,tf:S.tf})}

/* ============ СТАРТ ============ */
const last=store.get('last',null);
S.tfCustom=store.get('tfCustom',{});
if(last){setSrc(last.src);S.sym=last.sym;S.tf=last.tf;$('sym').value=last.sym}
buildTf();renderWl();renderPresets();renderAlerts();
setupToolbar();createSeries();loadDrawings();applyColors();
if(mq.matches)view('list');else load(true);
loadPrices();
setInterval(()=>{if(!document.hidden&&(!mq.matches||document.body.classList.contains('m-list')))loadPrices()},10000);