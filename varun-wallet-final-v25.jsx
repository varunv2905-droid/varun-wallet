import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DEF_RATE = 22.7;

const DEF_VAR_CATS = [
  {id:"food",         label:"Food & Dining",  icon:"🍽️", color:"#FF6B6B"},
  {id:"groceries",    label:"Groceries",      icon:"🛒",  color:"#F7DC6F"},
  {id:"shopping",     label:"Shopping",       icon:"🛍️", color:"#C39BD3"},
  {id:"transport",    label:"Transport",      icon:"🚗",  color:"#82E0AA"},
  {id:"entertain",    label:"Entertainment",  icon:"🎬",  color:"#F0B27A"},
  {id:"health",       label:"Health",         icon:"💊",  color:"#FF8B94"},
  {id:"loan_friend",  label:"Loan to Friend", icon:"🤝",  color:"#85C1E9"},
  {id:"other",        label:"Other",          icon:"📦",  color:"#ABB2B9"},
];
const DEF_FIXED_CATS = [
  {id:"rent",    label:"Rent",            icon:"🏠", color:"#4ECDC4", defCur:"AED", defDue:1},
  {id:"eduloan", label:"Education Loan",  icon:"🎓", color:"#F1948A", defCur:"INR", defDue:5},
  {id:"sip",     label:"SIP/Investment",  icon:"📈", color:"#82E0AA", defCur:"INR", defDue:10},
];
const DEF_INCOME_CATS = [
  {id:"salary",   label:"Salary",   icon:"💼", defCur:"AED"},
  {id:"freelance",label:"Freelance",icon:"🖥️", defCur:"AED"},
  {id:"other_inc",label:"Other",    icon:"💵", defCur:"AED"},
];

const BADGE_DEFS = [
  {id:"b1",icon:"📝",label:"First Entry",    desc:"Logged your first expense",        check:(e)=>e.length>=1},
  {id:"b2",icon:"💰",label:"20% Saver",      desc:"Saved 20 percent or more",         check:(_,s)=>s.savingsRate>=20},
  {id:"b3",icon:"🏆",label:"30% Saver",      desc:"Saved 30 percent or more",         check:(_,s)=>s.savingsRate>=30},
  {id:"b4",icon:"⚡",label:"3-Day Streak",   desc:"3 spend-free days in a row",       check:(_,s)=>s.streak>=3},
  {id:"b5",icon:"🔥",label:"Week Warrior",   desc:"7 spend-free days in a row",       check:(_,s)=>s.streak>=7},
  {id:"b6",icon:"✅",label:"Budget Boss",    desc:"All categories within budget",     check:(_,s)=>s.allUnderBudget},
  {id:"b7",icon:"🎯",label:"Goal Setter",    desc:"Set your first savings goal",      check:(_,s)=>s.goalSet},
  {id:"b8",icon:"🌟",label:"A-Grade Month",  desc:"Achieved A or A+ score",           check:(_,s)=>["A","A+"].includes(s.grade)},
];

const TIPS = [
  "The 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
  "Automating your SIP on payday means you save before you spend.",
  "AED 10 saved daily = AED 3,650 per year.",
  "Review subscriptions monthly — unused ones are silent budget killers.",
  "UAE has no income tax. Maximise savings here.",
  "An emergency fund of 3 to 6 months of expenses gives peace of mind.",
  "Tracking spending is the first step — awareness precedes change.",
  "Paying education loan early reduces total interest significantly.",
];

// ─── STORAGE ──────────────────────────────────────────────────────────────────
// Safe localStorage wrapper — works even if storage is unavailable/blocked
// Safe storage — tested once at startup, null if unavailable
const _storage=(()=>{
  try{
    if(typeof window==="undefined"||!window.localStorage) return null;
    window.localStorage.setItem("_vw_test","1");
    window.localStorage.removeItem("_vw_test");
    return window.localStorage;
  }catch(_){ return null; }
})();
const sk  = (t,m,y) => `vw_${t}_${m}_${y}`;
const skG = t       => `vw_g_${t}`;
const ls  = (k,d)   => { try { if(!_storage) return d; const v=_storage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } };
const lss = (k,v)   => { try { if(_storage) _storage.setItem(k,JSON.stringify(v)); } catch {} };

// ─── MATH ─────────────────────────────────────────────────────────────────────
const toAED  = (a,c,r) => c==="AED" ? Number(a) : Number(a)/Math.max(Number(r),0.001);
const fmtAED = (aed,dc,r) => dc==="INR"
  ? "₹"+Math.round(aed*r).toLocaleString("en-IN")
  : "AED "+Number(aed).toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtNat = (a,c) => c==="INR"
  ? "₹"+Math.round(a).toLocaleString("en-IN")
  : "AED "+Number(a).toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});

function calcScore(sr,bp,st){
  let s=0;
  if(sr>=30)s+=40; else if(sr>=20)s+=30; else if(sr>=10)s+=20; else if(sr>0)s+=10;
  if(bp<=70)s+=40; else if(bp<=85)s+=30; else if(bp<=100)s+=20;
  if(st>=7)s+=20;  else if(st>=3)s+=10;  else if(st>=1)s+=5;
  const grade=s>=85?"A+":s>=75?"A":s>=65?"B+":s>=55?"B":s>=45?"C":"D";
  const color=s>=75?"#34d399":s>=55?"#F7DC6F":s>=40?"#F0B27A":"#FF6B6B";
  return {score:s,grade,color};
}

function doExport(data){
  const {month,year,expenses,fixedCats,fixedData,incomeData,incomeCats,varCats,budgets,rate,goal,loans}=data;
  const q=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
  const row=cells=>cells.map(q).join(",")+"\r\n";
  let out="";
  const sep="\r\n========================================\r\n\r\n";

  // Summary
  const incT=incomeCats.reduce((s,c)=>s+toAED(incomeData[c.id]?.amount||0,incomeData[c.id]?.currency||"AED",rate),0);
  const fixT=fixedCats.reduce((s,c)=>s+toAED(fixedData[c.id]?.amount||0,fixedData[c.id]?.currency||"AED",rate),0);
  const varT=expenses.reduce((s,e)=>s+toAED(e.amount,e.currency||"AED",rate),0);
  const sav=incT-fixT-varT;
  out+="SUMMARY\r\n";
  out+=row(["Period",MONTHS[month]+" "+year]);
  out+=row(["Rate","1 AED = "+rate+" INR"]);
  out+=row(["Income AED",incT.toFixed(2)]);
  out+=row(["Fixed AED",fixT.toFixed(2)]);
  out+=row(["Variable AED",varT.toFixed(2)]);
  out+=row(["Savings AED",sav.toFixed(2)]);
  out+=row(["Savings Rate",incT>0?((sav/incT)*100).toFixed(1)+"%":"0%"]);
  out+=sep;

  // Expenses
  out+="EXPENSES\r\n";
  out+=row(["Date","Category","Note","Amount","Currency","AED"]);
  expenses.forEach(e=>{ out+=row([e.date,e.catLabel||e.category,e.note||"",e.amount,e.currency,toAED(e.amount,e.currency||"AED",rate).toFixed(2)]); });
  out+=sep;

  // Budget vs Actual
  out+="BUDGET VS ACTUAL\r\n";
  out+=row(["Category","Budget AED","Spent AED","Remaining","Status"]);
  varCats.forEach(c=>{
    const sp=expenses.filter(e=>e.category===c.id).reduce((s,e)=>s+toAED(e.amount,e.currency||"AED",rate),0);
    const bg=Number(budgets[c.id])||0;
    out+=row([c.label,bg.toFixed(2),sp.toFixed(2),(bg-sp).toFixed(2),bg>0?(sp>bg?"OVER":sp/bg>=0.8?"NEAR":"OK"):"No limit"]);
  });
  out+=sep;

  // Fixed
  out+="FIXED EXPENSES\r\n";
  out+=row(["Category","Amount","Currency","AED Equiv","Due Day"]);
  fixedCats.forEach(c=>{
    const f=fixedData[c.id];
    if(f?.amount>0) out+=row([c.label,f.amount,f.currency,toAED(f.amount,f.currency||"AED",rate).toFixed(2),f.dueDay||"-"]);
  });
  out+=sep;

  // Income
  out+="INCOME\r\n";
  out+=row(["Source","Amount","Currency","AED Equiv"]);
  incomeCats.forEach(c=>{
    const v=incomeData[c.id];
    if(v?.amount>0) out+=row([c.label,v.amount,v.currency,toAED(v.amount,v.currency||"AED",rate).toFixed(2)]);
  });

  if(loans?.length){
    out+=sep;
    out+="LOANS\r\n";
    out+=row(["Name","Amount","Currency","Date","Status"]);
    loans.forEach(l=>{ out+=row([l.name,l.amount,l.currency,l.date,l.repaid?"Repaid":"Pending"]); });
  }

  const blob=new Blob([out],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="VarunWallet_"+MONTHS[month]+"_"+year+".txt";
  a.click();
  URL.revokeObjectURL(url);
}

function doBackup(){
  const data={exportedAt:new Date().toISOString(),records:{}};
  try{
    if(_storage){
      for(let i=0;i<_storage.length;i++){
        try{
          const k=_storage.key(i);
          if(k&&k.startsWith("vw_")) data.records[k]=JSON.parse(_storage.getItem(k));
        }catch{}
      }
    }
  }catch{}
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="VarunWallet_Backup_"+new Date().toISOString().slice(0,10)+".json";
  a.click();
  URL.revokeObjectURL(url);
  return Object.keys(data.records).length;
}

function doRestore(file,cb){
  const r=new FileReader();
  r.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.records) throw new Error("Invalid backup file");
      let count=0;
      Object.entries(data.records).forEach(([k,v])=>{
        try{ if(_storage) _storage.setItem(k,JSON.stringify(v)); count++; }catch{}
      });
      cb(null,count);
    }catch(err){ cb(err.message); }
  };
  r.readAsText(file);
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function PBar({pct,color,h=5,theme}){
  const w=Math.min(Math.max(pct||0,0),100);
  const track=theme==="light"?"rgba(0,0,0,.08)":"rgba(255,255,255,.08)";
  return (
    <div style={{height:h,background:track,borderRadius:99,overflow:"hidden"}}>
      <div style={{height:"100%",width:w+"%",background:color,borderRadius:99,transition:"width .6s ease"}}/>
    </div>
  );
}

function Ring({pct,color,size,stroke,label,sub,theme}){
  const s=size||80, st=stroke||8;
  const r=s/2-st, circ=2*Math.PI*r;
  const dash=(Math.min(Math.max(pct||0,0),100)/100)*circ;
  const trackColor=theme==="light"?"rgba(0,0,0,.1)":"rgba(255,255,255,.08)";
  const textColor =theme==="light"?"#1a1a2a":"#e8e4f0";
  const subColor  =theme==="light"?"#888"    :"#888";
  return (
    <svg width={s} height={s}>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={trackColor} strokeWidth={st}/>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={color} strokeWidth={st}
        strokeDasharray={dash+" "+circ} strokeLinecap="round"
        transform={"rotate(-90 "+(s/2)+" "+(s/2)+")"}
        style={{transition:"stroke-dasharray .7s ease"}}/>
      {label&&<text x={s/2} y={s/2-(sub?4:0)} textAnchor="middle" fill={textColor} fontSize={s>70?11:9} fontWeight="800">{label}</text>}
      {sub&&<text x={s/2} y={s/2+9} textAnchor="middle" fill={subColor} fontSize={7}>{sub}</text>}
    </svg>
  );
}

function Pie({slices,center,theme}){
  const dark=theme!=="light";
  const bgFill   = dark?"#0d0d18":"#ffffff";
  const textFill = dark?"#888"   :"#555";
  const lblColor = dark?"#999"   :"#555";
  const pctColor = dark?"#e8e4f0":"#1a1a2a";
  const stroke   = dark?"#0d0d18":"#ffffff";

  const total=slices.reduce((s,d)=>s+d.v,0);
  if(!total) return <div style={{textAlign:"center",padding:"16px 0",color:lblColor,fontSize:12}}>No data yet</div>;
  let a=-Math.PI/2;
  const cx=85,cy=85,R=68,ri=40;
  const paths=slices.filter(d=>d.v>0).map(d=>{
    const ang=(d.v/total)*2*Math.PI;
    const x1=cx+R*Math.cos(a),y1=cy+R*Math.sin(a); a+=ang;
    const x2=cx+R*Math.cos(a),y2=cy+R*Math.sin(a);
    const ix1=cx+ri*Math.cos(a-ang),iy1=cy+ri*Math.sin(a-ang);
    const ix2=cx+ri*Math.cos(a),iy2=cy+ri*Math.sin(a);
    const lg=ang>Math.PI?1:0;
    return {...d,
      path:"M"+x1+" "+y1+"A"+R+" "+R+" 0 "+lg+" 1 "+x2+" "+y2+"L"+ix2+" "+iy2+"A"+ri+" "+ri+" 0 "+lg+" 0 "+ix1+" "+iy1+"Z",
      pct:((d.v/total)*100).toFixed(1)
    };
  });
  return (
    <div style={{display:"flex",gap:14,alignItems:"center"}}>
      <svg width="170" height="170" style={{flexShrink:0}}>
        {paths.map((p,i)=><path key={i} d={p.path} fill={p.color} stroke={stroke} strokeWidth="2"/>)}
        <circle cx={cx} cy={cy} r={ri-1} fill={bgFill}/>
        {center&&<text x={cx} y={cy+4} textAnchor="middle" fill={textFill} fontSize="9">{center}</text>}
      </svg>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:7}}>
        {paths.map((p,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:p.color,flexShrink:0}}/>
            <div style={{flex:1,fontSize:11,color:lblColor}}>{p.label}</div>
            <div style={{fontSize:11,fontWeight:700,color:pctColor}}>{p.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({months,theme}){
  const dark=theme!=="light";
  const gridColor=dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.08)";
  const labelColor=dark?"#444":"#888";
  const curColor  =dark?"#9b87ff":"#7c6aff";
  const maxV=Math.max(...months.flatMap(m=>[m.spent||0,m.income||0]),1);
  const H=110,bw=13,gap=5,W=300,slotW=W/months.length;
  return (
    <svg width="100%" viewBox={"0 0 "+W+" "+(H+30)} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id="gSpent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9b87ff"/>
          <stop offset="100%" stopColor="#6c63ff"/>
        </linearGradient>
        <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399"/>
          <stop offset="100%" stopColor="#059669"/>
        </linearGradient>
      </defs>
      {[0,.5,1].map(p=>{
        const y=H-p*H;
        return (
          <g key={p}>
            <line x1={0} y1={y} x2={W} y2={y} stroke={gridColor} strokeWidth="1"/>
            <text x={2} y={y-3} fill={labelColor} fontSize="8">
              {maxV*p>=1000?((maxV*p)/1000).toFixed(0)+"k":(maxV*p).toFixed(0)}
            </text>
          </g>
        );
      })}
      {months.map((m,i)=>{
        const cx=slotW*i+slotW/2;
        const spH=Math.max(((m.spent||0)/maxV)*H,m.spent>0?2:0);
        const inH=Math.max(((m.income||0)/maxV)*H,m.income>0?2:0);
        const buH=m.budget>0?Math.min((m.budget/maxV)*H,H):0;
        const over=m.spent>m.budget&&m.budget>0;
        return (
          <g key={i}>
            {buH>0&&<line x1={cx-bw-gap/2-1} y1={H-buH} x2={cx+bw+gap/2+1} y2={H-buH} stroke="rgba(108,99,255,.4)" strokeWidth="1" strokeDasharray="3,2"/>}
            <rect x={cx-bw-gap/2} y={H-spH} width={bw} height={spH} rx="3" fill={over?"#FF6B6B":"url(#gSpent)"} opacity={m.cur?1:.45}/>
            <rect x={cx+gap/2}    y={H-inH} width={bw} height={inH} rx="3" fill="url(#gIncome)" opacity={m.cur?1:.45}/>
            <text x={cx} y={H+14} textAnchor="middle" fill={m.cur?curColor:labelColor} fontSize="9" fontWeight={m.cur?"700":"400"}>{m.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Calendar({expenses,month,year,dc,rate,varCats,onNav,theme}){
  const dark=theme!=="light";
  const calTxt   =dark?"#e8e4f0":"#1a1a2a";
  const calSub   =dark?"#888"   :"#666";
  const calDim   =dark?"#444"   :"#bbb";
  const calCell  =dark?"rgba(255,255,255,.04)":"rgba(0,0,0,.04)";
  // Local style objects — Calendar cannot access App-scoped ifield/lbl/navBtn/smallBtn
  const ifield={width:"100%",background:dark?"rgba(0,0,0,.3)":"rgba(0,0,0,.06)",border:"1px solid "+(dark?"rgba(255,255,255,.12)":"rgba(0,0,0,.12)"),borderRadius:10,padding:"9px 12px",color:dark?"#e8e4f0":"#1a1a2a",fontSize:13,fontFamily:"inherit",outline:"none"};
  const lbl={fontSize:10,color:dark?"#666":"#888",fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",marginBottom:5,display:"block"};
  const navBtn={background:dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)",border:"1px solid "+(dark?"rgba(255,255,255,.1)":"rgba(0,0,0,.1)"),color:dark?"#e8e4f0":"#1a1a2a",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
  const smallBtn={background:dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)",border:"1px solid "+(dark?"rgba(255,255,255,.12)":"rgba(0,0,0,.1)"),borderRadius:8,padding:"5px 12px",color:dark?"#888":"#666",cursor:"pointer",fontSize:10,fontWeight:700};
  const [calM,setCalM]=useState(month);
  const [calY,setCalY]=useState(year);
  const [selDay,setSelDay]=useState(null);
  const [showJump,setShowJump]=useState(false);
  const [jM,setJM]=useState(String(month+1));
  const [jY,setJY]=useState(String(year));

  useEffect(()=>{ setCalM(month); setCalY(year); setSelDay(null); },[month,year]);

  const today=new Date();
  const todayD=today.getDate(), todayM=today.getMonth(), todayY=today.getFullYear();
  const isCurM=calM===todayM&&calY===todayY;
  const dim=new Date(calY,calM+1,0).getDate();
  const fd=new Date(calY,calM,1).getDay();

  const calExps=useMemo(()=>{
    if(calM===month&&calY===year) return expenses;
    return ls(sk("exp",calM,calY),[]);
  },[calM,calY,month,year,expenses]);

  const dayMap=useMemo(()=>{
    const m={};
    for(let d=1;d<=dim;d++){
      const ds=calY+"-"+String(calM+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
      const exps=calExps.filter(e=>e.date===ds);
      m[d]={total:exps.reduce((s,e)=>s+toAED(e.amount,e.currency||"AED",rate),0),exps,ds};
    }
    return m;
  },[calExps,calM,calY,dim,rate]);

  const maxDay=useMemo(()=>Math.max(...Object.values(dayMap).map(d=>d.total),1),[dayMap]);

  const cells=[];
  for(let i=0;i<fd;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  const weeks=[];
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));

  function prevCal(){ let m=calM-1,y=calY; if(m<0){m=11;y--;} setCalM(m);setCalY(y);setSelDay(null);onNav(m,y); }
  function nextCal(){ let m=calM+1,y=calY; if(m>11){m=0;y++;} setCalM(m);setCalY(y);setSelDay(null);onNav(m,y); }
  function goToday(){ setCalM(todayM);setCalY(todayY);setSelDay(todayD);onNav(todayM,todayY); }
  function jump(){
    const m=parseInt(jM)-1,y=parseInt(jY);
    if(isNaN(m)||isNaN(y)||m<0||m>11||y<2000||y>2100) return;
    setCalM(m);setCalY(y);setSelDay(null);setShowJump(false);onNav(m,y);
  }

  const sel=selDay?dayMap[selDay]:null;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button onClick={prevCal} style={navBtn}>&#8249;</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:calTxt}}>{MONTHS[calM]} {calY}</div>
        </div>
        <button onClick={nextCal} style={navBtn}>&#8250;</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={()=>setShowJump(s=>!s)} style={{...smallBtn,flex:1}}>
          Jump to date
        </button>
        {!isCurM&&<button onClick={goToday} style={{...smallBtn,color:"#a78bfa",borderColor:"#7c6aff44"}}>Today</button>}
      </div>

      {showJump&&(
        <div style={{background:dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)",borderRadius:12,padding:"10px",marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:7,alignItems:"flex-end"}}>
            <div>
              <div style={lbl}>Month</div>
              <select value={jM} onChange={e=>setJM(e.target.value)} style={ifield}>
                {MONTHS.map((ml,i)=><option key={i} value={i+1}>{ml}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Year</div>
              <input type="number" min="2020" max="2100" value={jY} onChange={e=>setJY(e.target.value)} onKeyDown={e=>e.key==="Enter"&&jump()} style={ifield}/>
            </div>
            <button onClick={jump} style={{background:"linear-gradient(135deg,#7c6aff,#c084fc)",border:"none",borderRadius:9,padding:"8px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>Go</button>
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["S","M","T","W","T","F","S"].map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:9,color:"#555",fontWeight:600}}>{d}</div>
        ))}
      </div>

      {weeks.map((week,wi)=>(
        <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
          {Array(7).fill(null).map((_,di)=>{
            const d=week[di];
            if(!d) return <div key={di}/>;
            const data=dayMap[d];
            const has=data?.total>0;
            const intensity=has?Math.min(data.total/maxDay,1):0;
            const isToday=d===todayD&&isCurM;
            const isSel=d===selDay;
            const bg=isSel?"linear-gradient(135deg,#7c6aff,#c084fc)":has?"rgba(124,106,255,"+(0.15+intensity*0.75)+")":calCell;
            return (
              <div key={di} onClick={()=>setSelDay(d===selDay?null:d)}
                style={{background:bg,border:"2px solid "+(isSel?"transparent":isToday?"#7c6aff":"transparent"),borderRadius:8,padding:"4px 2px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,minHeight:44,transition:"all .15s"}}>
                <div style={{fontSize:11,fontWeight:isToday||isSel?800:400,color:isSel?"#fff":isToday?"#a78bfa":has?calTxt:calDim}}>{d}</div>
                {has&&<div style={{fontSize:8,color:isSel?"rgba(255,255,255,.9)":"#c084fc",fontWeight:700}}>
                  {data.total>=1000?((data.total/1000).toFixed(1))+"k":data.total.toFixed(0)}
                </div>}
                {isToday&&!isSel&&<div style={{width:4,height:4,borderRadius:"50%",background:"#7c6aff"}}/>}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{display:"flex",alignItems:"center",gap:5,marginTop:8,fontSize:9,color:calSub}}>
        <span>Low</span>
        {[.2,.4,.6,.8,.95].map(v=>(
          <div key={v} style={{width:10,height:10,borderRadius:3,background:"rgba(124,106,255,"+(0.15+v*.75)+")"}}/>
        ))}
        <span>High</span>
        <span style={{marginLeft:"auto"}}>Tap day</span>
      </div>

      {selDay&&sel&&(
        <div style={{background:dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.04)",borderRadius:14,padding:"14px",marginTop:10,border:"1px solid "+(dark?"rgba(255,255,255,.1)":"rgba(0,0,0,.1)")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:calTxt}}>
                {DAYS[new Date(calY,calM,selDay).getDay()]}, {MONTHS[calM]} {selDay}
              </div>
              {isCurM&&selDay===todayD&&<div style={{fontSize:9,color:"#7c6aff",fontWeight:700,marginTop:2}}>Today</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:calSub}}>Total</div>
              <div style={{fontSize:15,fontWeight:800,color:"#c084fc"}}>{fmtAED(sel.total,dc,rate)}</div>
            </div>
          </div>
          {sel.exps.length===0
            ?<div style={{fontSize:12,color:calSub,textAlign:"center",padding:"8px 0"}}>No expenses — great day!</div>
            :sel.exps.map((exp,i)=>{
              const cat=varCats.find(c=>c.id===exp.category);
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:i<sel.exps.length-1?"1px solid "+(dark?"rgba(255,255,255,.07)":"rgba(0,0,0,.07)"):"none"}}>
                  <div style={{width:28,height:28,borderRadius:8,background:(cat?.color||"#888")+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{cat?.icon||"📦"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:calTxt}}>{exp.note||cat?.label}</div>
                    <div style={{fontSize:10,color:calSub}}>{cat?.label}</div>
                  </div>
                  <div style={{fontWeight:700,fontSize:12,color:exp.currency==="INR"?"#F7DC6F":calTxt,whiteSpace:"nowrap"}}>{fmtNat(exp.amount,exp.currency)}</div>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}

// navBtn, smallBtn, ifield, lbl are now computed inside App with theme access

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const nowRef=useRef(new Date());
  const now=nowRef.current;
  const todayStr=useRef(now.toISOString().split("T")[0]).current;
  const curM=useRef(now.getMonth()).current;
  const curY=useRef(now.getFullYear()).current;
  const curDay=useRef(now.getDate()).current;

  // ── navigation state ──
  const [month,setMonth]=useState(curM);
  const [year, setYear] =useState(curY);
  const [tab,  setTab]  =useState("home");

  // ── range picker ──
  const [mode,   setMode]   =useState("Month"); // Day | Week | Month
  const [anchor, setAnchor] =useState(todayStr);
  const [picker, setPicker] =useState(false);
  const [jM,setJM]=useState(String(curM+1));
  const [jY,setJY]=useState(String(curY));

  // ── display ──
  const [dc,     setDc]     =useState("AED");
  const [theme,  setTheme]  =useState(()=>ls(skG("theme"),"dark"));

  // ── global data ──
  const [rate,      setRate]      =useState(()=>ls(skG("rate"),     DEF_RATE));
  const [fixedCats, setFixedCats] =useState(()=>ls(skG("fixCats"),  DEF_FIXED_CATS));
  const [varCats,   setVarCats]   =useState(()=>ls(skG("varCats"),  DEF_VAR_CATS));
  const [incomeCats,setIncomeCats]=useState(()=>ls(skG("incCats"),  DEF_INCOME_CATS));
  const [goal,      setGoal]      =useState(()=>ls(skG("goal"),     {label:"",target:0,deadline:"",active:false}));
  const [loans,     setLoans]     =useState(()=>ls(skG("loans"),    []));
  const [recurring, setRecurring] =useState(()=>ls(skG("recur"),    []));
  const [inrW,      setInrW]      =useState(()=>ls(skG("inrw"),     {balance:0,label:"India Account"}));
  const [badges,    setBadges]    =useState(()=>ls(skG("badges"),   []));
  const [savStreak, setSavStreak] =useState(()=>ls(skG("savstrk"),  0));

  // ── month data — initialized directly from localStorage (no race condition) ──
  // Using lazy useState initializers means data is read ONCE on mount, before any
  // effects fire. Save effects then only run when data actually changes.
  const [expenses,   setExpenses]   =useState(()=>ls(sk("exp",curM,curY),[]));
  const [budgets,    setBudgets]    =useState(()=>ls(sk("bud",curM,curY), Object.fromEntries(DEF_VAR_CATS.map(c=>[c.id,0]))));
  const [fixedData,  setFixedData]  =useState(()=>ls(sk("fix",curM,curY), Object.fromEntries(DEF_FIXED_CATS.map(c=>[c.id,{amount:0,currency:c.defCur,dueDay:c.defDue}]))));
  const [incomeData, setIncomeData] =useState(()=>ls(sk("inc",curM,curY), Object.fromEntries(DEF_INCOME_CATS.map(c=>[c.id,{amount:0,currency:c.defCur||"AED"}]))));

  // ── UI ──
  const [addOpen,    setAddOpen]    =useState(false);
  const [form,       setForm]       =useState({amount:"",category:DEF_VAR_CATS[0].id,note:"",date:todayStr,currency:"AED"});
  const [toast,      setToast]      =useState(null);
  const [delId,      setDelId]      =useState(null);
  const [modal,      setModal]      =useState(null);
  const [newBadge,   setNewBadge]   =useState(null);
  const [badgeModal, setBadgeModal] =useState(false);
  const [backupModal,setBackupModal]=useState(false);
  const [drillCat,   setDrillCat]   =useState(null);
  const [nudge,      setNudge]      =useState(null);
  const [tipIdx,     setTipIdx]     =useState(0);
  const [incHide,    setIncHide]    =useState(true);
  const [impStatus,  setImpStatus]  =useState(null);
  const [copyConfirm,setCopyConfirm]=useState(false);
  const [rateInput,  setRateInput]  =useState(String(DEF_RATE));
  const [dataReady,  setDataReady]  =useState(false);

  // modal edit shadows
  const [eFixed,  setEFixed]  =useState({});
  const [eIncome, setEIncome] =useState({});
  const [eBudgets,setEBudgets]=useState({});
  const [eGoal,   setEGoal]   =useState({label:"",target:0,deadline:""});
  const [eLoan,   setELoan]   =useState({name:"",amount:"",currency:"AED",note:""});
  const [eRecur,  setERecur]  =useState({label:"",amount:"",category:DEF_VAR_CATS[0].id,currency:"AED"});
  const [eInrW,   setEInrW]   =useState({balance:0,label:""});
  const [nVC,     setNVC]     =useState({label:"",icon:"📦",color:"#ABB2B9"});
  const [nFC,     setNFC]     =useState({label:"",icon:"🔒",defCur:"AED",defDue:1});
  const [nIC,     setNIC]     =useState({label:"",icon:"💵",defCur:"AED"});

  // ── load / persist ────────────────────────────────────────────────────────
  // isFirstMount: on initial mount, state is already populated by lazy useState above.
  // This effect only fires when user navigates to a DIFFERENT month.
  const isFirstMount=useRef(true);
  useEffect(()=>{
    if(isFirstMount.current){ isFirstMount.current=false; return; }
    setExpenses( ls(sk("exp",month,year),[]));
    setBudgets(  ls(sk("bud",month,year), Object.fromEntries(varCats.map(c=>[c.id,0]))));
    setFixedData(ls(sk("fix",month,year), Object.fromEntries(fixedCats.map(c=>[c.id,{amount:0,currency:c.defCur,dueDay:c.defDue}]))));
    setIncomeData(ls(sk("inc",month,year),Object.fromEntries(incomeCats.map(c=>[c.id,{amount:0,currency:c.defCur||"AED"}]))));
  },[month,year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{ lss(sk("exp",month,year),expenses);   },[expenses,month,year]);
  useEffect(()=>{ lss(sk("bud",month,year),budgets);    },[budgets,month,year]);
  useEffect(()=>{ lss(sk("fix",month,year),fixedData);  },[fixedData,month,year]);
  useEffect(()=>{ lss(sk("inc",month,year),incomeData); },[incomeData,month,year]);
  // dataReady: fires after month/year load settles — gates streak calculation
  useEffect(()=>{
    setDataReady(false);
    const t=setTimeout(()=>setDataReady(true),0);
    return ()=>clearTimeout(t);
  },[month,year]);
  useEffect(()=>{ lss(skG("rate"),      rate);       },[rate]);
  useEffect(()=>{ lss(skG("goal"),      goal);       },[goal]);
  useEffect(()=>{ lss(skG("loans"),     loans);      },[loans]);
  useEffect(()=>{ lss(skG("recur"),     recurring);  },[recurring]);
  useEffect(()=>{ lss(skG("inrw"),      inrW);       },[inrW]);
  useEffect(()=>{ lss(skG("badges"),    badges);     },[badges]);
  useEffect(()=>{ lss(skG("theme"),     theme);      },[theme]);
  useEffect(()=>{ lss(skG("varCats"),   varCats);    },[varCats]);
  useEffect(()=>{ lss(skG("fixCats"),   fixedCats);  },[fixedCats]);
  useEffect(()=>{ lss(skG("incCats"),   incomeCats); },[incomeCats]);
  useEffect(()=>{ lss(skG("savstrk"),   savStreak);  },[savStreak]);

  // ── RANGE CALCULATIONS ─────────────────────────────────────────────────────
  // Month is always the primary context. Day/Week are sub-filters within it.
  const rangeDates=useMemo(()=>{
    // Month boundaries — always computed from month/year state
    const monthStart=year+"-"+String(month+1).padStart(2,"0")+"-01";
    const dim=new Date(year,month+1,0).getDate();
    const monthEnd=year+"-"+String(month+1).padStart(2,"0")+"-"+String(dim).padStart(2,"0");

    if(mode==="Month"){
      return {start:monthStart,end:monthEnd,days:dim,label:MONTHS[month]+" "+year};
    }

    // Clamp anchor to selected month — prevents cross-month logic errors
    const clampedAnchor=anchor<monthStart?monthStart:anchor>monthEnd?monthEnd:anchor;
    const a=new Date(clampedAnchor+"T00:00:00");

    if(mode==="Day"){
      const sh=a.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
      return {start:clampedAnchor,end:clampedAnchor,days:1,label:sh};
    }

    if(mode==="Week"){
      // Find Mon–Sun week containing anchor
      const dow=a.getDay();
      const mon=new Date(a); mon.setDate(a.getDate()-(dow===0?6:dow-1));
      const sun=new Date(mon); sun.setDate(mon.getDate()+6);
      const fmt=d=>d.toISOString().split("T")[0];
      // Trim week to month boundaries — week never crosses month
      const wStart=fmt(mon)<monthStart?monthStart:fmt(mon);
      const wEnd  =fmt(sun)>monthEnd  ?monthEnd  :fmt(sun);
      const wStartD=new Date(wStart+"T00:00:00");
      const wEndD  =new Date(wEnd  +"T00:00:00");
      const wDays  =Math.round((wEndD-wStartD)/(1000*60*60*24))+1;
      const sh=d=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
      return {start:wStart,end:wEnd,days:wDays,label:sh(wStart)+(wStart!==wEnd?" - "+sh(wEnd):"")};
    }

    return {start:monthStart,end:monthEnd,days:dim,label:MONTHS[month]+" "+year};
  },[mode,anchor,month,year]);

  // sync anchor <-> month/year
  // NOTE: month/year and anchor are kept in sync by shift() and picker handlers directly.
  // No sync effects needed — they cause infinite re-render loops.

  function shift(dir){
    const dim=new Date(year,month+1,0).getDate();
    const monthStart=year+"-"+String(month+1).padStart(2,"0")+"-01";
    const monthEnd  =year+"-"+String(month+1).padStart(2,"0")+"-"+String(dim).padStart(2,"0");

    if(mode==="Month"){
      // Move month/year and anchor together — no effects needed
      let newM=month+dir, newY=year;
      if(newM<0){newM=11;newY--;}
      if(newM>11){newM=0;newY++;}
      const newAnchor=newY+"-"+String(newM+1).padStart(2,"0")+"-01";
      setMonth(newM);
      setYear(newY);
      setAnchor(newAnchor);
      return;
    }

    if(mode==="Day"){
      const a=new Date(anchor+"T00:00:00");
      a.setDate(a.getDate()+dir);
      const s=a.toISOString().split("T")[0];
      const clamped=s<monthStart?monthStart:s>monthEnd?monthEnd:s;
      setAnchor(clamped);
      return;
    }

    if(mode==="Week"){
      const a=new Date(anchor+"T00:00:00");
      a.setDate(a.getDate()+dir*7);
      const s=a.toISOString().split("T")[0];
      const clamped=s<monthStart?monthStart:s>monthEnd?monthEnd:s;
      setAnchor(clamped);
    }
  }

  // range expenses
  const rangeExps=useMemo(()=>{
    if(mode==="Month") return expenses;
    const seen=new Set();
    const d=new Date(rangeDates.start+"T00:00:00");
    const end=new Date(rangeDates.end+"T00:00:00");
    while(d<=end){ seen.add(d.getFullYear()+"_"+d.getMonth()); d.setDate(d.getDate()+1); }
    let all=[];
    seen.forEach(k=>{ const[y,m]=k.split("_").map(Number); all=all.concat((m===month&&y===year)?expenses:ls(sk("exp",m,y),[])); });
    return all.filter(e=>e.date>=rangeDates.start&&e.date<=rangeDates.end);
  },[mode,rangeDates,expenses,month,year]);

  // prorate factor — used ONLY for fixed expenses and income display
  // Budget is NEVER prorated — it is always the monthly value set by user
  const prorFactor=useMemo(()=>{
    if(mode==="Month") return 1;
    const dim=new Date(year,month+1,0).getDate();
    return rangeDates.days/dim;
  },[mode,rangeDates,month,year]);

  // core AED totals — month level (always full month)
  const fixedTotalAED =useMemo(()=>fixedCats.reduce((s,c)=>s+toAED(fixedData[c.id]?.amount||0,fixedData[c.id]?.currency||"AED",rate),0),[fixedCats,fixedData,rate]);
  const incTotalAED   =useMemo(()=>incomeCats.reduce((s,c)=>s+toAED(incomeData[c.id]?.amount||0,incomeData[c.id]?.currency||"AED",rate),0),[incomeCats,incomeData,rate]);

  // variable totals — from range expenses (Day/Week/Month filtered)
  const varTotals=useMemo(()=>{
    const t=Object.fromEntries(varCats.map(c=>[c.id,0]));
    rangeExps.forEach(e=>{ if(t[e.category]!==undefined) t[e.category]+=toAED(e.amount,e.currency||"AED",rate); });
    return t;
  },[rangeExps,varCats,rate]);
  const varTotalAED=useMemo(()=>Object.values(varTotals).reduce((s,v)=>s+v,0),[varTotals]);

  // prorated fixed/income for display only — budget is NOT prorated
  const rFixedAED  =useMemo(()=>fixedTotalAED*prorFactor,[fixedTotalAED,prorFactor]);
  const rIncAED    =useMemo(()=>incTotalAED*prorFactor,[incTotalAED,prorFactor]);
  const rSavingsAED=useMemo(()=>rIncAED-rFixedAED-varTotalAED,[rIncAED,rFixedAED,varTotalAED]);
  const rSavRate   =useMemo(()=>rIncAED>0?Math.max(0,(rSavingsAED/rIncAED)*100):0,[rSavingsAED,rIncAED]);

  // BUDGET — always full monthly value, persisted per month, never affected by Day/Week filter
  const budgTotal=useMemo(()=>varCats.reduce((s,c)=>s+(Number(budgets[c.id])||0),0),[budgets,varCats]);

  // budget % — compares range variable spend against FULL monthly budget
  // This gives meaningful feedback: e.g. spent 80% of month budget in just 3 days = warning
  const budgPct=useMemo(()=>budgTotal>0?Math.min((varTotalAED/budgTotal)*100,100):0,[varTotalAED,budgTotal]);

  // per-category budget status — budget is always full monthly, spend is range
  const catStatus=useMemo(()=>varCats.map(c=>{
    const spent=varTotals[c.id]||0;
    // budget = full monthly value — NOT prorated
    const bgt=Number(budgets[c.id])||0;
    const pct =bgt>0?(spent/bgt)*100:0;
    const pctB=Math.min(pct,100);
    return {...c,spent,bgt,pct,pctB,over:bgt>0&&spent>bgt,near:bgt>0&&spent<=bgt&&pct>=80};
  }),[varCats,varTotals,budgets]);

  const alerts=useMemo(()=>catStatus.filter(c=>c.over||c.near),[catStatus]);
  const anyOver=useMemo(()=>catStatus.some(c=>c.over),[catStatus]);

  // streak — guarded: only runs when data is loaded, handles empty/corrupt dates
  const {streakCount,spentToday}=useMemo(()=>{
    const fallback={streakCount:0,spentToday:false};
    if(!dataReady) return fallback;
    try{
      const ts=now.toISOString().split("T")[0];
      const st=Array.isArray(expenses)&&expenses.some(e=>e&&typeof e.date==="string"&&e.date===ts);
      if(!Array.isArray(expenses)||expenses.length===0) return {streakCount:0,spentToday:st};
      let count=0;
      const d=new Date(now);
      d.setDate(d.getDate()-1);
      while(count<365){
        const ds=d.toISOString().split("T")[0];
        // guard: skip corrupt entries missing date
        if(expenses.some(e=>e&&typeof e.date==="string"&&e.date===ds)) break;
        count++;
        d.setDate(d.getDate()-1);
      }
      return {streakCount:count,spentToday:st};
    }catch(_){ return fallback; }
  },[expenses,now,dataReady]);

  // score — uses streakCount defined above
  const scoreInfo=useMemo(()=>calcScore(rSavRate,budgPct,streakCount),[rSavRate,budgPct,streakCount]);

  // due reminders
  const dueRem=useMemo(()=>{
    if(month!==curM||year!==curY) return [];
    return fixedCats.map(c=>{
      const f=fixedData[c.id]; const due=f?.dueDay||0;
      if(!due||!f?.amount) return null;
      const dl=due-curDay;
      return (dl>=0&&dl<=5)||(dl<0&&dl>=-3)?{...c,f,dl,overdue:dl<0}:null;
    }).filter(Boolean);
  },[fixedCats,fixedData,month,year,curM,curY,curDay]);

  // 6-month trend
  const trend=useMemo(()=>{
    const res=[];
    for(let i=5;i>=0;i--){
      let m=month-i,y=year; if(m<0){m+=12;y--;}
      const exps=ls(sk("exp",m,y),[]);
      const fixd=ls(sk("fix",m,y),{});
      const incs=ls(sk("inc",m,y),{});
      let varS=0; exps.forEach(e=>{varS+=toAED(e.amount,e.currency||"AED",rate);});
      const fxd=fixedCats.reduce((s,c)=>s+toAED(fixd[c.id]?.amount||0,fixd[c.id]?.currency||"AED",rate),0);
      const inc=incomeCats.reduce((s,c)=>s+toAED(incs[c.id]?.amount||0,incs[c.id]?.currency||"AED",rate),0);
      const bud=varCats.reduce((s,c)=>s+(Number(ls(sk("bud",m,y),{})[c.id])||0),0);
      res.push({label:MONTHS[m],spent:varS+fxd,income:inc,budget:bud,cur:m===month&&y===year});
    }
    return res;
  },[month,year,fixedCats,incomeCats,varCats,rate]);

  // month comparison
  const monthComp=useMemo(()=>{
    let pm=month-1,py=year; if(pm<0){pm=11;py--;}
    const pExps=ls(sk("exp",pm,py),[]);
    return varCats.map(c=>{
      const curr=varTotals[c.id]||0;
      let prev=0; pExps.forEach(e=>{ if(e.category===c.id) prev+=toAED(e.amount,e.currency||"AED",rate); });
      return {...c,curr,prev,diff:curr-prev,pct:prev>0?((curr-prev)/prev*100):0};
    });
  },[varCats,varTotals,month,year,rate]);

  // pies
  const incomePie=useMemo(()=>[
    {label:"Fixed",  v:rFixedAED,             color:"#4ECDC4"},
    {label:"Variable",v:varTotalAED,           color:"#c084fc"},
    {label:"Savings", v:Math.max(rSavingsAED,0),color:"#34d399"},
  ].filter(s=>s.v>0),[rFixedAED,varTotalAED,rSavingsAED]);

  const varPie=useMemo(()=>varCats.map(c=>({label:c.label,v:varTotals[c.id]||0,color:c.color})).filter(d=>d.v>0),[varCats,varTotals]);

  // net worth
  const netWorth=useMemo(()=>{
    let total=0;
    try{
      if(!_storage) return Math.max(rSavingsAED,0);
      const seen=new Set();
      for(let i=0;i<_storage.length;i++){
        const k=_storage.key(i);
        if(k&&k.startsWith("vw_inc_")) seen.add(k.replace("vw_inc_",""));
      }
      seen.forEach(my=>{
        try{
          const[m,y]=my.split("_").map(Number);
          if(isNaN(m)||isNaN(y)) return;
          const incs=ls(sk("inc",m,y),{});
          const exps=ls(sk("exp",m,y),[]);
          const fixd=ls(sk("fix",m,y),{});
          const inc=incomeCats.reduce((s,c)=>s+toAED(incs[c.id]?.amount||0,incs[c.id]?.currency||"AED",rate),0);
          let vs=0;
          (Array.isArray(exps)?exps:[]).forEach(e=>{ if(e&&e.amount) vs+=toAED(e.amount,e.currency||"AED",rate); });
          const fx=fixedCats.reduce((s,c)=>s+toAED(fixd[c.id]?.amount||0,fixd[c.id]?.currency||"AED",rate),0);
          total+=Math.max(inc-vs-fx,0);
        }catch(_){}
      });
    }catch(_){}
    return total+Math.max(rSavingsAED,0);
  },[incomeCats,fixedCats,rate,month,year,rSavingsAED]);

  // week review
  const weekReview=useMemo(()=>{
    // include prev month expenses — week can span month boundary
    let pm=curM-1,py=curY; if(pm<0){pm=11;py--;}
    const prevExps=ls(sk("exp",pm,py),[]);
    const allExps=[...(Array.isArray(expenses)?expenses:[]),...(Array.isArray(prevExps)?prevExps:[])];
    const d=new Date(now);
    let thisW=0,lastW=0;
    for(let i=0;i<7;i++){ const ds=d.toISOString().split("T")[0]; allExps.filter(e=>e&&e.date===ds).forEach(e=>{thisW+=toAED(e.amount,e.currency||"AED",rate);}); d.setDate(d.getDate()-1); }
    for(let i=0;i<7;i++){ const ds=d.toISOString().split("T")[0]; allExps.filter(e=>e&&e.date===ds).forEach(e=>{lastW+=toAED(e.amount,e.currency||"AED",rate);}); d.setDate(d.getDate()-1); }
    return {thisW,lastW,diff:lastW>0?((thisW-lastW)/lastW*100):0,better:thisW<=lastW};
  },[expenses,now,rate,curM,curY]);

  // projection
  const proj=useMemo(()=>{
    if(month!==curM||year!==curY||curDay<=0) return null;
    const dim=new Date(year,month+1,0).getDate();
    const projVar=(varTotalAED/curDay)*dim;
    const projTotal=projVar+fixedTotalAED;
    return {projTotal,projSav:incTotalAED-projTotal,onTrack:incTotalAED>=projTotal};
  },[month,year,curM,curY,curDay,varTotalAED,fixedTotalAED,incTotalAED]);

  // insight
  const insight=useMemo(()=>{
    let pm=month-1,py=year; if(pm<0){pm=11;py--;}
    const pE=ls(sk("exp",pm,py),[]);
    let best=null,bestD=0;
    varCats.forEach(c=>{
      const curr=varTotals[c.id]||0;
      let prev=0; pE.forEach(e=>{if(e.category===c.id)prev+=toAED(e.amount,e.currency||"AED",rate);});
      if(prev>0){ const diff=Math.abs(((curr-prev)/prev)*100); if(diff>bestD){bestD=diff;best={c,diff:(curr-prev)/prev*100};} }
    });
    if(!best||bestD<5) return null;
    const up=best.diff>0;
    return {text:(up?"Up":"Down")+" "+Math.abs(best.diff).toFixed(0)+"% in "+best.c.label+" vs last month",positive:!up};
  },[varCats,varTotals,month,year,rate]);

  // badge check
  const badgeRef=useRef(badges);
  const badgeTimerRef=useRef(null);
  useEffect(()=>{badgeRef.current=badges;},[badges]);
  useEffect(()=>{
    const ctx={savingsRate:rSavRate,streak:streakCount,allUnderBudget:catStatus.every(c=>!c.over),goalSet:goal.active&&goal.target>0,grade:scoreInfo.grade,savingsStreak:savStreak};
    BADGE_DEFS.forEach(b=>{
      if(!badgeRef.current.includes(b.id)&&b.check(expenses,ctx)){
        setBadges(p=>{if(p.includes(b.id))return p;return [...p,b.id];});
        if(badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
        setNewBadge(b);
        badgeTimerRef.current=setTimeout(()=>setNewBadge(null),4000);
      }
    });
    return ()=>{ if(badgeTimerRef.current) clearTimeout(badgeTimerRef.current); };
  },[expenses,rSavRate,streakCount,catStatus,goal,scoreInfo.grade,savStreak]);

  // D = display amount from AED
  const Dp=useCallback((aed)=>fmtAED(aed,dc,rate),[dc,rate]);

  const toastTimerRef=useRef(null);
  const showToast=useCallback((msg,type="ok")=>{
    if(toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({msg,type});
    toastTimerRef.current=setTimeout(()=>setToast(null),2700);
  },[]);

  // ── ACTIONS ───────────────────────────────────────────────────────────────
  function addExpense(){
    if(!form.amount||isNaN(form.amount)||Number(form.amount)<=0){showToast("Enter valid amount","err");return;}
    const cat=varCats.find(c=>c.id===form.category);
    const e={id:Date.now(),amount:parseFloat(form.amount),category:form.category,catLabel:cat?.label||"",note:form.note.trim()||cat?.label||"",date:form.date,currency:form.currency};
    // nudge check
    const newSpent=(varTotals[form.category]||0)+toAED(e.amount,e.currency,rate);
    const bgt=Number(budgets[form.category])||0;
    if(bgt>0){
      const pct=(newSpent/bgt)*100;
      if(pct>=80){ setNudge({type:pct>=100?"over":"near",cat,pct,spent:newSpent,bgt}); setTimeout(()=>setNudge(null),5000); }
    }
    setExpenses(p=>[e,...p]);
    setForm(f=>({...f,amount:"",note:""}));
    setAddOpen(false);
    showToast("Expense added");
  }

  function delExpense(id){ setExpenses(p=>p.filter(e=>e.id!==id)); setDelId(null); showToast("Deleted","err"); }

  function copyPrevMonth(){
    let pm=month-1,py=year; if(pm<0){pm=11;py--;}
    const pb=ls(sk("bud",pm,py),null);
    const pf=ls(sk("fix",pm,py),null);
    const pi=ls(sk("inc",pm,py),null);
    if(pb) setBudgets(pb);
    if(pf) setFixedData(pf);
    if(pi) setIncomeData(pi);
    setCopyConfirm(false);
    showToast("Copied from "+MONTHS[pm]);
  }

  function addVarCat(){
    if(!nVC.label.trim()){showToast("Enter name","err");return;}
    const id="vc_"+Date.now();
    setVarCats(p=>[...p,{...nVC,id}]);
    setBudgets(b=>({...b,[id]:0}));
    setNVC({label:"",icon:"📦",color:"#ABB2B9"});
    showToast("Category added");
  }
  function removeVarCat(id){
    if(DEF_VAR_CATS.find(c=>c.id===id)){showToast("Cannot remove default","err");return;}
    setVarCats(p=>p.filter(c=>c.id!==id));
    setBudgets(b=>{const n={...b};delete n[id];return n;});
    showToast("Removed","err");
  }
  function addFixedCat(){
    if(!nFC.label.trim()){showToast("Enter name","err");return;}
    const id="fc_"+Date.now();
    setFixedCats(p=>[...p,{...nFC,id,color:"#AEB6BF"}]);
    setFixedData(fd=>({...fd,[id]:{amount:0,currency:nFC.defCur,dueDay:nFC.defDue||1}}));
    setNFC({label:"",icon:"🔒",defCur:"AED",defDue:1});
    showToast("Fixed expense added");
  }
  function removeFixedCat(id){
    if(DEF_FIXED_CATS.find(c=>c.id===id)){showToast("Cannot remove default","err");return;}
    setFixedCats(p=>p.filter(c=>c.id!==id));
    setFixedData(fd=>{const n={...fd};delete n[id];return n;});
    showToast("Removed","err");
  }
  function addIncomeCat(){
    if(!nIC.label.trim()){showToast("Enter name","err");return;}
    const id="ic_"+Date.now();
    setIncomeCats(p=>[...p,{...nIC,id}]);
    setIncomeData(id2=>({...id2,[id]:{amount:0,currency:nIC.defCur||"AED"}}));
    setNIC({label:"",icon:"💵",defCur:"AED"});
    showToast("Income source added");
  }
  function removeIncomeCat(id){
    if(DEF_INCOME_CATS.find(c=>c.id===id)){showToast("Cannot remove default","err");return;}
    setIncomeCats(p=>p.filter(c=>c.id!==id));
    setIncomeData(id2=>{const n={...id2};delete n[id];return n;});
    showToast("Removed","err");
  }

  function saveRate()    { const r=parseFloat(rateInput); if(isNaN(r)||r<=0){showToast("Invalid","err");return;} setRate(r);setModal(null);showToast("Rate: 1 AED = "+r); }
  function saveFixed()   { setFixedData(eFixed);  setModal(null); showToast("Fixed saved"); }
  function saveIncome()  { setIncomeData(eIncome);setModal(null); showToast("Income saved"); }
  function saveBudgets() { setBudgets(eBudgets);  setModal(null); showToast("Budgets saved"); }
  function saveGoal()    { setGoal({...eGoal,target:parseFloat(eGoal.target)||0,active:true}); setModal(null); showToast("Goal saved"); }
  function addLoan()     { if(!eLoan.name||!eLoan.amount){showToast("Fill name and amount","err");return;} setLoans(p=>[...p,{id:Date.now(),...eLoan,amount:parseFloat(eLoan.amount),date:todayStr,repaid:false}]);setELoan({name:"",amount:"",currency:"AED",note:""});showToast("Loan recorded"); }
  function markRepaid(id){ setLoans(p=>p.map(l=>l.id===id?{...l,repaid:true}:l)); showToast("Marked repaid"); }
  function delLoan(id)   { setLoans(p=>p.filter(l=>l.id!==id)); showToast("Deleted","err"); }
  function addRecur()    { if(!eRecur.label||!eRecur.amount){showToast("Fill details","err");return;} setRecurring(p=>[...p,{id:Date.now(),...eRecur,amount:parseFloat(eRecur.amount)}]);setERecur({label:"",amount:"",category:varCats[0]?.id||"",currency:"AED"});showToast("Added"); }
  function delRecur(id)  { setRecurring(p=>p.filter(r=>r.id!==id)); showToast("Deleted","err"); }

  // theme
  const dark = theme==="dark";
  const T={
    bg:    dark?"#0d0d18":"#f0f0f8",
    card:  dark?"#12121e":"#ffffff",
    bdr:   dark?"rgba(255,255,255,.08)":"rgba(0,0,0,.1)",
    txt:   dark?"#e8e4f0":"#1a1a2a",
    sub:   dark?"#666":"#888",
    inp:   dark?"rgba(0,0,0,.3)":"rgba(0,0,0,.06)",
    inpB:  dark?"rgba(255,255,255,.12)":"rgba(0,0,0,.12)",
    row:   dark?"rgba(255,255,255,.04)":"rgba(0,0,0,.03)",
    rowH:  dark?"rgba(255,255,255,.07)":"rgba(0,0,0,.06)",
  };

  const IF={width:"100%",background:T.inp,border:"1px solid "+T.inpB,borderRadius:10,padding:"9px 12px",color:T.txt,fontSize:13,fontFamily:"inherit",outline:"none"};
  const LB={fontSize:10,color:T.sub,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",marginBottom:5,display:"block"};
  const navBtn={background:T.inp,border:"1px solid "+T.inpB,color:T.txt,borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
  const smallBtn={background:T.inp,border:"1px solid "+T.inpB,borderRadius:8,padding:"5px 12px",color:T.sub,cursor:"pointer",fontSize:10,fontWeight:700};
  // pendLoans: derived from loans state — all loans not yet marked repaid
  const pendLoans=loans.filter(l=>!l.repaid);

  const TABS=[{id:"home",icon:"⊞",label:"Home"},{id:"charts",icon:"◎",label:"Charts"},{id:"log",icon:"≡",label:"Log"},{id:"manage",icon:"⚙",label:"Manage"}];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"system-ui,sans-serif",color:T.txt,paddingBottom:84}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px;}
        input,select,button{font-family:inherit;}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes badgePop{0%{opacity:0;transform:translateX(-50%) scale(.85)}60%{transform:translateX(-50%) scale(1.05)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        .card{background:${T.card};border:1px solid ${T.bdr};border-radius:18px;padding:16px;}
        .erow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:${T.row};border-radius:11px;margin-bottom:6px;transition:background .15s;}
        .erow:hover{background:${T.rowH};}
        .btnP{background:linear-gradient(135deg,#7c6aff,#c084fc);border:none;border-radius:12px;padding:11px 20px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:100%;transition:opacity .2s,transform .1s;letter-spacing:.02em;}
        .btnP:hover{opacity:.88;transform:translateY(-1px);}
        .btnP:active{transform:translateY(0);}
        .btnS{background:${T.inp};border:1px solid ${T.inpB};border-radius:10px;padding:7px 13px;color:${T.sub};font-size:11px;cursor:pointer;transition:all .2s;}
        .btnS:hover{border-color:rgba(124,106,255,.4);color:#c084fc;}
        .del{background:none;border:none;cursor:pointer;color:${T.bdr};font-size:12px;padding:4px 7px;border-radius:6px;flex-shrink:0;transition:color .2s;}
        .del:hover{color:#FF6B6B;}
        .toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:10px;font-size:11px;font-weight:700;z-index:9999;animation:toastIn .25s ease;white-space:nowrap;pointer-events:none;}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:900;display:flex;align-items:flex-end;justify-content:center;}
        .sheet{background:${T.card};border:1px solid ${T.bdr};border-radius:24px 24px 0 0;padding:22px 16px 38px;width:100%;max-width:520px;animation:sheetUp .28s cubic-bezier(.4,0,.2,1);}
        .mwrap{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:901;display:flex;align-items:center;justify-content:center;padding:16px;}
        .modal{background:${T.card};border:1px solid ${T.bdr};border-radius:20px;padding:20px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto;}
        .fab{position:fixed;bottom:72px;right:14px;width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#7c6aff,#c084fc);border:none;color:#fff;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(124,106,255,.5);z-index:79;transition:transform .2s;}
        .fab:hover{transform:scale(1.1);}
        .bnav{position:fixed;bottom:0;left:0;right:0;background:${T.card};border-top:1px solid ${T.bdr};display:flex;justify-content:space-around;padding:9px 0 16px;z-index:80;}
        .ni{display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:5px 14px;border-radius:12px;transition:background .2s;}
        .ni.on{background:rgba(124,106,255,.1);}
        .catBtn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 5px;border-radius:11px;cursor:pointer;border:1px solid;transition:all .2s;}
        .catBtn:active{transform:scale(.95);}
        .sect{font-size:13px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px;color:${T.txt};}
        .addRow{display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid ${T.bdr};}
        .mrow{display:flex;align-items:center;gap:12px;cursor:pointer;}
        .hbtn{background:none;border:1px solid ${T.inpB};border-radius:8px;padding:4px 9px;color:${T.sub};cursor:pointer;font-size:9px;font-weight:700;letter-spacing:.05em;}
        .hbtn:hover{color:#c084fc;border-color:rgba(124,106,255,.3);}
      `}</style>

      {/* TOAST */}
      {toast&&<div className="toast" style={{background:toast.type==="err"?"#1f0808":"#081f12",color:toast.type==="err"?"#FF6B6B":"#34d399",border:"1px solid "+(toast.type==="err"?"rgba(255,107,107,.2)":"rgba(52,211,153,.2)")}}>{toast.msg}</div>}

      {/* BADGE UNLOCKED */}
      {newBadge&&<div style={{position:"fixed",bottom:90,left:"50%",background:"linear-gradient(135deg,#1a1230,#12121e)",border:"1px solid rgba(124,106,255,.4)",borderRadius:16,padding:"14px 20px",zIndex:9998,animation:"badgePop .5s ease forwards",display:"flex",alignItems:"center",gap:12,minWidth:240,pointerEvents:"none"}}>
        <div style={{fontSize:28}}>{newBadge.icon}</div>
        <div>
          <div style={{fontSize:9,color:"#7c6aff",fontWeight:700,letterSpacing:".07em",marginBottom:3}}>BADGE UNLOCKED</div>
          <div style={{fontSize:13,fontWeight:700,color:"#e8e4f0"}}>{newBadge.label}</div>
          <div style={{fontSize:10,color:"#666",marginTop:2}}>{newBadge.desc}</div>
        </div>
      </div>}

      {/* NUDGE BANNER */}
      {nudge&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",width:"90%",maxWidth:480,background:nudge.type==="over"?"#1f0808":"#1a1608",border:"1px solid "+(nudge.type==="over"?"rgba(255,107,107,.3)":"rgba(255,230,109,.2)"),borderRadius:12,padding:"10px 14px",zIndex:9997,animation:"slideDown .3s ease",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>{nudge.type==="over"?"⚠️":"🔶"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,color:nudge.type==="over"?"#FF6B6B":"#FFE66D",marginBottom:2}}>
            {nudge.type==="over"?nudge.cat.label+" budget exceeded":nudge.cat.label+" at "+nudge.pct.toFixed(0)+"% of budget"}
          </div>
          <div style={{fontSize:10,color:"#888"}}>{nudge.type==="over"?("Over by "+Dp(nudge.spent-nudge.bgt)):("Remaining: "+Dp(nudge.bgt-nudge.spent))}</div>
        </div>
        <button onClick={()=>setNudge(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#666",fontSize:16}}>x</button>
      </div>}

      {/* DELETE CONFIRM */}
      {delId&&<div className="mwrap" onClick={()=>setDelId(null)}><div className="modal" style={{maxWidth:290}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:24,marginBottom:8}}>🗑️</div>
        <div style={{fontWeight:700,marginBottom:4,fontSize:13,color:T.txt}}>Delete this entry?</div>
        <div style={{fontSize:11,color:T.sub,marginBottom:16}}>This cannot be undone.</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btnS" style={{flex:1}} onClick={()=>setDelId(null)}>Cancel</button>
          <button style={{flex:1,background:"#1f0808",border:"1px solid rgba(255,107,107,.2)",borderRadius:10,padding:10,color:"#FF6B6B",cursor:"pointer",fontWeight:700,fontSize:11}} onClick={()=>delExpense(delId)}>Delete</button>
        </div>
      </div></div>}

      {/* COPY CONFIRM */}
      {copyConfirm&&<div className="mwrap" onClick={()=>setCopyConfirm(false)}><div className="modal" style={{maxWidth:300}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:24,marginBottom:8}}>📋</div>
        <div style={{fontWeight:700,fontSize:14,marginBottom:6,color:T.txt}}>Copy from {MONTHS[month===0?11:month-1]}?</div>
        <div style={{fontSize:11,color:T.sub,marginBottom:16}}>Copies fixed expenses, income and budgets. Expenses reset to zero.</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btnS" style={{flex:1}} onClick={()=>setCopyConfirm(false)}>Cancel</button>
          <button className="btnP" style={{flex:1}} onClick={copyPrevMonth}>Copy</button>
        </div>
      </div></div>}

      {/* BADGES MODAL */}
      {badgeModal&&<div className="mwrap" onClick={()=>setBadgeModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:15,color:T.txt}}>Achievements</div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:18}} onClick={()=>setBadgeModal(false)}>x</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          {BADGE_DEFS.map(b=>{
            const earned=badges.includes(b.id);
            return (
              <div key={b.id} style={{background:earned?"rgba(124,106,255,.1)":T.row,border:"1px solid "+(earned?"rgba(124,106,255,.3)":T.bdr),borderRadius:12,padding:"12px",opacity:earned?1:.4}}>
                <div style={{fontSize:22,marginBottom:5}}>{b.icon}</div>
                <div style={{fontSize:11,fontWeight:700,color:earned?T.txt:T.sub}}>{b.label}</div>
                <div style={{fontSize:9,color:T.sub,marginTop:3}}>{b.desc}</div>
                {earned&&<div style={{fontSize:9,color:"#7c6aff",fontWeight:700,marginTop:5}}>EARNED</div>}
              </div>
            );
          })}
        </div>
      </div></div>}

      {/* BACKUP MODAL */}
      {backupModal&&<div className="mwrap" onClick={()=>setBackupModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:15,color:T.txt}}>Backup and Restore</div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:18}} onClick={()=>setBackupModal(false)}>x</button>
        </div>
        <div style={{background:T.row,border:"1px solid "+T.bdr,borderRadius:12,padding:"12px",marginBottom:12,fontSize:11,color:T.sub,lineHeight:1.7}}>
          Your data is stored in your browser local storage on your device. No internet needed. Export a backup monthly to keep it safe.
        </div>
        <div style={{background:T.row,border:"1px solid "+T.bdr,borderRadius:12,padding:"14px",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:13,color:T.txt,marginBottom:3}}>Full Data Backup</div>
          <div style={{fontSize:11,color:T.sub,marginBottom:10}}>Exports all months, settings, categories, loans and goals to a JSON file.</div>
          <button className="btnP" onClick={()=>{ const c=doBackup(); showToast("Backup saved ("+c+" records)"); }}>Download Full Backup</button>
        </div>
        <div style={{background:T.row,border:"1px solid "+T.bdr,borderRadius:12,padding:"14px",marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:13,color:T.txt,marginBottom:3}}>Export This Month</div>
          <div style={{fontSize:11,color:T.sub,marginBottom:10}}>Exports expenses, budget vs actual, income, fixed and loans to a text file.</div>
          <button className="btnP" style={{background:"linear-gradient(135deg,#22a566,#16a34a)"}} onClick={()=>{ doExport({month,year,expenses,fixedCats,fixedData,incomeData,incomeCats,varCats,budgets,rate,goal,loans}); showToast("Exported to Downloads"); }}>Download Monthly Report</button>
        </div>
        <div style={{background:T.row,border:"1px solid "+T.bdr,borderRadius:12,padding:"14px"}}>
          <div style={{fontWeight:700,fontSize:13,color:T.txt,marginBottom:3}}>Restore from Backup</div>
          <div style={{fontSize:11,color:T.sub,marginBottom:10}}>Select a .json backup file. This will overwrite current data.</div>
          <label style={{display:"block",background:"linear-gradient(135deg,#7c6aff,#c084fc)",borderRadius:12,padding:"11px 20px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
            Choose Backup File
            <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
              const file=e.target.files?.[0];
              if(!file) return;
              setImpStatus("loading");
              doRestore(file,(err,count)=>{
                if(err){setImpStatus("err:"+err);showToast("Restore failed","err");}
                else{setImpStatus("ok:"+count);showToast("Restored "+count+" records");}
              });
              e.target.value="";
            }}/>
          </label>
          {impStatus&&<div style={{fontSize:11,marginTop:8,color:impStatus.startsWith("ok")?"#34d399":"#FF6B6B",fontWeight:600,textAlign:"center"}}>
            {impStatus.startsWith("ok")?"Restored "+impStatus.split(":")[1]+" records. Refresh page to reload.":impStatus.replace("err:","")}
          </div>}
        </div>
        <div style={{marginTop:12,padding:"10px 12px",background:"rgba(124,106,255,.08)",border:"1px solid rgba(124,106,255,.15)",borderRadius:10,fontSize:10,color:"#a78bfa",lineHeight:1.6}}>
          Tip: Export a Full Backup at the end of each month and save it to your phone Downloads folder. That is your insurance policy.
        </div>
      </div></div>}

      {/* MAIN MODAL */}
      {modal&&<div className="mwrap" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:15,color:T.txt}}>
            {modal==="rate"    ?"Exchange Rate":
             modal==="fixed"   ?"Fixed Expenses":
             modal==="income"  ?"Income - "+MONTHS[month]+" "+year:
             modal==="variable"?"Variable Expenses":
             modal==="goal"    ?"Savings Goal":
             modal==="loan"    ?"Loan to Friend":
             modal==="recur"   ?"Recurring Expenses":
             modal==="inrwallet"?"India Account":""}
          </div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:18}} onClick={()=>setModal(null)}>x</button>
        </div>

        {modal==="rate"&&<>
          <span style={LB}>1 AED equals how many rupees</span>
          <input style={{...IF,marginBottom:6}} type="number" value={rateInput} onChange={e=>setRateInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveRate()} autoFocus/>
          <div style={{fontSize:11,color:T.sub,marginBottom:14}}>Current: 1 AED = {rate} rupees. Check Google for live rate.</div>
          <div style={{display:"flex",gap:8}}><button className="btnS" style={{flex:1}} onClick={()=>setModal(null)}>Cancel</button><button className="btnP" style={{flex:1}} onClick={saveRate}>Save</button></div>
        </>}

        {modal==="fixed"&&<>
          <div style={{fontSize:11,color:T.sub,marginBottom:12}}>Same every month. Set due day for reminders.</div>
          {fixedCats.map(c=>(
            <div key={c.id} style={{marginBottom:12,padding:"10px",background:T.row,borderRadius:10}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:6,color:T.txt}}><span style={{fontSize:16}}>{c.icon}</span><span style={{fontSize:12,fontWeight:600}}>{c.label}</span></div>
                {!DEF_FIXED_CATS.find(d=>d.id===c.id)&&<button className="del" onClick={()=>removeFixedCat(c.id)}>x</button>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 70px",gap:6}}>
                <input style={IF} type="number" placeholder="Amount" value={eFixed[c.id]?.amount||0} onChange={e=>setEFixed(f=>({...f,[c.id]:{...f[c.id],amount:e.target.value}}))}/>
                <select style={IF} value={eFixed[c.id]?.currency||"AED"} onChange={e=>setEFixed(f=>({...f,[c.id]:{...f[c.id],currency:e.target.value}}))}>
                  <option value="AED">AED</option><option value="INR">INR</option>
                </select>
                <input style={IF} type="number" placeholder="Due" min="1" max="28" value={eFixed[c.id]?.dueDay||""} onChange={e=>setEFixed(f=>({...f,[c.id]:{...f[c.id],dueDay:parseInt(e.target.value)||0}}))}/>
              </div>
              <div style={{fontSize:9,color:T.sub,marginTop:3}}>Amount · Currency · Due day of month</div>
            </div>
          ))}
          <div className="addRow">
            <input style={{...IF,flex:1,padding:"7px 10px",fontSize:12}} placeholder="New label" value={nFC.label} onChange={e=>setNFC(f=>({...f,label:e.target.value}))}/>
            <input style={{...IF,width:42,padding:"7px 8px",fontSize:14,textAlign:"center"}} placeholder="🔒" value={nFC.icon} onChange={e=>setNFC(f=>({...f,icon:e.target.value}))}/>
            <select style={{...IF,width:70,padding:"7px 8px"}} value={nFC.defCur} onChange={e=>setNFC(f=>({...f,defCur:e.target.value}))}><option value="AED">AED</option><option value="INR">INR</option></select>
            <button className="btnS" style={{padding:"7px 12px",flexShrink:0}} onClick={addFixedCat}>Add</button>
          </div>
          <button className="btnP" style={{marginTop:14}} onClick={saveFixed}>Save</button>
        </>}

        {modal==="income"&&<>
          <div style={{fontSize:11,color:T.sub,marginBottom:12}}>{MONTHS[month]} {year}</div>
          {incomeCats.map(c=>(
            <div key={c.id} style={{marginBottom:10,padding:"10px",background:T.row,borderRadius:10}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:6,color:T.txt}}><span style={{fontSize:15}}>{c.icon}</span><span style={{fontSize:12,fontWeight:600}}>{c.label}</span></div>
                {!DEF_INCOME_CATS.find(d=>d.id===c.id)&&<button className="del" onClick={()=>removeIncomeCat(c.id)}>x</button>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                <input style={IF} type="number" value={eIncome[c.id]?.amount||0} onChange={e=>setEIncome(f=>({...f,[c.id]:{...f[c.id],amount:e.target.value}}))}/>
                <select style={IF} value={eIncome[c.id]?.currency||"AED"} onChange={e=>setEIncome(f=>({...f,[c.id]:{...f[c.id],currency:e.target.value}}))}>
                  <option value="AED">AED</option><option value="INR">INR</option>
                </select>
              </div>
            </div>
          ))}
          <div className="addRow">
            <input style={{...IF,flex:1,padding:"7px 10px",fontSize:12}} placeholder="New label" value={nIC.label} onChange={e=>setNIC(f=>({...f,label:e.target.value}))}/>
            <input style={{...IF,width:42,padding:"7px 8px",fontSize:14,textAlign:"center"}} placeholder="💵" value={nIC.icon} onChange={e=>setNIC(f=>({...f,icon:e.target.value}))}/>
            <select style={{...IF,width:70,padding:"7px 8px"}} value={nIC.defCur} onChange={e=>setNIC(f=>({...f,defCur:e.target.value}))}><option value="AED">AED</option><option value="INR">INR</option></select>
            <button className="btnS" style={{padding:"7px 12px",flexShrink:0}} onClick={addIncomeCat}>Add</button>
          </div>
          <button className="btnP" style={{marginTop:14}} onClick={saveIncome}>Save</button>
        </>}

        {modal==="variable"&&<>
          <div style={{fontSize:11,color:T.sub,marginBottom:12}}>{rangeDates.label} · Set budget per category</div>
          {catStatus.map((c,ci)=>(
            <div key={c.id} style={{marginBottom:10,padding:"12px",background:c.over?"rgba(255,107,107,.08)":c.near?"rgba(255,230,109,.05)":T.row,borderRadius:12,border:"1px solid "+(c.over?"rgba(255,107,107,.2)":c.near?"rgba(255,230,109,.15)":T.bdr),animation:"fadeUp .25s ease "+(ci*.04)+"s both"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontSize:17}}>{c.icon}</span>
                  <span style={{fontSize:12,fontWeight:700,color:T.txt}}>{c.label}</span>
                  {c.over&&<span style={{background:"rgba(255,107,107,.15)",border:"1px solid rgba(255,107,107,.3)",borderRadius:6,padding:"1px 7px",fontSize:9,fontWeight:700,color:"#FF6B6B"}}>OVER</span>}
                  {c.near&&<span style={{background:"rgba(255,230,109,.12)",border:"1px solid rgba(255,230,109,.25)",borderRadius:6,padding:"1px 7px",fontSize:9,fontWeight:700,color:"#FFE66D"}}>80%+</span>}
                </div>
                {!DEF_VAR_CATS.find(d=>d.id===c.id)&&<button className="del" onClick={()=>removeVarCat(c.id)}>x</button>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                <span style={{color:T.sub}}>Spent</span>
                <span style={{fontWeight:700,color:c.over?"#FF6B6B":c.near?"#FFE66D":T.txt}}>{Dp(c.spent)}</span>
              </div>
              {c.bgt>0&&<>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
                  <span style={{color:T.sub}}>Budget</span>
                  <span style={{fontWeight:600,color:T.sub}}>{Dp(c.bgt)}</span>
                </div>
                <PBar pct={c.pctB} color={c.over?"#FF6B6B":c.near?"#FFE66D":c.color} theme={theme}/>
                {c.over&&<div style={{fontSize:10,color:"#FF6B6B",marginTop:4,fontWeight:600}}>Over by {Dp(c.spent-c.bgt)}</div>}
              </>}
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8,paddingTop:7,borderTop:"1px solid "+T.bdr}}>
                <span style={{fontSize:10,color:T.sub}}>Budget (AED)</span>
                <input style={{...IF,flex:1,textAlign:"right",padding:"6px 9px",fontSize:12,border:"1px solid "+(c.over?"rgba(255,107,107,.3)":T.inpB)}} type="number" placeholder="0"
                  value={budgets[c.id]||""}
                  onChange={e=>{ const v={...budgets,[c.id]:e.target.value}; setBudgets(v); lss(sk("bud",month,year),v); }}/>
              </div>
            </div>
          ))}
          <div className="addRow">
            <input style={{...IF,flex:1,padding:"7px 10px",fontSize:12}} placeholder="New category" value={nVC.label} onChange={e=>setNVC(f=>({...f,label:e.target.value}))}/>
            <input style={{...IF,width:42,padding:"7px 8px",fontSize:14,textAlign:"center"}} placeholder="📦" value={nVC.icon} onChange={e=>setNVC(f=>({...f,icon:e.target.value}))}/>
            <button className="btnS" style={{padding:"7px 12px",flexShrink:0}} onClick={addVarCat}>Add</button>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontSize:12}}>
            <span style={{color:T.sub,fontWeight:600}}>Total spent</span>
            <span style={{fontWeight:800,color:"#c084fc"}}>{Dp(varTotalAED)}</span>
          </div>
        </>}

        {modal==="goal"&&<>
          <span style={LB}>Goal Name</span>
          <input style={{...IF,marginBottom:10}} placeholder="Emergency Fund" value={eGoal.label||""} onChange={e=>setEGoal(g=>({...g,label:e.target.value}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div><span style={LB}>Target (AED)</span><input style={IF} type="number" value={eGoal.target||0} onChange={e=>setEGoal(g=>({...g,target:e.target.value}))}/></div>
            <div><span style={LB}>Deadline</span><input style={IF} type="date" value={eGoal.deadline||""} onChange={e=>setEGoal(g=>({...g,deadline:e.target.value}))}/></div>
          </div>
          <button className="btnP" onClick={saveGoal}>Save Goal</button>
        </>}

        {modal==="loan"&&<>
          <div style={{background:T.row,borderRadius:12,padding:14,marginBottom:12}}>
            <span style={LB}>Friend Name</span>
            <input style={{...IF,marginBottom:8}} placeholder="Name" value={eLoan.name} onChange={e=>setELoan(f=>({...f,name:e.target.value}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
              <div><span style={LB}>Amount</span><input style={IF} type="number" value={eLoan.amount} onChange={e=>setELoan(f=>({...f,amount:e.target.value}))}/></div>
              <div><span style={LB}>Currency</span><select style={IF} value={eLoan.currency} onChange={e=>setELoan(f=>({...f,currency:e.target.value}))}><option value="AED">AED</option><option value="INR">INR</option></select></div>
            </div>
            <span style={LB}>Note</span>
            <input style={{...IF,marginBottom:10}} placeholder="Reason" value={eLoan.note} onChange={e=>setELoan(f=>({...f,note:e.target.value}))}/>
            <button className="btnP" onClick={addLoan}>Record Loan</button>
          </div>
          {loans.length===0&&<div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>No loans yet</div>}
          {loans.map(l=>(
            <div key={l.id} className="erow">
              <span style={{fontSize:17}}>🤝</span>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.txt}}>{l.name}</div><div style={{fontSize:10,color:T.sub}}>{l.date}{l.note?" · "+l.note:""}</div></div>
              <span style={{fontSize:12,fontWeight:700,color:l.repaid?"#34d399":"#85C1E9",marginRight:6}}>{fmtNat(l.amount,l.currency)}</span>
              {!l.repaid&&<button style={{background:"rgba(52,211,153,.1)",border:"1px solid rgba(52,211,153,.2)",borderRadius:7,padding:"3px 7px",color:"#34d399",cursor:"pointer",fontSize:10,fontWeight:700}} onClick={()=>markRepaid(l.id)}>Done</button>}
              <button className="del" onClick={()=>delLoan(l.id)}>x</button>
            </div>
          ))}
        </>}

        {modal==="recur"&&<>
          <div style={{background:T.row,borderRadius:12,padding:14,marginBottom:12}}>
            <span style={LB}>Label</span>
            <input style={{...IF,marginBottom:8}} placeholder="Netflix, Gym..." value={eRecur.label} onChange={e=>setERecur(f=>({...f,label:e.target.value}))}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
              <div><span style={LB}>Amount</span><input style={IF} type="number" value={eRecur.amount} onChange={e=>setERecur(f=>({...f,amount:e.target.value}))}/></div>
              <div><span style={LB}>Currency</span><select style={IF} value={eRecur.currency} onChange={e=>setERecur(f=>({...f,currency:e.target.value}))}><option value="AED">AED</option><option value="INR">INR</option></select></div>
            </div>
            <span style={LB}>Category</span>
            <select style={{...IF,marginBottom:10}} value={eRecur.category||varCats[0]?.id} onChange={e=>setERecur(f=>({...f,category:e.target.value}))}>
              {varCats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            <button className="btnP" onClick={addRecur}>Add</button>
          </div>
          {recurring.length===0&&<div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"8px 0"}}>No recurring set up yet</div>}
          {recurring.map(r=>(
            <div key={r.id} className="erow">
              <span style={{fontSize:17}}>🔄</span>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.txt}}>{r.label}</div><div style={{fontSize:10,color:T.sub}}>{(varCats.find(c=>c.id===r.category)||{}).label||r.category} · {r.currency}</div></div>
              <span style={{fontSize:12,fontWeight:700,color:"#c084fc"}}>{fmtNat(r.amount,r.currency)}</span>
              <button className="del" onClick={()=>delRecur(r.id)}>x</button>
            </div>
          ))}
        </>}

        {modal==="inrwallet"&&<>
          <span style={LB}>Account Label</span>
          <input style={{...IF,marginBottom:10}} placeholder="SBI Savings..." value={eInrW.label||""} onChange={e=>setEInrW(f=>({...f,label:e.target.value}))}/>
          <span style={LB}>Current Balance (rupees)</span>
          <input style={{...IF,marginBottom:14}} type="number" value={eInrW.balance||0} onChange={e=>setEInrW(f=>({...f,balance:e.target.value}))}/>
          <button className="btnP" onClick={()=>{ setInrW(eInrW); setModal(null); showToast("Saved"); }}>Save</button>
        </>}
      </div></div>}

      {/* ADD EXPENSE SHEET */}
      {addOpen&&<div className="overlay" onClick={()=>setAddOpen(false)}><div className="sheet" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:T.txt}}>Quick Add</div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:T.sub,fontSize:18}} onClick={()=>setAddOpen(false)}>x</button>
        </div>
        <span style={LB}>Category</span>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:13}}>
          {varCats.map(c=>(
            <button key={c.id} className="catBtn" onClick={()=>setForm(f=>({...f,category:c.id}))}
              style={{borderColor:form.category===c.id?c.color+"88":"rgba(255,255,255,.1)",background:form.category===c.id?c.color+"18":"transparent"}}>
              <span style={{fontSize:19}}>{c.icon}</span>
              <span style={{fontSize:8,color:form.category===c.id?c.color:T.sub,fontWeight:700,textAlign:"center",lineHeight:1.2}}>{c.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
        {form.category&&(()=>{
          const cs=catStatus.find(c=>c.id===form.category);
          if(!cs||!cs.bgt) return null;
          return (
            <div style={{background:cs.over?"rgba(255,107,107,.08)":cs.near?"rgba(255,230,109,.05)":T.row,borderRadius:9,padding:"7px 12px",marginBottom:10,fontSize:10,display:"flex",justifyContent:"space-between",animation:"fadeIn .2s ease"}}>
              <span style={{color:T.sub}}>{cs.label} budget used</span>
              <span style={{fontWeight:700,color:cs.over?"#FF6B6B":cs.near?"#FFE66D":T.sub}}>{Dp(cs.spent)} / {Dp(cs.bgt)} ({cs.pct.toFixed(0)}%)</span>
            </div>
          );
        })()}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><span style={LB}>Amount</span><input style={IF} type="number" placeholder="0.00" value={form.amount} autoFocus onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <span style={{...LB,marginBottom:0}}>Currency</span>
              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:9,color:"#7c6aff",fontWeight:700,padding:0}} onClick={()=>{setModal("rate");setRateInput(String(rate));}}>
                {rate} rupees
              </button>
            </div>
            <select style={IF} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
              <option value="AED">AED - Dirham</option>
              <option value="INR">INR - Rupee</option>
            </select>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <div><span style={LB}>Date</span><input style={IF} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          <div><span style={LB}>Note</span><input style={IF} placeholder="optional" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addExpense()}/></div>
        </div>
        {form.currency==="INR"&&form.amount&&!isNaN(form.amount)&&(
          <div style={{background:T.row,borderRadius:9,padding:"8px 12px",marginBottom:10,fontSize:11,color:T.sub,animation:"fadeIn .2s ease"}}>
            Approx. <span style={{color:"#c084fc",fontWeight:700}}>{fmtAED(toAED(parseFloat(form.amount)||0,"INR",rate),"AED",rate)}</span> at 1 AED = {rate} rupees
          </div>
        )}
        <button className="btnP" onClick={addExpense}>Add Expense</button>
      </div></div>}

      {/* ════ HEADER ════ */}
      <div style={{background:T.card,borderBottom:"1px solid "+T.bdr,padding:"10px 14px",position:"sticky",top:0,zIndex:70}}>
        <div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:800,color:T.txt}}>Varun Wallet</div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{background:T.inp,border:"1px solid "+T.inpB,borderRadius:8,padding:"5px 8px",color:T.sub,fontSize:13,cursor:"pointer",lineHeight:1}}>
                {theme==="dark"?"☀️":"🌙"}
              </button>
              <button onClick={()=>{setModal("rate");setRateInput(String(rate));}} style={{background:T.inp,border:"1px solid "+T.inpB,borderRadius:8,padding:"5px 8px",color:"#7c6aff",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                {rate} rupees
              </button>
              <div style={{display:"flex",background:T.inp,border:"1px solid "+T.bdr,borderRadius:9,padding:3,gap:2}}>
                {["AED","INR"].map(c=>(
                  <button key={c} onClick={()=>setDc(c)} style={{background:dc===c?"linear-gradient(135deg,#7c6aff,#c084fc)":"transparent",border:"none",borderRadius:6,padding:"4px 9px",color:dc===c?"#fff":T.sub,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Range picker */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{display:"flex",background:T.inp,border:"1px solid "+T.bdr,borderRadius:9,padding:3,gap:2,flexShrink:0}}>
              {["Day","Week","Month"].map(m=>(
                <button key={m} onClick={()=>{
                  setMode(m);
                  // When switching to Month, snap anchor to current month start
                  if(m==="Month"){
                    setAnchor(year+"-"+String(month+1).padStart(2,"0")+"-01");
                  }
                }} style={{background:mode===m?"linear-gradient(135deg,#7c6aff,#c084fc)":"transparent",border:"none",borderRadius:7,padding:"4px 9px",color:mode===m?"#fff":T.sub,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all .2s"}}>{m}</button>
              ))}
            </div>
            <button onClick={()=>shift(-1)} style={{...navBtn,background:T.inp,border:"1px solid "+T.bdr}}>&#8249;</button>
            <button onClick={()=>setPicker(s=>!s)} style={{flex:1,background:T.inp,border:"1px solid "+T.bdr,borderRadius:9,padding:"5px 8px",color:T.txt,fontSize:10,fontWeight:700,cursor:"pointer",textAlign:"center",minWidth:0}}>
              {rangeDates.label} &#9660;
            </button>
            <button onClick={()=>shift(1)} style={{...navBtn,background:T.inp,border:"1px solid "+T.bdr}}>&#8250;</button>
          </div>

          {picker&&<div style={{marginTop:8,background:T.inp,border:"1px solid "+T.bdr,borderRadius:12,padding:"10px 12px",animation:"fadeIn .2s ease"}}>
            {(mode==="Day"||mode==="Week")&&(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:T.sub,flexShrink:0}}>Pick any date in {mode.toLowerCase()}</span>
                <input type="date" value={anchor} onChange={e=>{setAnchor(e.target.value);setPicker(false);}} style={{...IF,flex:1}}/>
              </div>
            )}
            {mode==="Month"&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:7,alignItems:"flex-end"}}>
                <div>
                  <span style={LB}>Month</span>
                  <select value={jM} onChange={e=>setJM(e.target.value)} style={IF}>
                    {MONTHS.map((ml,i)=><option key={i} value={i+1}>{ml}</option>)}
                  </select>
                </div>
                <div>
                  <span style={LB}>Year</span>
                  <input type="number" min="2020" max="2100" value={jY} onChange={e=>setJY(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){setMonth(parseInt(jM)-1);setYear(parseInt(jY));setPicker(false);}}} style={IF}/>
                </div>
                <button onClick={()=>{
                  const newM=parseInt(jM)-1;
                  const newY=parseInt(jY);
                  if(isNaN(newM)||isNaN(newY)||newM<0||newM>11||newY<2000||newY>2100) return;
                  const newAnchor=newY+"-"+String(newM+1).padStart(2,"0")+"-01";
                  setMonth(newM);
                  setYear(newY);
                  setAnchor(newAnchor);
                  setPicker(false);
                }} style={{background:"linear-gradient(135deg,#7c6aff,#c084fc)",border:"none",borderRadius:9,padding:"8px 14px",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700}}>Go</button>
              </div>
            )}
          </div>}
        </div>
      </div>

      <div style={{maxWidth:520,margin:"0 auto",padding:"14px 12px"}}>

        {/* ════ HOME ════ */}
        {tab==="home"&&<>
          {/* Copy prev month prompt */}
          {expenses.length===0&&month!==curM&&(
            <button onClick={()=>setCopyConfirm(true)} style={{width:"100%",background:T.row,border:"1px dashed rgba(124,106,255,.3)",borderRadius:12,padding:"10px",color:"#7c6aff",cursor:"pointer",fontSize:11,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6,animation:"slideDown .3s ease"}}>
              Copy settings from {MONTHS[month===0?11:month-1]}?
            </button>
          )}

          {/* Due reminders */}
          {dueRem.length>0&&(
            <div style={{background:"rgba(240,178,122,.08)",border:"1px solid rgba(240,178,122,.2)",borderRadius:14,padding:"10px 13px",marginBottom:12,animation:"slideDown .3s ease"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#F0B27A",letterSpacing:".06em",marginBottom:5}}>PAYMENT REMINDERS</div>
              {dueRem.map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:i<dueRem.length-1?4:0}}>
                  <span style={{color:T.txt}}>{r.icon} {r.label}</span>
                  <span style={{fontWeight:700,color:r.overdue?"#FF6B6B":"#F0B27A"}}>{r.overdue?"Overdue "+Math.abs(r.dl)+"d":"Due in "+r.dl+"d"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Budget alerts */}
          {alerts.length>0&&(
            <div style={{background:"rgba(255,107,107,.08)",border:"1px solid rgba(255,107,107,.15)",borderRadius:14,padding:"10px 13px",marginBottom:12,animation:"slideDown .3s ease"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#FF6B6B",letterSpacing:".06em",marginBottom:5}}>BUDGET ALERTS · {rangeDates.label}</div>
              {alerts.map((c,i)=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:i<alerts.length-1?4:0}}>
                  <span style={{color:T.txt}}>{c.icon} {c.label}</span>
                  <span style={{fontWeight:700,color:c.over?"#FF6B6B":"#FFE66D"}}>{c.pct.toFixed(0)}% {c.over?"OVER":"used"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Streak */}
          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(52,211,153,.06)",border:"1px solid rgba(52,211,153,.15)",borderRadius:10,padding:"7px 12px",marginBottom:12,animation:"fadeIn .4s ease"}}>
            <span style={{fontSize:16}}>{streakCount>=7?"🔥":streakCount>=3?"⚡":"💤"}</span>
            <span style={{fontSize:12,fontWeight:800,color:"#34d399"}}>{streakCount}d</span>
            <span style={{fontSize:10,color:T.sub,flex:1}}>{streakCount===0?(spentToday?"Spent today":"Spend-free today"):"spend-free streak"+(spentToday?" (spent today)":"")}</span>
            <button onClick={()=>setBadgeModal(true)} style={{background:"none",border:"1px solid "+T.bdr,borderRadius:7,padding:"3px 8px",color:"#7c6aff",cursor:"pointer",fontSize:9,fontWeight:700}}>{badges.length} medals</button>
          </div>

          {/* Insight */}
          {insight&&(
            <div style={{background:insight.positive?"rgba(52,211,153,.06)":"rgba(240,178,122,.06)",border:"1px solid "+(insight.positive?"rgba(52,211,153,.15)":"rgba(240,178,122,.15)"),borderRadius:12,padding:"10px 13px",marginBottom:12,animation:"fadeUp .4s ease"}}>
              <div style={{fontSize:9,fontWeight:700,color:insight.positive?"#34d399":"#F0B27A",letterSpacing:".06em",marginBottom:3}}>SMART INSIGHT</div>
              <div style={{fontSize:12,color:T.txt}}>{insight.text}</div>
            </div>
          )}

          {/* Range mode note */}
          {mode!=="Month"&&(
            <div style={{fontSize:10,color:"#7c6aff",fontWeight:600,textAlign:"center",marginBottom:10,background:"rgba(124,106,255,.08)",borderRadius:8,padding:"4px 0"}}>
              {mode} view · {rangeDates.label} · Fixed and income prorated
            </div>
          )}

          {/* Stat cards */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[
              {label:"Fixed",   val:rFixedAED,    color:"#4ECDC4", icon:"🔒"},
              {label:"Variable",val:varTotalAED,   color:"#c084fc", icon:"📊"},
              {label:"Savings", val:rSavingsAED,   color:rSavingsAED>=0?"#34d399":"#FF6B6B", icon:"💰"},
            ].map((s,i)=>(
              <div key={i} className="card" style={{padding:"12px 10px",animation:"fadeUp .3s ease "+(i*.07)+"s both"}}>
                <div style={{fontSize:13,marginBottom:3}}>{s.icon}</div>
                <div style={{fontSize:8,color:T.sub,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase",marginBottom:3}}>{s.label}</div>
                <div style={{fontSize:11,fontWeight:800,color:s.color,lineHeight:1.3,wordBreak:"break-all"}}>{Dp(s.val)}</div>
              </div>
            ))}
          </div>

          {/* Income pie */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div className="sect" style={{marginBottom:0}}>Where does income go?</div>
              <button className="hbtn" onClick={()=>setIncHide(h=>!h)}>{incHide?"Show":"Hide"} income</button>
            </div>
            <div style={{fontSize:10,color:T.sub,marginBottom:12}}>
              {rangeDates.label}{mode!=="Month"?" (prorated)":""} · Total: <span style={{color:"#34d399",fontWeight:700}}>{incHide?"------":Dp(rIncAED)}</span>
            </div>
            <Pie slices={incomePie} center="income" theme={theme}/>
            <div style={{marginTop:12,borderTop:"1px solid "+T.bdr,paddingTop:12,display:"flex",flexDirection:"column",gap:6}}>
              {[{label:"Fixed",val:rFixedAED,color:"#4ECDC4"},{label:"Variable",val:varTotalAED,color:"#c084fc"},{label:"Savings",val:Math.max(rSavingsAED,0),color:"#34d399"}].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:7,height:7,borderRadius:"50%",background:r.color}}/><span style={{color:T.sub}}>{r.label}</span></div>
                  <span style={{fontWeight:700,color:r.color}}>{Dp(r.val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Score */}
          <div className="card" style={{marginBottom:12,animation:"fadeIn .5s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <Ring pct={scoreInfo.score} color={scoreInfo.color} size={74} stroke={8} label={scoreInfo.grade} sub="score" theme={theme}/>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:".06em",marginBottom:4}}>{mode.toUpperCase()} SCORE</div>
                <div style={{fontSize:20,fontWeight:800,color:scoreInfo.color}}>{scoreInfo.score}<span style={{fontSize:12,color:T.sub}}>/100</span></div>
                <div style={{fontSize:10,color:T.sub,marginTop:3}}>{scoreInfo.score>=85?"Excellent 🚀":scoreInfo.score>=65?"Good discipline 💪":scoreInfo.score>=45?"Room to improve 🔧":"Needs attention ⚠️"}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0,fontSize:10,color:T.sub,textAlign:"right"}}>
                <div>Savings <span style={{color:"#34d399",fontWeight:700}}>{rSavRate.toFixed(0)}%</span></div>
                <div>Budget <span style={{color:budgPct>100?"#FF6B6B":budgPct>80?"#FFE66D":"#34d399",fontWeight:700}}>{budgPct.toFixed(0)}%</span></div>
                <div>Streak <span style={{color:"#a78bfa",fontWeight:700}}>{streakCount}d</span></div>
              </div>
            </div>
          </div>

          {/* Goal */}
          {goal.active&&goal.target>0&&(
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div className="sect" style={{marginBottom:0}}>Savings Goal</div>
                <button className="btnS" style={{padding:"4px 9px",fontSize:9}} onClick={()=>{setEGoal(goal);setModal("goal");}}>Edit</button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <Ring pct={Math.min((netWorth/(goal.target||1))*100,100)} color={netWorth>=goal.target?"#34d399":"#7c6aff"} size={74} stroke={8} label={Math.round(Math.min((netWorth/(goal.target||1))*100,100))+"%"}  sub="goal" theme={theme}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.txt}}>{goal.label||"My Goal"}</div>
                  <div style={{fontSize:11,color:T.sub}}>Target: <span style={{color:"#a78bfa",fontWeight:700}}>{fmtAED(goal.target||0,"AED",rate)}</span></div>
                  <div style={{fontSize:11,color:T.sub,marginTop:3}}>Saved: <span style={{color:"#34d399",fontWeight:700}}>{Dp(netWorth)}</span></div>
                  {goal.deadline&&<div style={{fontSize:10,color:T.sub,marginTop:4}}>Deadline: {goal.deadline}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Net worth */}
          <div className="card" style={{marginBottom:12,animation:"fadeIn .4s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:"#7c6aff",fontWeight:700,letterSpacing:".06em",marginBottom:4}}>CUMULATIVE NET SAVINGS</div>
                <div style={{fontSize:18,fontWeight:800,color:"#34d399"}}>{Dp(netWorth)}</div>
                <div style={{fontSize:10,color:T.sub,marginTop:3}}>All tracked months combined</div>
              </div>
              {goal.target>0&&<Ring pct={Math.min((netWorth/goal.target)*100,100)} color="#34d399" size={56} stroke={6} label={Math.round(Math.min((netWorth/goal.target)*100,100))+"%"}  sub="goal" theme={theme}/>}
            </div>
          </div>

          {/* Week review */}
          <div className="card" style={{marginBottom:12,animation:"fadeUp .4s ease"}}>
            <div className="sect">Week in Review</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:10,color:T.sub,marginBottom:3}}>This week</div>
                <div style={{fontSize:16,fontWeight:800,color:T.txt}}>{Dp(weekReview.thisW)}</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:18}}>{weekReview.better?"📉":"📈"}</div>
                <div style={{fontSize:10,fontWeight:700,color:weekReview.better?"#34d399":"#FF6B6B",marginTop:2}}>
                  {weekReview.lastW>0?Math.abs(weekReview.diff).toFixed(0)+"% "+(weekReview.better?"less":"more"):"First week"}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.sub,marginBottom:3}}>Last week</div>
                <div style={{fontSize:14,fontWeight:600,color:T.sub}}>{Dp(weekReview.lastW)}</div>
              </div>
            </div>
            <div style={{fontSize:10,color:T.sub}}>{weekReview.better?"Spending less than last week":"Spending more than last week"}</div>
          </div>

          {/* Projection */}
          {proj&&(
            <div style={{background:proj.onTrack?"rgba(52,211,153,.06)":"rgba(255,107,107,.06)",border:"1px solid "+(proj.onTrack?"rgba(52,211,153,.15)":"rgba(255,107,107,.15)"),borderRadius:14,padding:"12px 14px",marginBottom:12,animation:"fadeUp .45s ease"}}>
              <div style={{fontSize:10,fontWeight:700,color:proj.onTrack?"#34d399":"#FF6B6B",letterSpacing:".06em",marginBottom:6}}>MONTH-END PROJECTION</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:2}}>Projected spend</div><div style={{fontSize:13,fontWeight:700,color:T.txt}}>{Dp(proj.projTotal)}</div></div>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:2}}>Projected savings</div><div style={{fontSize:13,fontWeight:700,color:proj.onTrack?"#34d399":"#FF6B6B"}}>{Dp(proj.projSav)}</div></div>
              </div>
              <div style={{fontSize:10,color:T.sub,marginTop:8}}>Based on day {curDay} of {new Date(year,month+1,0).getDate()}</div>
            </div>
          )}

          {/* INR wallet */}
          {Number(inrW.balance)>0&&(
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:".06em",marginBottom:3}}>{inrW.label||"India Account"}</div>
                  <div style={{fontSize:16,fontWeight:800,color:"#F7DC6F"}}>{"₹"+Number(inrW.balance).toLocaleString("en-IN")}</div>
                  <div style={{fontSize:10,color:T.sub,marginTop:2}}>{"Approx. "+fmtAED(toAED(inrW.balance,"INR",rate),"AED",rate)}</div>
                </div>
                <button className="btnS" style={{padding:"5px 10px",fontSize:10}} onClick={()=>{setEInrW(inrW);setModal("inrwallet");}}>Edit</button>
              </div>
            </div>
          )}

          {/* Pending loans */}
          {pendLoans.length>0&&(
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div className="sect" style={{marginBottom:0}}>Pending Loans</div>
                <button className="btnS" style={{padding:"4px 9px",fontSize:9}} onClick={()=>setModal("loan")}>Manage</button>
              </div>
              {pendLoans.map(l=>(
                <div key={l.id} className="erow">
                  <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:T.txt}}>{l.name}</div><div style={{fontSize:10,color:T.sub}}>{l.date}</div></div>
                  <span style={{fontWeight:700,fontSize:11,color:"#85C1E9"}}>{fmtNat(l.amount,l.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Financial tip */}
          <div style={{background:T.card,border:"1px solid "+T.bdr,borderRadius:14,padding:"11px 14px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:10,animation:"fadeIn .5s ease"}}>
            <div style={{flex:1,fontSize:11,color:T.sub,lineHeight:1.6}}>💡 {TIPS[tipIdx%TIPS.length]}</div>
            <button onClick={()=>setTipIdx(i=>i+1)} className="btnS" style={{padding:"3px 8px",fontSize:9,flexShrink:0}}>Next</button>
          </div>
        </>}

        {/* ════ CHARTS ════ */}
        {tab==="charts"&&<>
          {mode!=="Month"&&(
            <div style={{fontSize:10,color:"#7c6aff",fontWeight:600,textAlign:"center",marginBottom:10,background:"rgba(124,106,255,.08)",borderRadius:8,padding:"5px 0"}}>
              {mode} view · {rangeDates.label} · Prorated
            </div>
          )}

          {/* Variable pie with drill-down */}
          <div className="card" style={{marginBottom:12}}>
            <div className="sect">Variable Spending</div>
            <div style={{fontSize:10,color:T.sub,marginBottom:4}}>{rangeDates.label} · <span style={{color:"#c084fc",fontWeight:700}}>{Dp(varTotalAED)}</span></div>
            {drillCat
              ? <div style={{animation:"fadeIn .2s ease"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <button onClick={()=>setDrillCat(null)} className="btnS">Back</button>
                    <span style={{fontSize:13,fontWeight:700,color:T.txt}}>{drillCat.icon} {drillCat.label}</span>
                    <span style={{fontSize:13,fontWeight:800,color:drillCat.color,marginLeft:"auto"}}>{Dp(varTotals[drillCat.id]||0)}</span>
                  </div>
                  {rangeExps.filter(e=>e.category===drillCat.id).length===0
                    ? <div style={{textAlign:"center",fontSize:12,color:T.sub,padding:"16px 0"}}>No entries in this range</div>
                    : rangeExps.filter(e=>e.category===drillCat.id).map((exp,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:i<rangeExps.filter(e=>e.category===drillCat.id).length-1?"1px solid "+T.bdr:"none"}}>
                          <div style={{flex:1}}><div style={{fontSize:12,fontWeight:500,color:T.txt}}>{exp.note||drillCat.label}</div><div style={{fontSize:10,color:T.sub}}>{exp.date}</div></div>
                          <span style={{fontWeight:700,fontSize:12,color:exp.currency==="INR"?"#F7DC6F":T.txt}}>{fmtNat(exp.amount,exp.currency)}</span>
                        </div>
                      ))
                  }
                </div>
              : <div>
                  <div style={{fontSize:10,color:T.sub,marginBottom:10}}>Tap a category row to see transactions</div>
                  <Pie slices={varPie} center="tap row" theme={theme}/>
                  <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
                    {varPie.map((p,i)=>{
                      const cat=varCats.find(c=>c.label===p.label);
                      const total=varPie.reduce((s,d)=>s+d.v,1);
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:8,cursor:"pointer",background:T.row,transition:"background .15s"}}
                          onClick={()=>cat&&setDrillCat(cat)}
                          onMouseEnter={e=>e.currentTarget.style.background=T.rowH}
                          onMouseLeave={e=>e.currentTarget.style.background=T.row}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                          <div style={{flex:1,fontSize:11,color:T.sub}}>{p.label}</div>
                          <div style={{fontSize:11,fontWeight:700,color:T.txt}}>{((p.v/total)*100).toFixed(1)}%</div>
                          <div style={{fontSize:10,color:T.sub}}>{Dp(p.v)}</div>
                          <div style={{fontSize:10,color:T.sub}}>›</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            }
          </div>

          {/* 6-month bar */}
          <div className="card" style={{marginBottom:12}}>
            <div className="sect">6-Month Trend</div>
            <div style={{display:"flex",gap:12,marginBottom:10,fontSize:10,color:T.sub}}><span>Purple = Spent</span><span>Green = Income</span></div>
            <Bars months={trend} theme={theme}/>
            <div style={{marginTop:12,borderTop:"1px solid "+T.bdr,paddingTop:10}}>
              {trend.map((m,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr",gap:8,fontSize:11,padding:"5px 0",borderBottom:"1px solid "+T.card}}>
                  <span style={{color:m.cur?"#c084fc":T.sub,fontWeight:m.cur?700:400}}>{m.label}{m.cur?" ←":""}</span>
                  <span style={{color:m.spent>m.budget&&m.budget>0?"#FF6B6B":T.txt,fontWeight:600,textAlign:"right"}}>{Dp(m.spent)}</span>
                  <span style={{color:"#34d399",fontWeight:600,textAlign:"right"}}>{m.income>0?Dp(m.income):"--"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* vs last period */}
          <div className="card" style={{marginBottom:12}}>
            <div className="sect">vs Last {mode}</div>
            {monthComp.filter(c=>c.curr>0||c.prev>0).map((c,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid "+T.card,animation:"fadeUp .25s ease "+(i*.04)+"s both"}}>
                <span style={{fontSize:16,flexShrink:0}}>{c.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:500,marginBottom:2,color:T.txt}}>{c.label}</div>
                  <div style={{display:"flex",gap:10,fontSize:10,color:T.sub}}>
                    <span>Now: <span style={{color:T.txt,fontWeight:600}}>{Dp(c.curr)}</span></span>
                    <span>Prev: <span style={{color:T.sub,fontWeight:600}}>{Dp(c.prev)}</span></span>
                  </div>
                </div>
                {c.prev>0&&<span style={{fontSize:11,fontWeight:700,color:c.diff>0?"#FF6B6B":"#34d399",flexShrink:0}}>{c.diff>0?"▲":"▼"}{Math.abs(c.pct).toFixed(0)}%</span>}
              </div>
            ))}
            {monthComp.every(c=>c.curr===0&&c.prev===0)&&<div style={{textAlign:"center",fontSize:12,color:T.sub,padding:"16px 0"}}>No data to compare yet</div>}
          </div>

          {/* Income allocation */}
          <div className="card">
            <div className="sect">Income Allocation</div>
            <div style={{fontSize:10,color:T.sub,marginBottom:10}}>{rangeDates.label}{mode!=="Month"?" (prorated)":""}</div>
            {rIncAED>0
              ? [{label:"Fixed",val:rFixedAED,color:"#4ECDC4"},{label:"Variable",val:varTotalAED,color:"#c084fc"},{label:"Savings",val:Math.max(rSavingsAED,0),color:"#34d399"}].map((r,i)=>{
                  const pct=rIncAED>0?(r.val/rIncAED)*100:0;
                  return (
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                        <span style={{color:T.sub}}>{r.label}</span>
                        <span style={{fontWeight:700,color:r.color}}>{pct.toFixed(1)}% · {Dp(r.val)}</span>
                      </div>
                      <PBar pct={pct} color={r.color} theme={theme}/>
                    </div>
                  );
                })
              : <div style={{fontSize:12,color:T.sub,textAlign:"center",padding:"20px 0"}}>Set income in Manage to see allocation</div>
            }
          </div>
        </>}

        {/* ════ LOG ════ */}
        {tab==="log"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:17,fontWeight:800,color:T.txt}}>Expense Log</div>
              <div style={{fontSize:10,color:"#7c6aff",marginTop:2}}>{rangeDates.label} · {rangeExps.length} entries</div>
            </div>
            <button className="btnS" style={{padding:"5px 10px",fontSize:10}} onClick={()=>setBackupModal(true)}>Export</button>
          </div>
          {rangeExps.length===0
            ? <div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:32,marginBottom:10}}>📭</div><div style={{color:T.sub,fontSize:12}}>No entries for {rangeDates.label}</div></div>
            : rangeExps.map((exp,ei)=>{
                const cat=varCats.find(c=>c.id===exp.category);
                return (
                  <div key={exp.id} className="erow" style={{animation:"fadeUp .2s ease "+(Math.min(ei,8)*.04)+"s both"}}>
                    <div style={{width:32,height:32,borderRadius:9,background:(cat?.color||"#888")+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat?.icon||"📦"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.txt}}>{exp.note||cat?.label}</div>
                      <div style={{display:"flex",gap:5,marginTop:2,alignItems:"center"}}>
                        <span style={{fontSize:9,background:(cat?.color||"#888")+"15",color:cat?.color||"#888",padding:"1px 7px",borderRadius:99,fontWeight:700}}>{cat?.label}</span>
                        <span style={{fontSize:9,color:T.sub}}>{exp.date}</span>
                        {exp.currency==="INR"&&<span style={{fontSize:9,background:"rgba(247,220,111,.12)",color:"#F7DC6F",padding:"1px 6px",borderRadius:99,fontWeight:700}}>INR</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right",marginRight:4}}>
                      <div style={{fontWeight:700,fontSize:11,color:exp.currency==="INR"?"#F7DC6F":T.txt}}>{fmtNat(exp.amount,exp.currency)}</div>
                      {exp.currency!=="AED"&&<div style={{fontSize:9,color:T.sub}}>{"~"+fmtAED(toAED(exp.amount,exp.currency,rate),"AED",rate)}</div>}
                    </div>
                    <button className="del" onClick={()=>setDelId(exp.id)}>x</button>
                  </div>
                );
              })
          }
        </>}

        {/* ════ MANAGE ════ */}
        {tab==="manage"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:17,fontWeight:800,color:T.txt}}>Manage</div>
            <button className="btnS" style={{padding:"5px 12px",fontSize:10}} onClick={()=>setCopyConfirm(true)}>Copy prev month</button>
          </div>
          {[
            {label:"Income",          desc:MONTHS[month]+" "+year+" · "+(incHide?"------":Dp(incTotalAED)),              icon:"💼",action:()=>{setEIncome({...Object.fromEntries(incomeCats.map(c=>[c.id,{amount:0,currency:c.defCur||"AED"}])),...incomeData});setModal("income");}},
            {label:"Fixed Expenses",  desc:"Rent · Loan · SIP → "+Dp(fixedTotalAED)+"/mo",                              icon:"🔒",action:()=>{setEFixed({...Object.fromEntries(fixedCats.map(c=>[c.id,{amount:0,currency:c.defCur,dueDay:c.defDue}])),...fixedData});setModal("fixed");}},
            {label:"Variable Expenses",desc:(anyOver?"Over budget · ":"")+Dp(varTotalAED)+" spent · "+rangeDates.label, icon:"📊",action:()=>setModal("variable"),warn:anyOver},
            {label:"Savings Goal",    desc:goal.active?goal.label+" · "+Math.round(Math.min((netWorth/(goal.target||1))*100,100))+"% done":"Not set", icon:"🎯",action:()=>{setEGoal(goal);setModal("goal");}},
            {label:"Loan to Friend",  desc:pendLoans.length+" pending",                                                  icon:"🤝",action:()=>setModal("loan")},
            {label:"Recurring",       desc:recurring.length+" set up",                                                   icon:"🔄",action:()=>setModal("recur")},
            {label:"India Account",   desc:Number(inrW.balance)>0?"₹"+Number(inrW.balance).toLocaleString("en-IN")+" · "+fmtAED(toAED(inrW.balance,"INR",rate),"AED",rate):"Not set",icon:"🇮🇳",action:()=>{setEInrW(inrW);setModal("inrwallet");}},
            {label:"Exchange Rate",   desc:"1 AED = "+rate+" rupees (manual)",                                           icon:"💱",action:()=>{setRateInput(String(rate));setModal("rate");}},
            {label:"Achievements",    desc:badges.length+" of "+BADGE_DEFS.length+" badges earned",                      icon:"🏅",action:()=>setBadgeModal(true)},
            {label:"Backup and Restore",desc:"Export, download, restore data",                                           icon:"💾",action:()=>setBackupModal(true)},
          ].map((r,i)=>(
            <div key={i} className="card mrow" style={{marginBottom:8,border:"1px solid "+(r.warn?"rgba(255,107,107,.2)":T.bdr),cursor:"pointer",transition:"border .15s",animation:"fadeUp .25s ease "+(i*.04)+"s both"}}
              onClick={r.action}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=r.warn?"rgba(255,107,107,.4)":"rgba(124,106,255,.3)";e.currentTarget.style.background=T.rowH;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=r.warn?"rgba(255,107,107,.2)":T.bdr;e.currentTarget.style.background=T.card;}}>
              <div style={{width:36,height:36,borderRadius:10,background:r.warn?"rgba(255,107,107,.1)":T.row,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{r.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13,fontWeight:700,color:T.txt}}>{r.label}</span>
                  {r.warn&&<span style={{background:"rgba(255,107,107,.15)",border:"1px solid rgba(255,107,107,.3)",borderRadius:6,padding:"1px 6px",fontSize:9,fontWeight:700,color:"#FF6B6B"}}>!</span>}
                </div>
                <div style={{fontSize:10,color:r.warn?"rgba(255,107,107,.6)":T.sub,marginTop:2}}>{r.desc}</div>
              </div>
              <span style={{color:T.bdr,fontSize:18}}>›</span>
            </div>
          ))}

          {/* Calendar in manage for daily tracking */}
          <div className="card" style={{marginTop:4}}>
            <div className="sect">Daily Calendar</div>
            <div style={{fontSize:10,color:T.sub,marginBottom:14}}>Tap any day to see transactions</div>
            <Calendar
              expenses={expenses}
              month={month}
              year={year}
              dc={dc}
              rate={rate}
              varCats={varCats}
              onNav={(m,y)=>{setMonth(m);setYear(y);}}
              theme={theme}
            />
          </div>
        </>}

      </div>

      <button className="fab" onClick={()=>setAddOpen(true)}>+</button>

      <div className="bnav">
        {TABS.map(t=>(
          <div key={t.id} className={"ni"+(tab===t.id?" on":"")} onClick={()=>setTab(t.id)}>
            <div style={{fontSize:17,color:tab===t.id?"#a78bfa":T.sub,transition:"color .2s"}}>{t.icon}</div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".04em",color:tab===t.id?"#a78bfa":T.sub,transition:"color .2s"}}>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
