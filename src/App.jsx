import { useState, useRef, useEffect } from "react";

/* ── Shared colors ── */
const C_NEST="#2a9d8f", C_FV="#6a8ab5", C_RATE="#b8892a", C_MONTHS="#8b5fb0", C_YEARS="#7a8e5a";
const C_EXP="#c47a3a", C_SWR="#7a6a8a", C_INV="#457bb5", C_AGE="#c95858", C_RETAGE="#3a9e6e";

/* ── Retirement budget categories (today's $, monthly) ── */
const CATS=[
  {key:"Housing",color:"#2a9d8f",items:[
    {k:"rent",l:"rent/mortgage",s:100,d:2400},{k:"prop",l:"property tax",s:25,d:0},
    {k:"hIns",l:"home ins",s:10,d:50},{k:"hydr",l:"hydro",s:25,d:90},
    {k:"gas_",l:"gas/heat",s:10,d:50},{k:"watr",l:"water",s:10,d:0},
    {k:"inet",l:"internet",s:10,d:80},{k:"maint",l:"home maint",s:25,d:100}]},
  {key:"Food",color:"#457bb5",items:[
    {k:"groc",l:"groceries",s:50,d:700},{k:"dine",l:"dining out",s:25,d:250},
    {k:"deli",l:"takeout",s:25,d:100},{k:"coff",l:"coffee",s:10,d:60},
    {k:"alc_",l:"alcohol/wine",s:10,d:80}]},
  {key:"Transport",color:"#8b5fb0",items:[
    {k:"carP",l:"car pmt",s:50,d:0},{k:"chrg",l:"fuel/charging",s:10,d:80},
    {k:"cIns",l:"auto ins",s:25,d:200},{k:"mnt_",l:"maint",s:25,d:80},
    {k:"reg_",l:"plates/reg",s:5,d:15},{k:"park",l:"parking",s:25,d:50}]},
  {key:"Healthcare",color:"#c95858",items:[
    {k:"hIns",l:"private ins",s:25,d:300},{k:"dent",l:"dental",s:10,d:80},
    {k:"vis_",l:"vision",s:10,d:30},{k:"rx__",l:"prescriptions",s:10,d:50},
    {k:"supp",l:"supplements",s:10,d:60},{k:"ther",l:"therapy/wellness",s:25,d:100}]},
  {key:"Personal",color:"#3a9e6e",items:[
    {k:"hair",l:"haircuts",s:10,d:80},{k:"skin",l:"skincare",s:10,d:50},
    {k:"gym_",l:"gym/fitness",s:10,d:100}]},
  {key:"Clothing",color:"#6a8ab5",items:[
    {k:"clth",l:"clothes",s:25,d:80},{k:"shoe",l:"shoes",s:25,d:30}]},
  {key:"Travel",color:"#d4845a",items:[
    {k:"trip",l:"big trips",s:100,d:600},{k:"week",l:"weekends",s:25,d:200},
    {k:"flgt",l:"flights",s:50,d:200},{k:"vIns",l:"travel ins",s:10,d:30}]},
  {key:"Entertain",color:"#9a7ab0",items:[
    {k:"entr",l:"events/shows",s:25,d:120},{k:"hobb",l:"hobbies",s:25,d:150},
    {k:"dOut",l:"dates/social",s:25,d:100}]},
  {key:"Pet",color:"#b07a8a",items:[
    {k:"pFoo",l:"food/treats",s:10,d:75},{k:"vet_",l:"vet",s:25,d:75},
    {k:"grmg",l:"grooming",s:10,d:60},{k:"pIns",l:"pet ins",s:10,d:50}]},
  {key:"Bills",color:"#5b9ec9",items:[
    {k:"phon",l:"phone",s:10,d:80},{k:"strm",l:"streaming",s:5,d:50},
    {k:"apps",l:"apps/subs",s:5,d:30},{k:"clud",l:"cloud/software",s:5,d:20}]},
  {key:"Insurance",color:"#8a7a5a",items:[
    {k:"lIns",l:"life ins",s:10,d:50},{k:"uIns",l:"umbrella ins",s:10,d:30}]},
  {key:"Gifts",color:"#7a6a8a",items:[
    {k:"bday",l:"birthdays",s:10,d:50},{k:"holi",l:"holidays",s:25,d:100},
    {k:"char",l:"donations",s:25,d:50}]},
  {key:"Buffer",color:"#7a8a7a",items:[
    {k:"misc",l:"misc/unplanned",s:50,d:300}]},
];

/* ── Helpers ── */
function mkInit(){const o={};CATS.forEach(c=>c.items.forEach(i=>{o[i.k]=i.d}));return o}
const fmt=v=>"$"+Math.round(v).toLocaleString();
const fmt0=v=>Math.round(v).toLocaleString();

/* ── Atoms ── */
function Pill({name,id,color}){
  return <span data-var={id} style={{...st.pill,borderColor:color,color}}>{name}</span>;
}
function Num({value,onChange,step=50,min=0,max=99999999,pre="$",suf=""}){
  return(<span style={st.stepper}>
    <button style={st.sBtn} onClick={()=>onChange(Math.min(max,value+step))}>
      <svg width="10" height="4" viewBox="0 0 10 4"><path d="M1.5 3.5L5 .5L8.5 3.5" stroke="#b5ad9e" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
    </button>
    <span style={st.sVal}>{pre}{value.toLocaleString()}{suf}</span>
    <button style={st.sBtn} onClick={()=>onChange(Math.max(min,value-step))}>
      <svg width="10" height="4" viewBox="0 0 10 4"><path d="M1.5.5L5 3.5L8.5.5" stroke="#b5ad9e" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
    </button>
  </span>);
}
const Op=({c})=><span style={st.op}>{c}</span>;

export default function App(){
  /* ── Plan inputs ── */
  const[curAge,setCurAge]=useState(28);
  const[retAge,setRetAge]=useState(35);
  const[curInv,setCurInv]=useState(75000);
  const[realRet,setRealRet]=useState(50);   // % * 10  (i.e. 5.0%)
  const[swrPct,setSwrPct]=useState(40);     // % * 10  (i.e. 4.0%)
  const[s,setS]=useState(()=>mkInit());
  const up=(k,v)=>setS(p=>({...p,[k]:v}));

  /* ── Derived math (all in today's $ using REAL return) ── */
  const Y=Math.max(0.0001,retAge-curAge);            // years till retirement
  const n=Math.round(Y*12);                          // months
  const r=realRet/1000;                              // annual real return decimal
  const swr=swrPct/1000;                             // safe withdrawal rate decimal
  const rm=Math.pow(1+r,1/12)-1;                     // monthly real rate

  const tots={};
  CATS.forEach(c=>{tots[c.key]=c.items.reduce((a,i)=>a+(s[i.k]||0),0)*12});
  const E=Object.values(tots).reduce((a,b)=>a+b,0); // annual retirement expenses (today's $)
  const N=swr>0?E/swr:0;                             // nest egg target (today's $)
  const FVcur=curInv*Math.pow(1+r,Y);                // future value of current investments (today's $)
  const Need=Math.max(0,N-FVcur);                    // gap to fund via contributions
  const M=(rm>0&&n>0)?(Need*rm)/(Math.pow(1+rm,n)-1):(n>0?Need/n:0); // monthly contribution
  const Total=M*n;                                   // total nominal-ish contributed (today's $ since real)
  const onTrack=FVcur>=N&&N>0;

  /* ── Connections (from-pill → to-pill) ── */
  const conns=[
    {from:"hero-M",to:"eq1-M",color:C_RATE},
    {from:"eq1-N",to:"eq2-N",color:C_NEST},
    {from:"eq1-FV",to:"eq3-FV",color:C_FV},
    {from:"eq1-rm",to:"eq6-rm",color:C_RATE},
    {from:"eq1-n",to:"eq5-n",color:C_MONTHS},
    {from:"eq2-E",to:"eq4-E",color:C_EXP},
    {from:"eq2-SWR",to:"def-SWR",color:C_SWR},
    {from:"eq3-Inv",to:"def-Inv",color:C_INV},
    {from:"eq3-r",to:"def-r",color:C_RATE},
    {from:"eq3-Y",to:"eq5-Y",color:C_YEARS},
    {from:"eq6-r",to:"def-r",color:C_RATE},
    {from:"eq5-RA",to:"def-RA",color:C_RETAGE},
    {from:"eq5-CA",to:"def-CA",color:C_AGE},
    ...CATS.map(c=>({from:"eq4-"+c.key,to:"d-"+c.key,color:c.color})),
  ];

  const cRef=useRef(null),svgRef=useRef(null);
  useEffect(()=>{
    const draw=()=>{
      const cont=cRef.current,svg=svgRef.current;
      if(!cont||!svg)return;
      svg.setAttribute("width",cont.scrollWidth);svg.setAttribute("height",cont.scrollHeight);
      while(svg.firstChild)svg.removeChild(svg.firstChild);
      const cr=cont.getBoundingClientRect();
      const pos=id=>{const el=cont.querySelector('[data-var="'+id+'"]');if(!el)return null;const r=el.getBoundingClientRect();return{cx:r.left-cr.left+r.width/2,top:r.top-cr.top,bot:r.bottom-cr.top}};
      conns.forEach(conn=>{
        const s=pos(conn.from),t=pos(conn.to);if(!s||!t)return;
        const x1=s.cx,y1=s.bot+1,x2=t.cx,y2=t.top-1,dy=y2-y1;if(dy<6)return;
        const cp=Math.min(Math.max(18,dy*0.4),120);
        const path=document.createElementNS("http://www.w3.org/2000/svg","path");
        path.setAttribute("d","M"+x1+","+y1+" C"+x1+","+(y1+cp)+" "+x2+","+(y2-cp)+" "+x2+","+y2);
        path.setAttribute("stroke",conn.color);path.setAttribute("stroke-width","1.5");
        path.setAttribute("fill","none");path.setAttribute("opacity","0.38");svg.appendChild(path);
        const a=4.5;const tri=document.createElementNS("http://www.w3.org/2000/svg","polygon");
        tri.setAttribute("points",x2+","+y2+" "+(x2-a)+","+(y2-a*1.7)+" "+(x2+a)+","+(y2-a*1.7));
        tri.setAttribute("fill",conn.color);tri.setAttribute("opacity","0.45");svg.appendChild(tri);
      });
    };
    const raf=()=>requestAnimationFrame(draw);
    const timer=setTimeout(raf,120);
    window.addEventListener("resize",raf);
    return()=>{clearTimeout(timer);window.removeEventListener("resize",raf)};
  });

  return(
    <div style={st.pg}>
      <style>{"\
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@400;500;600&display=swap');\
        *{box-sizing:border-box;margin:0;padding:0}body{background:#f6f4f0}\
        button{background:none;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}\
        .cat-grid{display:flex;flex-direction:column;gap:10px;max-width:700px;margin:0 auto}\
      "}</style>

      <div style={st.hero}>
        <div style={st.hL}>REQUIRED MONTHLY CONTRIBUTION</div>
        <div data-var="hero-M" style={st.hN}>{onTrack?"$0":fmt(M)}</div>
        <div style={st.hS}>
          {onTrack
            ? <>You're already on track. Projected nest egg: <b>{fmt(FVcur)}</b> at age {retAge}.</>
            : <>Invest <b>{fmt(M)}/mo</b> for <b>{Y.toFixed(1)} yrs</b> ({n} mo) &nbsp;·&nbsp; Total contributed: <b>{fmt(Total)}</b></>}
        </div>
        <div style={st.hMeta}>
          Target nest egg: <b>{fmt(N)}</b> &nbsp;·&nbsp; Today's investments grow to <b>{fmt(FVcur)}</b> &nbsp;·&nbsp; Gap: <b>{fmt(Need)}</b>
        </div>
        <div style={st.note}>All values in today's dollars using a real (inflation-adjusted) return rate.</div>
      </div>

      <div ref={cRef} style={st.board}>
        <svg ref={svgRef} style={st.svg}/>

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
          <div style={st.rr}>= {fmt(M)}/mo &nbsp;·&nbsp; total {fmt(Total)} over {n} mo</div>
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
          <div style={st.rr}>= {fmt(N)} &nbsp;·&nbsp; ≈ {(swrPct/10).toFixed(1)}% withdrawal × {fmt(N)} = {fmt(N*swr)}/yr</div>
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
          <div style={st.rr}>= {fmt(curInv)} × (1+{(realRet/10).toFixed(1)}%)^{Y.toFixed(1)} = {fmt(FVcur)}</div>
        </div></div>

        {/* Equation 4: Annual Expenses */}
        <div style={st.rc}><div style={st.eq}>
          <div style={st.tag}>Annual Retirement Expenses (today's $)</div>
          <div style={{...st.ml,fontSize:14}}>
            <Pill name="Annual Expenses" id="eq4-E" color={C_EXP}/> <Op c="="/>{" "}
            {CATS.map((c,i)=><span key={c.key} style={{display:"inline-flex",alignItems:"center",gap:2}}>
              {i>0&&<Op c="+"/>}<Pill name={c.key} id={"eq4-"+c.key} color={c.color}/>
            </span>)}
          </div>
          <div style={st.rr}>= {fmt(E)}/yr &nbsp;·&nbsp; {fmt(E/12)}/mo</div>
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
          <div style={{...st.subEq,marginTop:10,gap:"8px 14px",flexWrap:"wrap"}}>
            <span style={st.inlineItem}>
              <span style={st.gL2}>current age</span>
              <Num value={curAge} onChange={setCurAge} step={1} min={1} max={retAge-1} pre="" suf=" yr"/>
            </span>
            <span data-var="def-CA" style={{...st.inlineItem,...st.defBox,borderColor:C_AGE}}>
              <span style={{...st.gL2,color:C_AGE}}>Current Age</span>
              <span style={st.defVal}>{curAge} yr</span>
            </span>
            <span style={st.inlineItem}>
              <span style={st.gL2}>retire age</span>
              <Num value={retAge} onChange={setRetAge} step={1} min={curAge+1} max={80} pre="" suf=" yr"/>
            </span>
            <span data-var="def-RA" style={{...st.inlineItem,...st.defBox,borderColor:C_RETAGE}}>
              <span style={{...st.gL2,color:C_RETAGE}}>Retire Age</span>
              <span style={st.defVal}>{retAge} yr</span>
            </span>
            <span style={st.inlineItem}>
              <span style={st.gL2}>investments today</span>
              <Num value={curInv} onChange={setCurInv} step={1000} pre="$"/>
            </span>
            <span data-var="def-Inv" style={{...st.inlineItem,...st.defBox,borderColor:C_INV}}>
              <span style={{...st.gL2,color:C_INV}}>Investments</span>
              <span style={st.defVal}>{fmt(curInv)}</span>
            </span>
            <span style={st.inlineItem}>
              <span style={st.gL2}>real return /yr</span>
              <Num value={realRet} onChange={setRealRet} step={5} min={0} max={200} pre="" suf="‰"/>
            </span>
            <span data-var="def-r" style={{...st.inlineItem,...st.defBox,borderColor:C_RATE}}>
              <span style={{...st.gL2,color:C_RATE}}>r (real)</span>
              <span style={st.defVal}>{(realRet/10).toFixed(1)}% /yr</span>
            </span>
            <span style={st.inlineItem}>
              <span style={st.gL2}>safe withdrawal</span>
              <Num value={swrPct} onChange={setSwrPct} step={1} min={10} max={100} pre="" suf="‰"/>
            </span>
            <span data-var="def-SWR" style={{...st.inlineItem,...st.defBox,borderColor:C_SWR}}>
              <span style={{...st.gL2,color:C_SWR}}>SWR</span>
              <span style={st.defVal}>{(swrPct/10).toFixed(1)}%</span>
            </span>
          </div>
          <div style={{fontSize:10,color:"#aaa",marginTop:8,fontStyle:"italic"}}>
            Note: ‰ stepper is per-mille of return rate (e.g. 50 = 5.0%). SWR default 4% is the Trinity Study rule of thumb.
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

        {/* Categories */}
        <div className="cat-grid">
        {CATS.map(cat=>{
          const mo=cat.items.reduce((a,i)=>a+(s[i.k]||0),0);
          return(
            <div key={cat.key} style={{position:"relative"}}><div style={st.eq}>
              <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"4px 6px",lineHeight:1.6}}>
                <Pill name={cat.key} id={"d-"+cat.key} color={cat.color}/>
                <Op c="="/>
                <Op c="("/>
                {cat.items.map((item,i)=>(
                  <span key={item.k} style={{display:"inline-flex",alignItems:"center",gap:2}}>
                    {i>0&&<Op c="+"/>}
                    <span style={st.inlineItem}>
                      <span style={st.gL2}>{item.l}</span>
                      <Num value={s[item.k]||0} onChange={v=>up(item.k,v)} step={item.s} pre="$"/>
                    </span>
                  </span>
                ))}
                <Op c=")"/><Op c="×"/><span style={st.opNum}>12</span>
                <Op c="="/>
                <span style={st.eqResult}>{fmt(tots[cat.key])}/yr</span>
                <span style={{fontSize:11,color:"#bbb",marginLeft:4}}>{fmt(mo)}/mo</span>
              </div>
            </div></div>
          );
        })}
        </div>

        {/* Summary card for advisor */}
        <div style={{...st.rc,marginTop:18}}><div style={{...st.eq,background:"#1c1c1c",color:"#e8e4dd"}}>
          <div style={{...st.tag,color:"#888"}}>Plan Summary (for advisor)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:8,fontFamily:"'DM Sans',sans-serif"}}>
            <div><div style={st.sumK}>Years to retirement</div><div style={st.sumV}>{Y.toFixed(1)} yrs</div></div>
            <div><div style={st.sumK}>Annual expenses</div><div style={st.sumV}>{fmt(E)}</div></div>
            <div><div style={st.sumK}>Target nest egg</div><div style={st.sumV}>{fmt(N)}</div></div>
            <div><div style={st.sumK}>Today's investments</div><div style={st.sumV}>{fmt(curInv)}</div></div>
            <div><div style={st.sumK}>Projected at retire age</div><div style={st.sumV}>{fmt(FVcur)}</div></div>
            <div><div style={st.sumK}>Funding gap</div><div style={st.sumV}>{fmt(Need)}</div></div>
            <div><div style={st.sumK}>Monthly contribution</div><div style={{...st.sumV,color:"#ffd28a"}}>{fmt(M)}</div></div>
            <div><div style={st.sumK}>Total contributed</div><div style={st.sumV}>{fmt(Total)}</div></div>
            <div><div style={st.sumK}>Real return assumption</div><div style={st.sumV}>{(realRet/10).toFixed(1)}% /yr</div></div>
            <div><div style={st.sumK}>SWR assumption</div><div style={st.sumV}>{(swrPct/10).toFixed(1)}%</div></div>
          </div>
        </div></div>
      </div>
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
};
