import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#fff",
    primaryTextColor: "#1c1c1c",
    primaryBorderColor: "#888",
    lineColor: "#888",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: "13px",
  },
  flowchart: { htmlLabels: true, curve: "basis", padding: 12 },
});

let id = 0;
export default function Mermaid({ chart }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const myId = "m" + ++id;
    mermaid.render(myId, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(e => {
      if (ref.current) ref.current.innerHTML = "<pre style='color:#c95858;font-size:11px'>"+String(e)+"</pre>";
    });
  }, [chart]);
  return <div ref={ref} style={{ display: "flex", justifyContent: "center", overflow: "auto" }} />;
}
