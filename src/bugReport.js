import html2canvas from "html2canvas";
import { supabase, isSupabase } from "./supabase.js";

export async function captureScreenshot(){
  const canvas = await html2canvas(document.body, {
    backgroundColor: "#f6f4f0",
    scale: window.devicePixelRatio > 1 ? 1.5 : 1,
    useCORS: true,
    logging: false,
    ignoreElements: el => el.dataset?.bugIgnore === "1",
  });
  return canvas;
}

export function compositeMarkup(baseCanvas, overlayCanvas){
  const out = document.createElement("canvas");
  out.width = baseCanvas.width;
  out.height = baseCanvas.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(baseCanvas, 0, 0);
  // overlay is in CSS pixels of viewport; scale to base canvas
  ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
  return out;
}

function canvasToBlob(canvas){
  return new Promise(res => canvas.toBlob(b => res(b), "image/png", 0.92));
}

export async function submitBugReport({ description, reporter, canvas, planId, planState }){
  if (!isSupabase) throw new Error("Supabase not configured");
  const blob = await canvasToBlob(canvas);
  const filename = `${planId || "anon"}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`;
  const up = await supabase.storage.from("bug-reports").upload(filename, blob, {
    contentType: "image/png",
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data: pub } = supabase.storage.from("bug-reports").getPublicUrl(filename);
  const screenshot_url = pub.publicUrl;

  const row = {
    plan_id: planId || null,
    reporter: reporter || "advisor",
    description: description || "",
    screenshot_url,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    plan_state: planState || null,
    status: "open",
  };
  const ins = await supabase.from("bug_reports").insert(row).select("id").maybeSingle();
  if (ins.error) throw ins.error;
  return { id: ins.data?.id, screenshot_url };
}
