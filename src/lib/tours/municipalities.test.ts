import { isMunicipality, MUNICIPALITIES, parsePesoInput } from "./municipalities";

describe("municipalities", () => {
  it("lists the twelve towns of Camarines Norte", () => {
    expect(MUNICIPALITIES).toHaveLength(12);
    expect(isMunicipality("Daet")).toBe(true);
    expect(isMunicipality("Naga")).toBe(false);
  });
});

describe("parsePesoInput", () => {
  it("reads pesos with up to two decimals and commas", () => {
    expect(parsePesoInput("1,500.50")).toEqual({ ok: true, value: 1500.5 });
    expect(parsePesoInput("")).toEqual({ ok: true, value: null });
  });
  it("rejects letters, negatives and huge amounts", () => {
    expect(parsePesoInput("5oo").ok).toBe(false);
    expect(parsePesoInput("-5").ok).toBe(false);
    expect(parsePesoInput("200000").ok).toBe(false);
  });
});
