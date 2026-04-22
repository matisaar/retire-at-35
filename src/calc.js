/* Pure math + plan derivation. No React, no DOM. Imported by App.jsx and tests. */

export const CATS = [
  {key:"Housing",color:"#2a9d8f",items:[
    {k:"rent",l:"rent / mortgage",s:100,d:2400},{k:"prop",l:"property tax",s:25,d:0},
    {k:"hIns",l:"home insurance",s:10,d:50},{k:"hydr",l:"hydro",s:25,d:90},
    {k:"gas_",l:"gas / heat",s:10,d:50},{k:"watr",l:"water",s:10,d:0},
    {k:"inet",l:"internet",s:10,d:80},{k:"maint",l:"home maintenance",s:25,d:100}]},
  {key:"Food",color:"#457bb5",items:[
    {k:"groc",l:"groceries",s:50,d:900},{k:"dine",l:"dining out",s:25,d:300},
    {k:"deli",l:"takeout",s:25,d:120},{k:"coff",l:"coffee",s:10,d:80},
    {k:"alc_",l:"alcohol / wine",s:10,d:100}]},
  {key:"Transport",color:"#8b5fb0",items:[
    {k:"carP",l:"car payment",s:50,d:0},{k:"chrg",l:"fuel / charging",s:10,d:120},
    {k:"cIns",l:"auto insurance",s:25,d:200},{k:"mnt_",l:"car maintenance",s:25,d:100},
    {k:"reg_",l:"plates / reg",s:5,d:15},{k:"park",l:"parking",s:25,d:50}]},
  {key:"Healthcare",color:"#c95858",items:[
    {k:"hcIns",l:"private insurance",s:25,d:300},{k:"dent",l:"dental",s:10,d:80},
    {k:"vis_",l:"vision",s:10,d:30},{k:"rx__",l:"prescriptions",s:10,d:50},
    {k:"supp",l:"supplements",s:10,d:60},{k:"ther",l:"therapy / wellness",s:25,d:100}]},
  {key:"Personal",color:"#3a9e6e",items:[
    {k:"hair",l:"haircuts",s:10,d:80},{k:"skin",l:"skincare",s:10,d:50},
    {k:"gym_",l:"gym / fitness",s:10,d:120}]},
  {key:"Clothing",color:"#6a8ab5",items:[
    {k:"clth",l:"clothes",s:25,d:150},{k:"shoe",l:"shoes",s:25,d:50}]},
  {key:"Travel",color:"#d4845a",items:[
    {k:"trip",l:"big trips",s:100,d:800},{k:"week",l:"weekends away",s:25,d:200},
    {k:"flgt",l:"flights",s:50,d:300},{k:"vIns",l:"travel insurance",s:10,d:30}]},
  {key:"Entertain",color:"#9a7ab0",items:[
    {k:"entr",l:"events / shows",s:25,d:150},{k:"hobb",l:"hobbies",s:25,d:200},
    {k:"dOut",l:"dates / social",s:25,d:150}]},
  {key:"Pet",color:"#b07a8a",items:[
    {k:"pFoo",l:"pet food",s:10,d:80},{k:"vet_",l:"vet",s:25,d:75},
    {k:"grmg",l:"grooming",s:10,d:60},{k:"pIns",l:"pet insurance",s:10,d:50}]},
  {key:"Bills & Subs",color:"#5b9ec9",items:[
    {k:"phon",l:"phone",s:10,d:100},{k:"strm",l:"streaming",s:5,d:60},
    {k:"apps",l:"apps / subs",s:5,d:40},{k:"clud",l:"cloud / software",s:5,d:30}]},
  {key:"Insurance",color:"#8a7a5a",items:[
    {k:"lIns",l:"life insurance",s:10,d:50},{k:"uIns",l:"umbrella insurance",s:10,d:30}]},
  {key:"Gifts & Giving",color:"#7a6a8a",items:[
    {k:"bday",l:"birthdays",s:10,d:60},{k:"holi",l:"holidays",s:25,d:120},
    {k:"char",l:"donations",s:25,d:50}]},
  {key:"Buffer",color:"#7a8a7a",items:[
    {k:"misc",l:"misc / unplanned",s:50,d:400}]},
];
export const ALL_ITEMS = CATS.flatMap(c => c.items);
export const defaultExp = () => { const o={}; ALL_ITEMS.forEach(i=>o[i.k]=i.d); return o; };
export const sumExp = (exp) => ALL_ITEMS.reduce((a,it)=>a + (Number(exp?.[it.k] ?? it.d) || 0), 0);
export const sumCat = (cat, exp) => cat.items.reduce((a,it)=>a + (Number(exp?.[it.k] ?? it.d) || 0), 0);

/**
 * Closed-form retirement plan derivation in real (today's) dollars.
 * @param {{curAge,retAge,curInv,realRet,swrPct,exp,kids,kidExtraMo}} s
 * @returns {{Y,n,r,swr,rm,baseMo,kidsMo,spendMo,E,N,FVcur,Need,M,Total,onTrack}}
 */
export function derive(s){
  const Y = Math.max(0.0001, s.retAge - s.curAge);
  const n = Math.round(Y * 12);
  const r = s.realRet / 100;
  const swr = s.swrPct / 100;
  const rm = Math.pow(1 + r, 1/12) - 1;
  const baseMo = sumExp(s.exp);
  const kidsMo = (s.kids || 0) * (s.kidExtraMo || 0);
  const spendMo = baseMo + kidsMo;
  const E = spendMo * 12;
  const N = swr > 0 ? E / swr : 0;
  const FVcur = (s.curInv || 0) * Math.pow(1 + r, Y);
  const Need = Math.max(0, N - FVcur);
  const M = (rm > 0 && n > 0)
    ? (Need * rm) / (Math.pow(1 + rm, n) - 1)
    : (n > 0 ? Need / n : 0);
  const Total = M * n;
  const onTrack = FVcur >= N && N > 0;
  return { Y, n, r, swr, rm, baseMo, kidsMo, spendMo, E, N, FVcur, Need, M, Total, onTrack };
}

/**
 * Connection map: every equation variable that has a source must be wired here.
 * Each entry: { from: data-var ID rendered ABOVE, to: data-var ID rendered BELOW }.
 * Layout order top→bottom: hero, scenarios, breakdown, eq1, eq2, eq3, eq4, eq5(+inputs), eq6.
 * Tested in App.connections.test.jsx — every from/to MUST exist in the DOM.
 */
export const catSlug = (key) => key.replace(/[^a-zA-Z0-9]/g, "");

export const CONNECTIONS = [
  // hero shows N → eq2 defines N
  { from:"hero-N",          to:"eq2-N",   color:"#2a9d8f" },

  // breakdown total tile feeds Monthly Spend
  { from:"breakdown-base",  to:"def-Mo",  color:"#c47a3a" },
  { from:"breakdown-kids",  to:"def-Mo",  color:"#b07a8a" },

  // eq4 sums each category → each category equation card below
  ...CATS.map(c => ({ from:`eq4-cat-${catSlug(c.key)}`, to:`cat-${catSlug(c.key)}`, color:c.color })),

  // eq1 references → their definitions further down
  { from:"eq1-N",           to:"eq2-N",   color:"#2a9d8f" },
  { from:"eq1-FV",          to:"eq3-FV",  color:"#6a8ab5" },
  { from:"eq1-rm",          to:"eq6-rm",  color:"#b8892a" },
  { from:"eq1-rm-b",        to:"eq6-rm",  color:"#b8892a" },
  { from:"eq1-n",           to:"eq5-n",   color:"#8b5fb0" },

  // eq2 references
  { from:"eq2-E",           to:"eq4-E",   color:"#c47a3a" },
  { from:"eq2-SWR",         to:"def-SWR", color:"#7a6a8a" },

  // eq3 references
  { from:"eq3-Inv",         to:"def-Inv", color:"#457bb5" },
  { from:"eq3-r",           to:"def-r",   color:"#b8892a" },
  { from:"eq3-Y",           to:"eq5-Y",   color:"#7a8e5a" },

  // eq5 references (Y appears twice in 'n = Y × 12'; second Y points to first Y above it)
  { from:"eq5-RA",          to:"def-RA",  color:"#3a9e6e" },
  { from:"eq5-CA",          to:"def-CA",  color:"#c95858" },

  // eq6 (lives at the very bottom) gets its r from the inputs row above it
  { from:"def-r",           to:"eq6-r",   color:"#b8892a" },
];

/** Every data-var ID that MUST exist in the rendered DOM. */
export const REQUIRED_DATA_VARS = Array.from(new Set(
  CONNECTIONS.flatMap(c => [c.from, c.to])
));
