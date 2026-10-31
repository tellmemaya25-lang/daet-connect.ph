import { nextTheme, parseTheme, THEME_INIT_SCRIPT } from "@/lib/theme";

describe("theme preference", () => {
  it("treats anything but light or dark as system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
  });

  it("cycles light, dark, system", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });

  it("applies a saved choice before paint and ignores bad values", () => {
    const run = (stored: string | null) => {
      const attrs: Record<string, string> = {};
      const fn = new Function("localStorage", "document", THEME_INIT_SCRIPT);
      fn({ getItem: () => stored }, { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } });
      return attrs["data-theme"];
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("<script>")).toBeUndefined();
    expect(run(null)).toBeUndefined();
  });
});
