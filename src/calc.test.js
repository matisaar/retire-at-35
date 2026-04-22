import { describe, it, expect } from "vitest";
import { derive, sumExp, sumCat, ALL_ITEMS, CATS, defaultExp, CONNECTIONS, REQUIRED_DATA_VARS } from "./calc.js";

const baseState = {
  curAge: 28, retAge: 35, curInv: 75000,
  realRet: 3.5, swrPct: 3.6,
  exp: defaultExp(), kids: 0, kidExtraMo: 0,
};

describe("sumExp / sumCat", () => {
  it("default sums per category match item totals", () => {
    const exp = defaultExp();
    let total = 0;
    for (const cat of CATS) {
      const sub = sumCat(cat, exp);
      const expected = cat.items.reduce((a,i)=>a+i.d, 0);
      expect(sub).toBe(expected);
      total += sub;
    }
    expect(sumExp(exp)).toBe(total);
  });

  it("missing keys fall back to defaults", () => {
    expect(sumExp({})).toBe(ALL_ITEMS.reduce((a,i)=>a+i.d, 0));
  });

  it("explicit zero overrides default", () => {
    const exp = { ...defaultExp(), rent: 0 };
    expect(sumExp(exp)).toBe(sumExp(defaultExp()) - 2400);
  });
});

describe("derive — time horizon", () => {
  it("Y = retAge - curAge", () => {
    const { Y } = derive({ ...baseState, curAge: 28, retAge: 35 });
    expect(Y).toBe(7);
  });

  it("n = round(Y * 12)", () => {
    const { n } = derive({ ...baseState, curAge: 28, retAge: 35 });
    expect(n).toBe(84);
  });

  it("clamps Y to a tiny positive number when curAge >= retAge", () => {
    const { Y, n } = derive({ ...baseState, curAge: 35, retAge: 35 });
    expect(Y).toBeGreaterThan(0);
    expect(n).toBe(0);
  });
});

describe("derive — rates", () => {
  it("r = realRet / 100", () => {
    expect(derive({ ...baseState, realRet: 3.5 }).r).toBeCloseTo(0.035, 10);
    expect(derive({ ...baseState, realRet: 1.0 }).r).toBeCloseTo(0.01, 10);
  });

  it("rm = (1+r)^(1/12) - 1", () => {
    const { rm, r } = derive({ ...baseState, realRet: 3.5 });
    expect(rm).toBeCloseTo(Math.pow(1+r, 1/12) - 1, 12);
  });

  it("swr = swrPct / 100", () => {
    expect(derive({ ...baseState, swrPct: 3.6 }).swr).toBeCloseTo(0.036, 10);
  });
});

describe("derive — spend, expenses, nest egg", () => {
  it("spendMo = baseMo + kids * kidExtraMo", () => {
    const { baseMo, kidsMo, spendMo } = derive({ ...baseState, kids: 2, kidExtraMo: 1500 });
    expect(kidsMo).toBe(3000);
    expect(spendMo).toBe(baseMo + 3000);
  });

  it("E = spendMo * 12", () => {
    const d = derive({ ...baseState, kids: 2, kidExtraMo: 1500 });
    expect(d.E).toBe(d.spendMo * 12);
  });

  it("N = E / swr", () => {
    const d = derive({ ...baseState, swrPct: 3.6 });
    expect(d.N).toBeCloseTo(d.E / 0.036, 6);
  });

  it("N is zero if SWR is zero (avoid div by zero)", () => {
    const d = derive({ ...baseState, swrPct: 0 });
    expect(d.N).toBe(0);
  });
});

describe("derive — future value of current investments", () => {
  it("FVcur = curInv * (1+r)^Y", () => {
    const d = derive({ ...baseState, curInv: 75000, realRet: 3.5, curAge: 28, retAge: 35 });
    expect(d.FVcur).toBeCloseTo(75000 * Math.pow(1.035, 7), 4);
  });

  it("FVcur ≈ curInv when Y is essentially zero", () => {
    const d = derive({ ...baseState, curAge: 35, retAge: 35, curInv: 1_000_000 });
    expect(d.FVcur).toBeCloseTo(1_000_000, -2); // within $100
  });
});

describe("derive — required monthly contribution", () => {
  it("M = (Need * rm) / ((1+rm)^n - 1) when there's a gap", () => {
    const d = derive({ ...baseState, curInv: 0 });
    const expectedM = (d.Need * d.rm) / (Math.pow(1+d.rm, d.n) - 1);
    expect(d.M).toBeCloseTo(expectedM, 4);
  });

  it("M is zero when already on track (FVcur >= N)", () => {
    const d = derive({ ...baseState, curInv: 100_000_000 });
    expect(d.onTrack).toBe(true);
    expect(d.Need).toBe(0);
    expect(d.M).toBe(0);
  });

  it("Total contributed = M * n", () => {
    const d = derive({ ...baseState, curInv: 0 });
    expect(d.Total).toBeCloseTo(d.M * d.n, 4);
  });

  it("never produces NaN or negative spending power even when r=0", () => {
    const d = derive({ ...baseState, realRet: 0, curInv: 0 });
    expect(Number.isFinite(d.M)).toBe(true);
    expect(d.M).toBeGreaterThanOrEqual(0);
  });
});

describe("CONNECTIONS map integrity", () => {
  it("every connection has both a from and a to", () => {
    for (const c of CONNECTIONS) {
      expect(c.from).toBeTruthy();
      expect(c.to).toBeTruthy();
      expect(c.from).not.toBe(c.to);
    }
  });

  it("REQUIRED_DATA_VARS contains every from/to with no duplicates", () => {
    const all = CONNECTIONS.flatMap(c => [c.from, c.to]);
    expect(new Set(REQUIRED_DATA_VARS).size).toBe(REQUIRED_DATA_VARS.length);
    for (const id of all) expect(REQUIRED_DATA_VARS).toContain(id);
  });

  it("every equation pill (eq*-*) has at least one connection touching it", () => {
    const equationPrefixes = ["eq1-", "eq2-", "eq3-", "eq4-", "eq5-", "eq6-"];
    const referenced = new Set(REQUIRED_DATA_VARS);
    // Spot-check: every equation should contribute at least one referenced var
    for (const p of equationPrefixes) {
      const hits = [...referenced].filter(v => v.startsWith(p));
      expect(hits.length, `equation ${p} has no arrows`).toBeGreaterThan(0);
    }
  });
});
