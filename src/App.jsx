import { useState, useRef, useEffect, useMemo } from "react";
import { supabase, isSupabase } from "./supabase.js";
import BugReportButton from "./BugReportButton.jsx";

/* ── Shared colors ── */
const C_NEST="#2a9d8f", C_FV="#6a8ab5", C_RATE="#b8892a", C_MONTHS="#8b5fb0", C_YEARS="#7a8e5a";
const C_EXP="#c47a3a", C_SWR="#7a6a8a", C_INV="#457bb5", C_AGE="#c95858", C_RETAGE="#3a9e6e";
const C_MO="#c47a3a";

/* ── Scenarios (override real-return + SWR + monthly spend) ── */
const SCENARIOS = [
  { key:"baseline", label:"Baseline (advisor 6.5%/3%)", realRet:3.5, swrPct:3.6, spendMo:15000, note:"6.5% nominal − 3% inflation = 3.5% real, 3.6% SWR." },
  { key:"kids",     label:"With 2 kids",                 realRet:3.5, swrPct:3.6, spendMo:17000, note:"Same returns, +$2K/mo to cover kids while alive." },
  { key:"lowret",   label:"Returns are 4%",              realRet:1.0, swrPct:3.0, spendMo:15000, note:"4% nominal − 3% infl = 1% real, 3% SWR. Brutal." },
  { key:"highinfl", label:"Inflation +0.5%",             realRet:3.0, swrPct:3.5, spendMo:15000, note:"6.5% − 3.5% = 3% real, 3.5% SWR." },
];

/* ── Helpers ── */
const fmt=v=>(v<0?"−$":"$")+Math.round(Math.abs(v)).toLocaleString();
const fmtM=v=>(v<0?"−$":"$")+(Math.abs(v)/1e6).toFixed(2)+"M";

/* ── Atoms ── */
function Pill({name,id,color}){
  return <span data-var={id} style={{...st.pill,borderColor:color,color}}>{name}</span>;
}
function Num({value,onChange,step=50,min=0,max=99999999,pre="$",suf="",label,color,id,decimals=0,fmtFn}){
  const display = fmtFn ? fmtFn(value) : (pre + (decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString()) + suf);
  const inc = () => onChange(Math.min(max, +(value+step).toFixed(4)));
  const dec = () => onChange(Math.max(min, +(value-step).toFixed(4)));
  return(
    <span data-var={id} style={{...st.stepper, ...(color ? {border:`1.5px solid ${color}`, borderRadius:8, padding:"3px 8px 4px", background:"#fff"} : {})}}>
      {label && <span style={{...st.gL2, ...(color?{color}:{})}}>{label}</span>}
      <span style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:label?2:0}}>
        <button style={st.sBtn} onClick={dec} aria-label="decrease">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5h6" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <span style={{...st.sVal, ...(color?{color:"#1c1c1c",fontWeight:600,background:"transparent",border:"none",padding:0,minWidth:0}:{})}}>{display}</span>
        <button style={st.sBtn} onClick={inc} aria-label="increase">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2v6M2 5h6" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </span>
    </span>
  );
}
const Op=({c})=><span style={st.op}>{c}</span>;

const DEFAULT_STATE = { curAge:28, retAge:35, curInv:75000, realRet:3.5, swrPct:3.6, spendMo:8000 };

export default function App(){
  /* Plan id from hash */
  const planId = useMemo(()=>{
    const m = window.location.hash.match(/plan=([\w-]+)/);
    return m ? m[1] : "advisor-mati";
  },[]);
  const [s, setS] = useState(DEFAULT_STATE);
  const [sync, setSync] = useState({ live:false, last:null });
  const skipSave = useRef(true);

  /* Supabase load + subscribe */
  useEffect(()=>{
    if (!isSupabase) return;
    let chan;
    (async ()=>{
      const { data } = await supabase.from("retire_plans").select("state, updated_at").eq("id", planId).maybeSingle();
      if (data?.state){
        skipSave.current = true;
        setS(prev => ({ ...prev, ...data.state }));
        setSync({ live:true, last:data.updated_at });
      } else setSync(p=>({ ...p, live:true }));
      chan = supabase.channel("rp:"+planId)
        .on("postgres_changes", { event:"*", schema:"public", table:"retire_plans", filter:`id=eq.${planId}` }, payload => {
          if (payload.new?.state){
            skipSave.current = true;
            setS(prev => ({ ...prev, ...payload.new.state }));
            setSync({ live:true, last:payload.new.updated_at });
          }
        })
        .subscribe();
    })();
    return ()=>{ if (chan) supabase.removeChannel(chan); };
  }, [planId]);

  /* Debounced save */
  useEffect(()=>{
    if (!isSupabase) return;
    if (skipSave.current){ skipSave.current = false; return; }
    const t = setTimeout(async ()=>{
      const { data } = await supabase.from("retire_plans").upsert({ id:planId, state:s, updated_at: new Date().toISOString() }).select("updated_at").maybeSingle();
      if (data) setSync(p=>({ ...p, last:data.updated_at }));
    }, 400);
    return ()=>clearTimeout(t);
  }, [s, planId]);

  const set = (k,v) => setS(p => ({ ...p, [k]: v }));
  const applyScenario = (sc) => {
    skipSave.current = false;
    setS(p => ({ ...p, realRet:sc.realRet, swrPct:sc.swrPct, spendMo:sc.spendMo }));
  };

  /* ── Derived math (today's $, REAL return — won't go negative, no inflation drift) ── */
  const Y  = Math.max(0.0001, s.retAge - s.curAge);     // years till retirement
  const n  = Math.round(Y*12);                          // months
  const r  = s.realRet/100;                             // real return decimal (3.5 → 0.035)
  const swr = s.swrPct/100;                             // safe withdrawal rate (3.6 → 0.036)
  const rm = Math.pow(1+r, 1/12) - 1;                   // monthly real rate
  const E  = s.spendMo*12;                              // annual retirement expenses (today's $)
  const N  = swr > 0 ? E/swr : 0;                       // target nest egg (today's $)
  const FVcur = s.curInv * Math.pow(1+r, Y);            // future value of current inv (today's $)
  const Need = Math.max(0, N - FVcur);                  // gap to fund via contributions
  const M = (rm > 0 && n > 0) ? (Need*rm)/(Math.pow(1+rm,n) - 1) : (n > 0 ? Need/n : 0);
  const Total = M*n;
  const onTrack = FVcur >= N && N > 0;

  /* ── Connections (from-pill → to-pill) ── */
  const conns = [
    {from:"hero-M",  to:"eq1-M",   color:C_RATE},
    {from:"eq1-N",   to:"eq2-N",   color:C_NEST},
    {from:"eq1-FV",  to:"eq3-FV",  color:C_FV},
    {from:"eq1-rm",  to:"eq6-rm",  color:C_RATE},
    {from:"eq1-n",   to:"eq5-n",   color:C_MONTHS},
    {from:"eq2-E",   to:"eq4-E",   color:C_EXP},
    {from:"eq2-SWR", to:"def-SWR", color:C_SWR},
    {from:"eq3-Inv", to:"def-Inv", color:C_INV},
    {from:"eq3-r",   to:"def-r",   color:C_RATE},
    {from:"eq3-Y",   to:"eq5-Y",   color:C_YEARS},
    {from:"eq4-Mo",  to:"def-Mo",  color:C_MO},
    {from:"eq6-r",   to:"def-r",   color:C_RATE},
    {from:"eq5-RA",  to:"def-RA",  color:C_RETAGE},
    {from:"eq5-CA",  to:"def-CA",  color:C_AGE},
  ];

  const cRef = useRef(null), svgRef = useRef(null);
  useEffect(()=>{
    const draw = () => {
      const cont = cRef.current, svg = svgRef.current;
      if (!cont || !svg) return;
      svg.setAttribute("width", cont.scrollWidth); svg.setAttribute("height", cont.scrollHeight);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const cr = cont.getBoundingClientRect();
      const pos = id => { const el = cont.querySelector('[data-var="'+id+'"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.left-cr.left+r.width/2, top: r.top-cr.top, bot: r.bottom-cr.top }; };
      conns.forEach(conn => {
        const a = pos(conn.from), b = pos(conn.to); if (!a || !b) return;
        const x1=a.cx, y1=a.bot+1, x2=b.cx, y2=b.top-1, dy=y2-y1; if (dy < 6) return;
        const cp = Math.min(Math.max(18, dy*0.4), 120);
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        path.setAttribute("d", "M"+x1+","+y1+" C"+x1+","+(y1+cp)+" "+x2+","+(y2-cp)+" "+x2+","+y2);
        path.setAttribute("stroke", conn.color); path.setAttribute("stroke-width","1.5");
        path.setAttribute("fill","none"); path.setAttribute("opacity","0.38"); svg.appendChild(path);
        const sz = 4.5; const tri = document.createElementNS("http://www.w3.org/2000/svg","polygon");
        tri.setAttribute("points", x2+","+y2+" "+(x2-sz)+","+(y2-sz*1.7)+" "+(x2+sz)+","+(y2-sz*1.7));
        tri.setAttribute("fill", conn.color); tri.setAttribute("opacity","0.45"); svg.appendChild(tri);
      });
    };
    const raf = () => requestAnimationFrame(draw);
    const timer = setTimeout(raf, 120);
    window.addEventListener("resize", raf);
    return () => { clearTimeout(timer); window.removeEventListener("resize", raf); };
  });

  return (
    <div style={st.pg}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}body{background:#f6f4f0}
        button{background:none;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:inherit}
      `}</style>

      <div style={st.hero}>
        <div style={st.hL}>REQUIRED MONTHLY CONTRIBUTION</div>
        <div data-var="hero-M" style={st.hN}>{onTrack?"$0":fmt(M)}</div>
        <div style={st.hS}>
          {onTrack
            ? <>You're already on track. Projected nest egg: <b>{fmtM(FVcur)}</b> at age {s.retAge}.</>
            : <>Invest <b>{fmt(M)}/mo</b> for <b>{Y.toFixed(1)} yrs</b> ({n} mo) &nbsp;·&nbsp; Total contributed: <b>{fmtM(Total)}</b></>}
        </div>
        <div style={st.hMeta}>
          Target nest egg: <b>{fmtM(N)}</b> &nbsp;·&nbsp; Today's investments grow to <b>{fmtM(FVcur)}</b> &nbsp;·&nbsp; Gap: <b>{fmtM(Need)}</b>
        </div>
        <div style={st.note}>All values in today's dollars using a real (inflation-adjusted) return. Never depletes by construction (perpetual SWR).</div>
        <div style={st.syncRow}>
          <span style={{...st.dot, background: sync.live?"#3a9e6e":"#c0b8a8"}}/>
          <span style={st.syncTxt}>{isSupabase ? (sync.live ? "LIVE · synced with advisor" : "connecting…") : "local only"} · plan <b>{planId}</b></span>
        </div>
      </div>

      <div ref={cRef} style={st.board}>
        <svg ref={svgRef} style={st.svg}/>

        {/* Scenarios */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Advisor scenarios (one click to apply)</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
            {SCENARIOS.map(sc => {
              const active = s.realRet===sc.realRet && s.swrPct===sc.swrPct && s.spendMo===sc.spendMo;
              const nest = (sc.spendMo*12)/(sc.swrPct/100);
              return (
                <button key={sc.key} onClick={()=>applyScenario(sc)} style={{...st.scBtn, ...(active?st.scBtnA:{})}}>
                  <div style={{fontSize:12,fontWeight:600}}>{sc.label}</div>
                  <div style={{fontSize:10,color:"#888",marginTop:2}}>{sc.note}</div>
                  <div style={{fontSize:11,marginTop:4,color:"#1c1c1c"}}>Implied nest egg: <b>{fmtM(nest)}</b></div>
                </button>
              );
            })}
          </div>
        </div></div>

        {/* Equation 1: Monthly Contribution */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Monthly Contribution Required</div>
          <div style={st.ml}>
            <span data-var="eq1-M" style={st.dv}>M</span> <Op c="="/>{" "}
            <span style={st.frac}>
              <span style={st.fracTop}>(<Pill name="Nest Egg" id="eq1-N" color={C_NEST}/> <Op c="−"/> <Pill name="FV of Current" id="eq1-FV" color={C_FV}/>) <Op c="×"/> <Pill name="r/mo" id="eq1-rm" color={C_RATE}/></span>
              <span style={st.fracBar}/>
              <span style={st.fracBot}>(1 + <Pill name="r/mo" id="eq1-rm-b" color={C_RATE}/>)<sup>n</sup> <Op c="−"/> 1</span>
            </span>
            <Op c="·"/>
            <span style={st.it2}>n = </span><Pill name="Months" id="eq1-n" color={C_MONTHS}/>
          </div>
          <div style={st.rr}>= {fmt(M)}/mo &nbsp;·&nbsp; total {fmtM(Total)} over {n} mo</div>
        </div></div>

        {/* Equation 2: Nest Egg */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Target Nest Egg (4% rule style)</div>
          <div style={st.ml}>
            <Pill name="Nest Egg" id="eq2-N" color={C_NEST}/> <Op c="="/>{" "}
            <span style={st.frac}>
              <span style={st.fracTop}><Pill name="Annual Expenses" id="eq2-E" color={C_EXP}/></span>
              <span style={st.fracBar}/>
              <span style={st.fracBot}><Pill name="SWR" id="eq2-SWR" color={C_SWR}/></span>
            </span>
          </div>
          <div style={st.rr}>= {fmtM(N)} &nbsp;·&nbsp; ≈ {s.swrPct.toFixed(1)}% withdrawal × {fmtM(N)} = {fmt(N*swr)}/yr</div>
        </div></div>

        {/* Equation 3: FV of current investments */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Future Value of Current Investments</div>
          <div style={st.ml}>
            <Pill name="FV of Current" id="eq3-FV" color={C_FV}/> <Op c="="/>{" "}
            <Pill name="Investments" id="eq3-Inv" color={C_INV}/> <Op c="×"/>{" "}
            (1 + <Pill name="r" id="eq3-r" color={C_RATE}/>)<sup style={{fontSize:10}}>
              <Pill name="Years" id="eq3-Y" color={C_YEARS}/>
            </sup>
          </div>
          <div style={st.rr}>= {fmt(s.curInv)} × (1+{s.realRet.toFixed(1)}%)^{Y.toFixed(1)} = {fmtM(FVcur)}</div>
        </div></div>

        {/* Equation 4: Annual Expenses (single $/mo) */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Annual Retirement Expenses (today's $)</div>
          <div style={st.ml}>
            <Pill name="Annual Expenses" id="eq4-E" color={C_EXP}/> <Op c="="/>{" "}
            <Pill name="Monthly Spend" id="eq4-Mo" color={C_MO}/> <Op c="×"/> <span style={st.opNum}>12</span>
          </div>
          <div style={st.rr}>= {fmt(s.spendMo)}/mo × 12 = {fmt(E)}/yr</div>
        </div></div>

        {/* Equation 5: Time horizon + Plan inputs */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Time Horizon &amp; Plan Inputs</div>
          <div style={{...st.ml,fontSize:14,gap:"6px 10px"}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
              <Pill name="Years" id="eq5-Y" color={C_YEARS}/> <Op c="="/>
              <Pill name="Retire Age" id="eq5-RA" color={C_RETAGE}/> <Op c="−"/>
              <Pill name="Current Age" id="eq5-CA" color={C_AGE}/>
              <span style={st.eqResult}>= {Y.toFixed(1)} yrs</span>
            </span>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
              <Pill name="Months" id="eq5-n" color={C_MONTHS}/> <Op c="="/>
              <Pill name="Years" id="eq5-Y-b" color={C_YEARS}/> <Op c="×"/> 12
              <span style={st.eqResult}>= {n} mo</span>
            </span>
          </div>
          <div style={{...st.subEq,marginTop:10,gap:"10px 14px",flexWrap:"wrap"}}>
            <Num id="def-CA"  label="Current Age"     color={C_AGE}    value={s.curAge}  onChange={v=>set("curAge",v)}  step={1}    min={1}             max={s.retAge-1} pre="" suf=" yr"/>
            <Num id="def-RA"  label="Retire Age"      color={C_RETAGE} value={s.retAge}  onChange={v=>set("retAge",v)}  step={1}    min={s.curAge+1}    max={80}         pre="" suf=" yr"/>
            <Num id="def-Inv" label="Investments"     color={C_INV}    value={s.curInv}  onChange={v=>set("curInv",v)}  step={5000} min={0}                              pre="$"/>
            <Num id="def-Mo"  label="Monthly Spend"   color={C_MO}     value={s.spendMo} onChange={v=>set("spendMo",v)} step={250}  min={0}                              pre="$"/>
            <Num id="def-r"   label="r (real) /yr"    color={C_RATE}   value={s.realRet} onChange={v=>set("realRet",v)} step={0.1}  min={0}             max={20}         decimals={1} pre="" suf="%"/>
            <Num id="def-SWR" label="SWR"             color={C_SWR}    value={s.swrPct}  onChange={v=>set("swrPct",v)}  step={0.1}  min={1}             max={10}         decimals={1} pre="" suf="%"/>
          </div>
          <div style={{fontSize:10,color:"#aaa",marginTop:8,fontStyle:"italic"}}>
            Real return = nominal − inflation. SWR 4% is the Trinity Study rule of thumb, advisor uses ~3.6% for the 55-year horizon. Click any pill above to highlight what flows into it.
          </div>
        </div></div>

        {/* Equation 6: monthly rate from annual */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Monthly Rate Conversion</div>
          <div style={st.ml}>
            <Pill name="r/mo" id="eq6-rm" color={C_RATE}/> <Op c="="/>{" "}
            (1 + <Pill name="r" id="eq6-r" color={C_RATE}/>)<sup>1/12</sup> <Op c="−"/> 1
          </div>
          <div style={st.rr}>= {(rm*100).toFixed(4)}% /mo</div>
        </div></div>

        {/* Summary card for advisor */}
        <div style={{...st.rc,marginTop:18}}><div style={{...st.eq,background:"#1c1c1c",color:"#e8e4dd"}}>
          <div style={{...st.tag,color:"#888"}}>Plan Summary (for advisor)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:8,fontFamily:"'DM Sans',sans-serif"}}>
            <div><div style={st.sumK}>Years to retirement</div><div style={st.sumV}>{Y.toFixed(1)} yrs</div></div>
            <div><div style={st.sumK}>Annual expenses</div><div style={st.sumV}>{fmt(E)}</div></div>
            <div><div style={st.sumK}>Target nest egg</div><div style={st.sumV}>{fmtM(N)}</div></div>
            <div><div style={st.sumK}>Today's investments</div><div style={st.sumV}>{fmt(s.curInv)}</div></div>
            <div><div style={st.sumK}>Projected at retire age</div><div style={st.sumV}>{fmtM(FVcur)}</div></div>
            <div><div style={st.sumK}>Funding gap</div><div style={st.sumV}>{fmtM(Need)}</div></div>
            <div><div style={st.sumK}>Monthly contribution</div><div style={{...st.sumV,color:"#ffd28a"}}>{fmt(M)}</div></div>
            <div><div style={st.sumK}>Total contributed</div><div style={st.sumV}>{fmtM(Total)}</div></div>
            <div><div style={st.sumK}>Real return assumption</div><div style={st.sumV}>{s.realRet.toFixed(1)}% /yr</div></div>
            <div><div style={st.sumK}>SWR assumption</div><div style={st.sumV}>{s.swrPct.toFixed(1)}%</div></div>
          </div>
          <div style={{fontSize:10,color:"#888",marginTop:14,lineHeight:1.6}}>
            Share with advisor: <code style={{background:"#2a2a2a",padding:"2px 6px",borderRadius:3,color:"#ffd28a"}}>{window.location.origin + window.location.pathname + "#plan=" + planId}</code><br/>
            Both edit live. Last sync: {sync.last ? new Date(sync.last).toLocaleString() : "—"}.
          </div>
        </div></div>
      </div>
      <BugReportButton planId={planId} planState={s}/>
      <div style={{height:32}}/>
    </div>
  );
}

const st={
  pg:{minHeight:"100vh",background:"#f6f4f0",fontFamily:"'DM Sans',system-ui,sans-serif",padding:0,maxWidth:960,margin:"0 auto",color:"#1c1c1c"},
  hero:{textAlign:"center",padding:"16px 16px 14px",background:"#fff",borderBottom:"1px solid #e8e4dd",position:"sticky",top:0,zIndex:30},
  hL:{fontSize:11,letterSpacing:"0.14em",color:"#aaa",fontWeight:500,marginBottom:2},
  hN:{fontSize:"clamp(32px,8vw,52px)",fontWeight:300,color:"#1c1c1c",letterSpacing:"-0.02em",lineHeight:1.15,fontFamily:"'Source Serif 4',Georgia,serif",display:"inline-block"},
  hS:{fontSize:13,color:"#777",marginTop:4},
  hMeta:{fontSize:12,color:"#999",marginTop:4},
  note:{fontSize:10,color:"#bbb",marginTop:6,fontStyle:"italic"},
  syncRow:{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,fontSize:11,color:"#888"},
  dot:{width:7,height:7,borderRadius:"50%",display:"inline-block"},
  syncTxt:{},
  board:{position:"relative",padding:"12px 12px 8px",zIndex:0},
  svg:{position:"absolute",top:0,left:0,pointerEvents:"none",zIndex:3},
  rc:{display:"flex",justifyContent:"center",marginBottom:12},
  eq:{flex:1,background:"#fff",borderRadius:10,padding:"10px 14px 12px"},
  tag:{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"#c0b8a8",marginBottom:4},
  ml:{fontFamily:"'Source Serif 4',Georgia,serif",fontSize:15,display:"flex",flexWrap:"wrap",alignItems:"center",gap:"4px 6px",lineHeight:1.5,color:"#1c1c1c"},
  pill:{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:12,border:"1.5px solid",fontSize:12,fontWeight:500,fontFamily:"'DM Sans',sans-serif",fontStyle:"normal",whiteSpace:"nowrap",background:"#fff",position:"relative",zIndex:25,lineHeight:1.3},
  dv:{fontSize:18,fontStyle:"italic",fontWeight:600,fontFamily:"'Source Serif 4',Georgia,serif",color:"#1c1c1c"},
  op:{fontStyle:"normal",color:"#bbb",fontSize:13,padding:"0 1px"},
  rr:{fontSize:12,color:"#b5ad9e",fontFamily:"'DM Sans',sans-serif",marginTop:6,textAlign:"right"},
  inlineItem:{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:0},
  gL2:{fontSize:8,color:"#b0a89a",textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:500,lineHeight:1},
  opNum:{fontSize:13,fontWeight:500,fontFamily:"'Source Serif 4',serif",color:"#888"},
  eqResult:{fontSize:13,fontWeight:600,fontFamily:"'DM Sans'",color:"#1c1c1c"},
  subEq:{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"3px 5px",lineHeight:1.5},
  it2:{fontSize:12,fontStyle:"italic",fontFamily:"'Source Serif 4',serif",color:"#888"},
  stepper:{display:"inline-flex",flexDirection:"column",alignItems:"center",position:"relative",zIndex:25},
  sBtn:{padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:28,minWidth:36},
  sVal:{fontSize:13,fontWeight:500,fontFamily:"'DM Sans',sans-serif",color:"#333",background:"#f0ede8",border:"1px solid #e0dbd3",borderRadius:4,padding:"2px 6px",minWidth:40,textAlign:"center",fontStyle:"normal",lineHeight:1.3},
  frac:{display:"inline-flex",flexDirection:"column",alignItems:"center",verticalAlign:"middle",margin:"0 4px"},
  fracTop:{display:"flex",alignItems:"center",gap:4,padding:"0 4px",fontSize:13,flexWrap:"wrap",justifyContent:"center"},
  fracBar:{height:1,background:"#999",width:"100%",margin:"3px 0",alignSelf:"stretch"},
  fracBot:{display:"flex",alignItems:"center",gap:4,padding:"0 4px",fontSize:13,flexWrap:"wrap",justifyContent:"center"},
  defBox:{border:"1px dashed #e0dbd3",borderRadius:6,padding:"3px 8px",background:"#fafaf7"},
  defVal:{fontSize:13,fontWeight:600,color:"#333",fontFamily:"'DM Sans',sans-serif",marginTop:2},
  sumK:{fontSize:10,color:"#888",letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500},
  sumV:{fontSize:18,color:"#fff",fontFamily:"'Source Serif 4',Georgia,serif",fontWeight:300,marginTop:2},
  scBtn:{flex:"1 1 200px",minWidth:180,maxWidth:240,textAlign:"left",background:"#fafaf7",border:"1px solid #e8e4dd",borderRadius:8,padding:"8px 10px",cursor:"pointer"},
  scBtnA:{borderColor:"#2a9d8f",background:"#eaf6f3"},
};
