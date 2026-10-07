export type Theme = "dark" | "light";

/** Colors drawn from code (charts and map strokes), which CSS variables do not reach. */
export interface Palette {
  text: string;
  muted: string;
  grid: string;
  axis: string;
  cursor: string;
  primary: string;
  reference: string;
  faint: string;
  dotStroke: string;
  tipFill: string;
  tipStroke: string;
  border: string;
  outline: string;
  hover: string;
  halo: string;
  select: string;
  noFill: string;
}

const PALETTES: Record<Theme, Palette> = {
  dark: {
    text: "#eae6e5",
    muted: "#9a9a9a",
    grid: "rgba(255,255,255,0.05)",
    axis: "rgba(255,255,255,0.25)",
    cursor: "rgba(234,230,229,0.45)",
    primary: "#cfb991",
    reference: "#8b8b8b",
    faint: "rgba(255,255,255,0.18)",
    dotStroke: "#0f0f0f",
    tipFill: "#161616",
    tipStroke: "#3a3a3a",
    border: "#0a0a0a",
    outline: "#0a0a0a",
    hover: "#eae6e5",
    halo: "#050505",
    select: "#cfb991",
    noFill: "#2a2a2a",
  },
  light: {
    text: "#1c1b1a",
    muted: "#5e5a55",
    grid: "rgba(0,0,0,0.07)",
    axis: "rgba(0,0,0,0.3)",
    cursor: "rgba(28,27,26,0.45)",
    primary: "#9a7637",
    reference: "#77726b",
    faint: "rgba(0,0,0,0.2)",
    dotStroke: "#ffffff",
    tipFill: "#ffffff",
    tipStroke: "#ddd7ce",
    border: "#ffffff",
    outline: "#1c1b1a",
    hover: "#1c1b1a",
    halo: "#ffffff",
    select: "#1c1b1a",
    noFill: "#d9d4cc",
  },
};

const KEY = "agmet-theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function palette(): Palette {
  return PALETTES[currentTheme()];
}

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f6f4f0" : "#0a0a0a");
  const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (btn) {
    const next = theme === "light" ? "dark" : "light";
    btn.setAttribute("aria-label", `Switch to ${next} mode`);
    btn.title = `Switch to ${next} mode`;
  }
}

/** Dark by default to match the lab site; a choice made with the toggle is remembered. */
export function initTheme(onChange: () => void): void {
  apply(stored() ?? "dark");
  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private mode: the toggle still works for this visit
    }
    onChange();
  });
}
