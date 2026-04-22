import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend } from "recharts";
import Mermaid from "./Mermaid.jsx";
import { supabase, isSupabase } from "./supabase.js";

/* ─────────────  Constants  ───────────── */
const PRESETS = {
  "advisor-baseline": {
    label: "Advisor baseline ($6M-ish)",
    note: "Advisor's napkin: 55yr horizon, $15K/mo, 3% infl, 6.5% return, no kids.",
    state: { curAge:35, retAge:35, lifeExp:90, curInv:6000000, contribMo:0, retNom:65, infl:30, baseMo:15000, kids:0, kidExtraMo:0, kidStart:35, kidEnd:53, midMult:100, oldMult:100, badSeq:false },
  },
  "advisor-2kids": {
    label: "With 2 kids ($10M target)",
    note: "Same horizon but +$2K/mo per kid age 35→53. Advisor said 6M won't work with kids.",
    state: { curAge:35, retAge:35, lifeExp:90, curInv:10000000, contribMo:0, retNom:65, infl:30, baseMo:15000, kids:2, kidExtraMo:2000, kidStart:35, kidEnd:53, midMult:100, oldMult:90, badSeq:false },
  },
  "advisor-lowreturns": {
    label: "If returns are 4% ($10M)",
    note: "Stress test: returns 4% instead of 6.5%. Advisor: drops to 10M.",
    state: { curAge:35, retAge:35, lifeExp:90, curInv:10000000, contribMo:0, retNom:40, infl:30, baseMo:15000, kids:0, kidExtraMo:0, kidStart:35, kidEnd:53, midMult:100, oldMult:90, badSeq:false },
  },
  "advisor-highinfl": {
    label: "Inflation +0.5% ($7M)",
    note: "Same as baseline but inflation 3.5%. Advisor: bumps to ~7M.",
    state: { curAge:35, retAge:35, lifeExp:90, curInv:7000000, contribMo:0, retNom:65, infl:35, baseMo:15000, kids:0, kidExtraMo:0, kidStart:35, kidEnd:53, midMult:100, oldMult:100, badSeq:false },
  },
  "matt-current": {
    label: "Matt's current plan",
    note: "Working from current age toward 35. Solve for monthly contribution.",
    state: { curAge:28, retAge:35, lifeExp:90, curInv:75000, contribMo:8000, retNom:65, infl:30, baseMo:8000, kids:2, kidExtraMo:1500, kidStart:35, kidEnd:53, midMult:100, oldMult:80, badSeq:false },
  },
};

const DEFAULT_STATE = PRESETS["matt-current"].state;

/* ─────────────  Helpers  ───────────── */
const fmt$ = v => (v<0?"−$":"$") + Math.round(Math.abs(v)).toLocaleString();
const fmt$M = v => "$" + (v/1e6).toFixed(2) + "M";
const fmtPct = v => v.toFixed(2) + "%";

function ageMultiplier(age, retAge, midMult, oldMult){
  // 35→55 base (1.0). 55→70 midMult. 70+ oldMult.
  if (age < 55) return 1.0;
  if (age < 70) return midMult/100;
  return oldMult/100;
}

/** Simulate year by year. Returns {trajectory:[{age,portfolio,spend,contrib}], endBalance, depleteAge, peakNeeded}. */
function simulate(s, opts={}){
  const { curAge, retAge, lifeExp, curInv, contribMo, retNom, infl, baseMo, kids, kidExtraMo, kidStart, kidEnd, midMult, oldMult } = s;
  const r = retNom/1000;       // nominal return (e.g. 65 → 6.5%)
  const i = infl/1000;         // inflation
  const overrideContrib = opts.contribMo != null ? opts.contribMo : contribMo;
  const badSeq = opts.badSeq != null ? opts.badSeq : s.badSeq;
  let portfolio = curInv;
  const traj = [];
  let depleteAge = null;
  let peakNeeded = curInv;
  for (let age = curAge; age <= lifeExp; age++){
    const yrFromNow = age - curAge;
    let yearReturn = r;
    if (badSeq && age >= retAge && age < retAge+5) yearReturn = -0.02; // bad sequence stress
    const inflMult = Math.pow(1+i, yrFromNow);
    let contrib = 0, spend = 0;
    if (age < retAge){
      contrib = overrideContrib*12;
      portfolio = portfolio*(1+yearReturn) + contrib;
    } else {
      const mult = ageMultiplier(age, retAge, midMult, oldMult);
      let monthlySpend = baseMo * mult;
      if (age >= kidStart && age < kidEnd) monthlySpend += kids * kidExtraMo;
      spend = monthlySpend*12*inflMult;
      portfolio = (portfolio - spend) * (1+yearReturn);
    }
    if (age === retAge) peakNeeded = Math.max(peakNeeded, portfolio);
    if (depleteAge==null && portfolio < 0) depleteAge = age;
    traj.push({ age, portfolio: Math.round(portfolio), spend: Math.round(spend), contrib: Math.round(contrib), inflMult });
  }
  return { trajectory: traj, endBalance: portfolio, depleteAge, peakNeeded };
}

/** Binary search the monthly contribution that ends with ~0 balance. */
function solveContribution(s){
  let lo = 0, hi = 100000;
  for (let k=0; k<40; k++){
    const mid = (lo+hi)/2;
    const { endBalance } = simulate(s, { contribMo: mid });
    if (endBalance > 0) hi = mid; else lo = mid;
  }
  return Math.round((lo+hi)/2);
}

/** Solve required nest egg at retAge to make balance hit zero at lifeExp (zero contrib post). */
function solveNestEgg(s){
  let lo = 0, hi = 50_000_000;
  for (let k=0; k<40; k++){
    const mid = (lo+hi)/2;
    const trial = { ...s, curAge: s.retAge, curInv: mid, contribMo: 0 };
    const { endBalance } = simulate(trial);
    if (endBalance > 0) hi = mid; else lo = mid;
  }
  return Math.round((lo+hi)/2);
}

/* ─────────────  Atoms  ───────────── */
function Stepper({ value, onChange, step=100, min=0, max=99999999, pre="$", suf="" }){
  return (
    <span style={S.stepper}>
      <button style={S.sBtn} onClick={()=>onChange(Math.min(max,value+step))} aria-label="up">▲</button>
      <span style={S.sVal}>{pre}{value.toLocaleString()}{suf}</span>
      <button style={S.sBtn} onClick={()=>onChange(Math.max(min,value-step))} aria-label="down">▼</button>
    </span>
  );
}

function Field({ label, hint, children }){
  return (
    <div style={S.field}>
      <div style={S.fLabel}>{label}</div>
      {children}
      {hint && <div style={S.fHint}>{hint}</div>}
    </div>
  );
}

function Stat({ label, value, color, big }){
  return (
    <div style={S.stat}>
      <div style={S.statL}>{label}</div>
      <div style={{...S.statV, color: color||"#1c1c1c", fontSize: big?32:20}}>{value}</div>
    </div>
  );
}

/* ─────────────  App  ───────────── */
export default function App(){
  // plan id from URL hash (e.g. #plan=advisor-matt). Default: shared room.
  const planId = useMemo(()=>{
    const m = window.location.hash.match(/plan=([\w-]+)/);
    return m ? m[1] : "advisor-matt";
  },[]);
  const [state, setState] = useState(DEFAULT_STATE);
  const [sync, setSync] = useState({ live:false, last:null });
  const [scenario, setScenario] = useState("matt-current");
  const skipSave = useRef(true);

  /* Load + subscribe */
  useEffect(()=>{
    if (!isSupabase) return;
    let chan;
    (async ()=>{
      const { data } = await supabase.from("retire_plans").select("state, updated_at").eq("id", planId).maybeSingle();
      if (data && data.state) {
        skipSave.current = true;
        setState(prev => ({ ...prev, ...data.state }));
        setSync({ live:true, last: data.updated_at });
      } else {
        setSync(s=>({ ...s, live:true }));
      }
      chan = supabase.channel("rp:"+planId)
        .on("postgres_changes", { event:"*", schema:"public", table:"retire_plans", filter:`id=eq.${planId}` }, payload => {
          const next = payload.new && payload.new.state;
          if (next) {
            skipSave.current = true;
            setState(prev => ({ ...prev, ...next }));
            setSync({ live:true, last: payload.new.updated_at });
          }
        })
        .subscribe();
    })();
    return ()=>{ if (chan) supabase.removeChannel(chan); };
  }, [planId]);

  /* Debounced save on change */
  useEffect(()=>{
    if (!isSupabase) return;
    if (skipSave.current){ skipSave.current = false; return; }
    const t = setTimeout(async ()=>{
      const { data } = await supabase.from("retire_plans").upsert({ id: planId, state, updated_at: new Date().toISOString() }).select("updated_at").maybeSingle();
      if (data) setSync(s=>({ ...s, last: data.updated_at }));
    }, 400);
    return ()=>clearTimeout(t);
  }, [state, planId]);

  const set = (k,v)=> setState(p=>({...p,[k]:v}));
  const applyPreset = (key) => {
    setScenario(key);
    skipSave.current = false;
    setState(prev => ({ ...prev, ...PRESETS[key].state }));
  };

  /* Derived sims */
  const sim     = useMemo(()=>simulate(state), [state]);
  const simBad  = useMemo(()=>simulate(state, { badSeq:true }), [state]);
  const reqNest = useMemo(()=>solveNestEgg(state), [state]);
  const reqContrib = useMemo(()=>state.curAge < state.retAge ? solveContribution(state) : 0, [state]);

  const yearsTo = state.retAge - state.curAge;
  const inflMultRet = Math.pow(1 + state.infl/1000, yearsTo);
  const annualSpendNow = state.baseMo*12;
  const annualSpendRetNom = annualSpendNow * inflMultRet;
  const fvCur = state.curInv * Math.pow(1 + state.retNom/1000, yearsTo);

  const chartData = sim.trajectory.map((d,idx)=>({
    age: d.age,
    portfolio: d.portfolio,
    badSeq: simBad.trajectory[idx]?.portfolio,
    spend: d.spend,
  }));

  const ok = sim.endBalance >= 0;

  /* Mermaid diagram of the model */
  const mermaidChart = `flowchart TD
    A[Current Age ${state.curAge}<br/>Investments ${fmt$M(state.curInv)}] --> B[Grow at ${(state.retNom/10).toFixed(1)}% nominal<br/>+ ${fmt$(state.contribMo)}/mo contrib]
    B --> C{At Retire Age ${state.retAge}<br/>Portfolio ≈ ${fmt$M(fvCur)}}
    D[Base spend ${fmt$(state.baseMo)}/mo today] --> E[Inflate ${(state.infl/10).toFixed(1)}%/yr<br/>${yearsTo}yr → ${(inflMultRet).toFixed(2)}× = ${fmt$(state.baseMo*inflMultRet)}/mo at ret]
    E --> F[Apply life-stage multipliers<br/>35-55: 100% · 55-70: ${state.midMult}% · 70+: ${state.oldMult}%]
    F --> G[Add kids cost: ${state.kids}× ${fmt$(state.kidExtraMo)}/mo<br/>ages ${state.kidStart}-${state.kidEnd}]
    C --> H[Year-by-year sim to age ${state.lifeExp}]
    G --> H
    H --> I{End balance: ${fmt$M(sim.endBalance)}}
    I -->|${ok?"✓ funded":"✗ depleted at age "+sim.depleteAge}| J[Required nest egg @ ${state.retAge}: ${fmt$M(reqNest)}]
    style I fill:${ok?"#e8f4ee":"#fbe8e8"},stroke:${ok?"#3a9e6e":"#c95858"}
    style J fill:#fff8e6,stroke:#b8892a
  `;

  return (
    <div style={S.pg}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@300;400;600&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#f6f4f0;font-family:'DM Sans',system-ui,sans-serif;color:#1c1c1c}
        button{background:none;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={S.hRow}>
          <div>
            <div style={S.kicker}>RETIRE AT 35 · LIVING DOCUMENT</div>
            <div style={S.title}>Year-by-year retirement plan</div>
          </div>
          <div style={S.syncBox}>
            <span style={{...S.dot, background: sync.live ? "#3a9e6e" : "#c0b8a8"}}/>
            <div>
              <div style={S.syncL}>{isSupabase ? (sync.live ? "LIVE · synced" : "connecting…") : "local only"}</div>
              <div style={S.syncId}>plan: <b>{planId}</b></div>
            </div>
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div style={S.kpis}>
        <Stat label="REQUIRED NEST EGG @ RETIRE" value={fmt$M(reqNest)} color="#2a9d8f" big/>
        <Stat label="PROJECTED PORTFOLIO @ RETIRE" value={fmt$M(fvCur)} color={fvCur>=reqNest?"#3a9e6e":"#c95858"} big/>
        <Stat label={`MONTHLY CONTRIB. NEEDED (to age ${state.retAge})`} value={fmt$(reqContrib)} color="#b8892a" big/>
        <Stat label={`END BALANCE @ AGE ${state.lifeExp}`} value={fmt$M(sim.endBalance)} color={ok?"#3a9e6e":"#c95858"} big/>
      </div>

      {/* Scenario switcher */}
      <div style={S.scenarios}>
        <div style={S.kicker}>ADVISOR SCENARIOS</div>
        <div style={S.presetRow}>
          {Object.entries(PRESETS).map(([k,p])=>(
            <button key={k} onClick={()=>applyPreset(k)} style={{...S.preset, ...(scenario===k?S.presetActive:{})}}>
              <div style={S.presetLabel}>{p.label}</div>
              <div style={S.presetNote}>{p.note}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Plan inputs</div>
        <div style={S.grid}>
          <Field label="Current age"><Stepper value={state.curAge} onChange={v=>set("curAge",v)} step={1} min={1} max={100} pre="" suf=" yr"/></Field>
          <Field label="Retirement age"><Stepper value={state.retAge} onChange={v=>set("retAge",v)} step={1} min={state.curAge} max={100} pre="" suf=" yr"/></Field>
          <Field label="Life expectancy"><Stepper value={state.lifeExp} onChange={v=>set("lifeExp",v)} step={1} min={state.retAge} max={120} pre="" suf=" yr"/></Field>
          <Field label="Investments today"><Stepper value={state.curInv} onChange={v=>set("curInv",v)} step={5000}/></Field>
          <Field label="Monthly contribution (now → retire)" hint={`Solver says: ${fmt$(reqContrib)}/mo to fully fund`}><Stepper value={state.contribMo} onChange={v=>set("contribMo",v)} step={250}/></Field>
          <Field label="Nominal return /yr" hint="Per-mille (65 = 6.5%)"><Stepper value={state.retNom} onChange={v=>set("retNom",v)} step={5} min={0} max={300} pre="" suf="‰"/></Field>
          <Field label="Inflation /yr" hint="Per-mille (30 = 3.0%)"><Stepper value={state.infl} onChange={v=>set("infl",v)} step={5} min={0} max={200} pre="" suf="‰"/></Field>
          <Field label="Base spend (today's $/mo)" hint={`At retire age ≈ ${fmt$(state.baseMo*inflMultRet)}/mo nominal`}><Stepper value={state.baseMo} onChange={v=>set("baseMo",v)} step={250}/></Field>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Life stages</div>
        <div style={S.grid}>
          <Field label="# of kids"><Stepper value={state.kids} onChange={v=>set("kids",v)} step={1} min={0} max={6} pre="" suf=""/></Field>
          <Field label="Extra spend per kid /mo (today's $)"><Stepper value={state.kidExtraMo} onChange={v=>set("kidExtraMo",v)} step={250}/></Field>
          <Field label="Kid cost starts at age"><Stepper value={state.kidStart} onChange={v=>set("kidStart",v)} step={1} min={20} max={70} pre="" suf=" yr"/></Field>
          <Field label="Kid cost ends at age"><Stepper value={state.kidEnd} onChange={v=>set("kidEnd",v)} step={1} min={state.kidStart} max={80} pre="" suf=" yr"/></Field>
          <Field label="Mid-life multiplier (age 55-70)" hint="% of base spend"><Stepper value={state.midMult} onChange={v=>set("midMult",v)} step={5} min={0} max={200} pre="" suf="%"/></Field>
          <Field label="Old-age multiplier (age 70+)" hint="% of base spend"><Stepper value={state.oldMult} onChange={v=>set("oldMult",v)} step={5} min={0} max={200} pre="" suf="%"/></Field>
        </div>
      </div>

      {/* Chart */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Portfolio over time (nominal $)</div>
        <div style={{height:340, marginTop:8}}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{top:10,right:20,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dd"/>
              <XAxis dataKey="age" tick={{fontSize:11}} label={{value:"age", position:"insideBottomRight", offset:-5, fontSize:11, fill:"#888"}}/>
              <YAxis tick={{fontSize:11}} tickFormatter={v=>"$"+(v/1e6).toFixed(1)+"M"}/>
              <Tooltip formatter={(v)=>fmt$(v)} labelFormatter={l=>"age "+l}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              <ReferenceLine x={state.retAge} stroke="#b8892a" strokeDasharray="4 4" label={{value:"retire", fontSize:10, fill:"#b8892a"}}/>
              <ReferenceLine y={0} stroke="#c95858" strokeWidth={1}/>
              <Line type="monotone" dataKey="portfolio" name="portfolio (avg returns)" stroke="#2a9d8f" strokeWidth={2.5} dot={false}/>
              <Line type="monotone" dataKey="badSeq" name="bad sequence (-2% first 5yrs of retire)" stroke="#c95858" strokeWidth={1.5} strokeDasharray="4 4" dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={S.chartFoot}>
          {ok ? <span style={{color:"#3a9e6e"}}>✓ Funded through age {state.lifeExp}.</span> : <span style={{color:"#c95858"}}>✗ Depletes at age {sim.depleteAge}.</span>}
          {simBad.depleteAge && simBad.depleteAge !== sim.depleteAge && <span style={{color:"#c95858", marginLeft:12}}>Bad sequence depletes at {simBad.depleteAge}.</span>}
        </div>
      </div>

      {/* Mermaid diagram */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Model flow (live)</div>
        <Mermaid chart={mermaidChart}/>
      </div>

      {/* Summary table for advisor */}
      <div style={{...S.section, background:"#1c1c1c", color:"#e8e4dd"}}>
        <div style={{...S.sectionTitle, color:"#888"}}>Plan summary for advisor</div>
        <div style={S.sumGrid}>
          <Stat label="Years to retirement" value={yearsTo+" yrs"}/>
          <Stat label="Years in retirement" value={(state.lifeExp-state.retAge)+" yrs"}/>
          <Stat label="Annual spend today" value={fmt$(annualSpendNow)}/>
          <Stat label="Annual spend at retire (nominal)" value={fmt$(annualSpendRetNom)}/>
          <Stat label="Required nest egg @ retire" value={fmt$M(reqNest)}/>
          <Stat label="Projected portfolio @ retire" value={fmt$M(fvCur)}/>
          <Stat label="Funding gap" value={fmt$M(Math.max(0, reqNest - fvCur))}/>
          <Stat label="Required monthly contribution" value={fmt$(reqContrib)}/>
          <Stat label="Nominal return assumption" value={(state.retNom/10).toFixed(1)+"% /yr"}/>
          <Stat label="Inflation assumption" value={(state.infl/10).toFixed(1)+"% /yr"}/>
          <Stat label="Real return (approx)" value={fmtPct(state.retNom/10 - state.infl/10)}/>
          <Stat label="End balance (avg returns)" value={fmt$M(sim.endBalance)}/>
          <Stat label="End balance (bad sequence)" value={fmt$M(simBad.endBalance)}/>
          <Stat label="Kids" value={`${state.kids} × ${fmt$(state.kidExtraMo)}/mo`}/>
        </div>
        <div style={S.sumNote}>
          Share this URL with the advisor: <code style={S.code}>{window.location.origin + window.location.pathname + "#plan=" + planId}</code><br/>
          Both edit, both see updates live. Last sync: {sync.last ? new Date(sync.last).toLocaleString() : "—"}.
        </div>
      </div>

      <div style={{height:48}}/>
    </div>
  );
}

/* ─────────────  Styles  ───────────── */
const S = {
  pg:{minHeight:"100vh",background:"#f6f4f0",maxWidth:1080,margin:"0 auto",padding:"0 16px 24px"},
  header:{padding:"20px 0 14px",borderBottom:"1px solid #e8e4dd",position:"sticky",top:0,background:"#f6f4f0",zIndex:10},
  hRow:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"},
  kicker:{fontSize:10,letterSpacing:"0.16em",color:"#a8a08e",fontWeight:600},
  title:{fontFamily:"'Source Serif 4',Georgia,serif",fontSize:"clamp(22px,3.6vw,30px)",fontWeight:300,marginTop:2},
  syncBox:{display:"flex",alignItems:"center",gap:8,background:"#fff",padding:"8px 12px",borderRadius:8,border:"1px solid #e8e4dd"},
  dot:{width:8,height:8,borderRadius:"50%",display:"inline-block"},
  syncL:{fontSize:10,letterSpacing:"0.1em",color:"#888",fontWeight:600},
  syncId:{fontSize:11,color:"#1c1c1c"},
  kpis:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginTop:14},
  scenarios:{marginTop:18},
  presetRow:{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginTop:8},
  preset:{flex:"0 0 240px",textAlign:"left",background:"#fff",border:"1px solid #e8e4dd",borderRadius:8,padding:"10px 12px"},
  presetActive:{borderColor:"#2a9d8f",background:"#eaf6f3"},
  presetLabel:{fontSize:13,fontWeight:600,marginBottom:3},
  presetNote:{fontSize:11,color:"#888",lineHeight:1.4},
  section:{background:"#fff",borderRadius:10,padding:"14px 16px",marginTop:14,border:"1px solid #ece7df"},
  sectionTitle:{fontSize:11,letterSpacing:"0.14em",color:"#a8a08e",fontWeight:600,textTransform:"uppercase",marginBottom:10},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14},
  field:{display:"flex",flexDirection:"column",gap:4},
  fLabel:{fontSize:11,color:"#777",fontWeight:500},
  fHint:{fontSize:10,color:"#aaa",fontStyle:"italic"},
  stepper:{display:"inline-flex",alignItems:"center",gap:4},
  sBtn:{padding:"4px 8px",background:"#f0ede8",borderRadius:4,fontSize:10,color:"#888",minWidth:28},
  sVal:{fontSize:14,fontWeight:600,background:"#fff",border:"1px solid #e0dbd3",borderRadius:4,padding:"4px 10px",minWidth:90,textAlign:"center"},
  stat:{background:"#fff",borderRadius:8,padding:"10px 12px",border:"1px solid #ece7df"},
  statL:{fontSize:9.5,letterSpacing:"0.1em",color:"#a8a08e",fontWeight:600,textTransform:"uppercase"},
  statV:{fontFamily:"'Source Serif 4',Georgia,serif",fontWeight:300,marginTop:2,letterSpacing:"-0.01em"},
  chartFoot:{fontSize:12,marginTop:6,fontWeight:500},
  sumGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:6},
  sumNote:{fontSize:11,color:"#aaa",marginTop:14,lineHeight:1.6},
  code:{background:"#2a2a2a",padding:"2px 6px",borderRadius:3,color:"#ffd28a",fontSize:10,wordBreak:"break-all"},
};
