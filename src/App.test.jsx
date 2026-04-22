import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import App from "./App.jsx";
import { CONNECTIONS, REQUIRED_DATA_VARS } from "./calc.js";

// Stub Supabase module so App doesn't try to talk to the network
vi.mock("./supabase.js", () => ({
  isSupabase: false,
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

// Stub the bug-report button (uses html2canvas which jsdom can't run)
vi.mock("./BugReportButton.jsx", () => ({
  default: () => null,
}));

describe("App rendering — every connection's from/to data-var must exist in the DOM", () => {
  let container;
  beforeEach(() => {
    window.location.hash = "";
    const r = render(<App />);
    container = r.container;
  });
  afterEach(() => cleanup());

  it("renders without throwing", () => {
    expect(container).toBeTruthy();
  });

  it.each(REQUIRED_DATA_VARS)('renders an element with data-var="%s"', (id) => {
    const el = container.querySelector(`[data-var="${id}"]`);
    expect(el, `missing data-var="${id}" — arrow has no anchor`).not.toBeNull();
  });

  it("for every connection, both endpoints render", () => {
    const missing = [];
    for (const c of CONNECTIONS) {
      if (!container.querySelector(`[data-var="${c.from}"]`)) missing.push(`from=${c.from}`);
      if (!container.querySelector(`[data-var="${c.to}"]`))   missing.push(`to=${c.to}`);
    }
    expect(missing, `unrendered arrow endpoints: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("App rendering — every equation card visibly shows its formula", () => {
  let container;
  beforeEach(() => {
    window.location.hash = "";
    const r = render(<App />);
    container = r.container;
  });
  afterEach(() => cleanup());

  const expectedTags = [
    "Monthly Contribution Required",
    "Target Nest Egg",
    "Future Value of Current Investments",
    "Annual Retirement Expenses",
    "Time Horizon",
    "Monthly Rate Conversion",
    "Monthly cost breakdown",
  ];

  it.each(expectedTags)('shows the "%s" card', (tag) => {
    expect(container.textContent).toContain(tag);
  });
});
