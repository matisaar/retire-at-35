import { useState, useRef, useEffect } from "react";
import { captureScreenshot, compositeMarkup, submitBugReport } from "./bugReport.js";
import { isSupabase } from "./supabase.js";

const COLORS = ["#e63946", "#ffb703", "#2a9d8f", "#1d3557", "#ffffff"];

export default function BugReportButton({ planId, planState }){
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | capturing | editing | sending | done | error
  const [err, setErr] = useState(null);
  const [reporter, setReporter] = useState("advisor");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(4);
  const baseCanvasRef = useRef(null);     // full-res screenshot
  const previewRef = useRef(null);        // <img> preview (display)
  const overlayRef = useRef(null);        // drawing overlay <canvas>
  const drawing = useRef(false);
  const lastPt = useRef(null);
  const strokes = useRef([]);             // for undo

  const startCapture = async () => {
    setErr(null); setStage("capturing"); setOpen(true);
    try {
      // hide button before capture
      await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
      const canvas = await captureScreenshot();
      baseCanvasRef.current = canvas;
      setStage("editing");
    } catch(e){
      setErr(String(e.message||e)); setStage("error");
    }
  };

  // when stage becomes editing, sync preview + overlay sizes
  useEffect(()=>{
    if (stage !== "editing") return;
    const img = previewRef.current, base = baseCanvasRef.current;
    if (!img || !base) return;
    img.src = base.toDataURL("image/png");
    img.onload = () => {
      const ov = overlayRef.current;
      if (!ov) return;
      const r = img.getBoundingClientRect();
      ov.width = r.width; ov.height = r.height;
      ov.style.width = r.width+"px"; ov.style.height = r.height+"px";
      const ctx = ov.getContext("2d");
      ctx.clearRect(0,0,ov.width,ov.height);
      strokes.current = [];
    };
  }, [stage]);

  const ptOf = (e) => {
    const ov = overlayRef.current;
    const r = ov.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0] || e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  const onDown = (e) => {
    e.preventDefault();
    drawing.current = true;
    const p = ptOf(e); lastPt.current = p;
    strokes.current.push({ color, stroke, pts:[p] });
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = ptOf(e);
    const ctx = overlayRef.current.getContext("2d");
    ctx.strokeStyle = color; ctx.lineWidth = stroke;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt.current = p;
    strokes.current[strokes.current.length-1].pts.push(p);
  };
  const onUp = () => { drawing.current = false; lastPt.current = null; };

  const undo = () => {
    if (!strokes.current.length) return;
    strokes.current.pop();
    const ov = overlayRef.current, ctx = ov.getContext("2d");
    ctx.clearRect(0,0,ov.width,ov.height);
    ctx.lineCap="round"; ctx.lineJoin="round";
    for (const s of strokes.current){
      ctx.strokeStyle = s.color; ctx.lineWidth = s.stroke;
      ctx.beginPath();
      s.pts.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.stroke();
    }
  };

  const clearAll = () => {
    strokes.current = [];
    const ov = overlayRef.current; if (!ov) return;
    ov.getContext("2d").clearRect(0,0,ov.width,ov.height);
  };

  const submit = async () => {
    if (!desc.trim()){ setErr("Add a short description first."); return; }
    setErr(null); setStage("sending");
    try {
      const composite = compositeMarkup(baseCanvasRef.current, overlayRef.current);
      await submitBugReport({
        description: desc.trim(),
        reporter: reporter.trim() || "advisor",
        canvas: composite,
        planId, planState,
      });
      setStage("done");
      setTimeout(()=>{ close(); }, 1400);
    } catch(e){
      setErr(String(e.message||e)); setStage("error");
    }
  };

  const close = () => {
    setOpen(false); setStage("idle"); setErr(null); setDesc("");
    baseCanvasRef.current = null;
  };

  return (
    <>
      <button
        data-bug-ignore="1"
        onClick={startCapture}
        title="Report a bug / leave feedback"
        style={fab}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2l1.5 2h5L16 2"/>
          <rect x="6" y="6" width="12" height="14" rx="6"/>
          <path d="M12 10v8M3 12h3M18 12h3M4 6l3 2M20 6l-3 2M4 18l3-2M20 18l-3-2"/>
        </svg>
        <span style={{marginLeft:6,fontWeight:600,letterSpacing:.3}}>Feedback</span>
      </button>

      {open && (
        <div data-bug-ignore="1" style={modal} onClick={(e)=>{ if (e.target===e.currentTarget && stage!=="sending") close(); }}>
          <div style={sheet}>
            <div style={head}>
              <div style={{fontFamily:"'Source Serif 4',serif",fontSize:18,fontWeight:600}}>
                {stage==="capturing" && "Capturing screenshot…"}
                {stage==="editing" && "Mark up the screenshot"}
                {stage==="sending" && "Sending…"}
                {stage==="done" && "Sent. Thanks!"}
                {stage==="error" && "Something went wrong"}
              </div>
              {stage!=="sending" && (
                <button onClick={close} style={xBtn} aria-label="Close">×</button>
              )}
            </div>

            {stage==="editing" && (
              <>
                <div style={toolbar}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {COLORS.map(c => (
                      <button key={c} onClick={()=>setColor(c)} style={{
                        ...swatch, background:c,
                        outline: color===c ? "2px solid #1c1c1c" : "1px solid #d6d0c4",
                        outlineOffset: color===c ? 2 : 0,
                      }}/>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {[2,4,8,14].map(w => (
                      <button key={w} onClick={()=>setStroke(w)} style={{
                        ...sizeBtn,
                        background: stroke===w ? "#1c1c1c" : "#fff",
                        color: stroke===w ? "#fff" : "#1c1c1c",
                      }}>
                        <span style={{display:"inline-block",width:w,height:w,borderRadius:"50%",background:"currentColor"}}/>
                      </button>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                    <button onClick={undo} style={mini}>Undo</button>
                    <button onClick={clearAll} style={mini}>Clear</button>
                  </div>
                </div>
                <div style={canvasWrap}>
                  <img ref={previewRef} alt="" style={imgStyle} draggable={false}/>
                  <canvas
                    ref={overlayRef}
                    style={overlayStyle}
                    onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                    onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                  />
                </div>
                <div style={formRow}>
                  <input
                    placeholder="Your name (optional)"
                    value={reporter}
                    onChange={e=>setReporter(e.target.value)}
                    style={{...input, maxWidth:200}}
                  />
                </div>
                <textarea
                  placeholder="What's wrong / what did you mean? Be specific."
                  value={desc}
                  onChange={e=>setDesc(e.target.value)}
                  style={textarea}
                  rows={3}
                />
                {err && <div style={errBox}>{err}</div>}
                <div style={btnRow}>
                  <button onClick={close} style={ghostBtn}>Cancel</button>
                  <button onClick={submit} style={primaryBtn} disabled={!isSupabase}>
                    {isSupabase ? "Send to Mati" : "Supabase not configured"}
                  </button>
                </div>
              </>
            )}

            {stage==="capturing" && <div style={{padding:32,textAlign:"center",color:"#888"}}>One sec…</div>}
            {stage==="sending"   && <div style={{padding:32,textAlign:"center",color:"#888"}}>Uploading screenshot and saving…</div>}
            {stage==="done"      && <div style={{padding:32,textAlign:"center",color:"#3a9e6e",fontSize:15}}>✓ Bug report saved.</div>}
            {stage==="error"     && (
              <div style={{padding:24}}>
                <div style={errBox}>{err}</div>
                <div style={{...btnRow, marginTop:12}}>
                  <button onClick={close} style={ghostBtn}>Close</button>
                  <button onClick={startCapture} style={primaryBtn}>Retry</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── styles ── */
const fab = {
  position:"fixed", right:16, bottom:16, zIndex:9999,
  background:"#1c1c1c", color:"#fff",
  padding:"10px 14px", borderRadius:999,
  display:"flex", alignItems:"center",
  fontFamily:"'DM Sans',system-ui,sans-serif", fontSize:13,
  boxShadow:"0 4px 14px rgba(0,0,0,0.18)",
  border:"none", cursor:"pointer",
};
const modal = {
  position:"fixed", inset:0, background:"rgba(20,18,14,0.55)",
  zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center",
  padding:16, fontFamily:"'DM Sans',system-ui,sans-serif",
};
const sheet = {
  background:"#f6f4f0", borderRadius:12, width:"100%", maxWidth:880,
  maxHeight:"94vh", overflow:"auto",
  boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
  padding:16,
};
const head = { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 };
const xBtn = { fontSize:24, lineHeight:1, color:"#888", padding:"0 6px", background:"none", border:"none", cursor:"pointer" };
const toolbar = {
  display:"flex", gap:12, flexWrap:"wrap", alignItems:"center",
  background:"#fff", border:"1px solid #e8e4dd", borderRadius:8,
  padding:"8px 10px", marginBottom:8,
};
const swatch = { width:22, height:22, borderRadius:"50%", border:"none", cursor:"pointer" };
const sizeBtn = {
  border:"1px solid #d6d0c4", borderRadius:6, width:34, height:28,
  display:"inline-flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
};
const mini = { border:"1px solid #d6d0c4", background:"#fff", borderRadius:6, padding:"4px 10px", fontSize:12, cursor:"pointer" };
const canvasWrap = { position:"relative", width:"100%", border:"1px solid #e8e4dd", borderRadius:8, overflow:"hidden", background:"#fff", lineHeight:0 };
const imgStyle = { display:"block", width:"100%", height:"auto", userSelect:"none" };
const overlayStyle = { position:"absolute", inset:0, touchAction:"none", cursor:"crosshair" };
const formRow = { display:"flex", gap:8, marginTop:10 };
const input = {
  width:"100%", padding:"8px 10px", border:"1px solid #d6d0c4", borderRadius:6,
  fontFamily:"inherit", fontSize:13, background:"#fff",
};
const textarea = { ...input, marginTop:8, resize:"vertical", minHeight:64 };
const btnRow = { display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 };
const ghostBtn = { padding:"9px 16px", border:"1px solid #d6d0c4", background:"#fff", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:13 };
const primaryBtn = { padding:"9px 18px", border:"none", background:"#1c1c1c", color:"#fff", borderRadius:6, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 };
const errBox = { background:"#fff3f1", color:"#a3322a", border:"1px solid #f0c8c2", borderRadius:6, padding:"8px 10px", fontSize:12, marginTop:8 };
