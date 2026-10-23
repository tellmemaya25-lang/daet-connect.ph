import {
  MAX_PENDING_PROOFS_PER_BOOKING,
  parseProofDecision,
  parseProofForm,
  proofLedgerMethod,
  PROOF_MAX_BYTES,
} from "@/lib/tours/payment-proof";

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const receipt = () => new File(["png"], "receipt.png", { type: "image/png" });
const valid = () => ({ amount: "1378", paymentMethod: "gcash", referenceNumber: "1009 234 5678", proof: receipt() });

describe("parseProofForm", () => {
  it("accepts a valid receipt", () => {
    const result = parseProofForm(form(valid()), 1378);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ amount: 1378, paymentMethod: "gcash", referenceNumber: "1009 234 5678", extension: "png" });
  });

  it("accepts partial payments and centavos", () => {
    const result = parseProofForm(form({ ...valid(), amount: "500.50" }), 1378);
    expect(result.ok && result.data.amount).toBe(500.5);
  });

  it("rejects amounts above the remaining balance", () => {
    const result = parseProofForm(form({ ...valid(), amount: "1378.01" }), 1378);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.amount).toContain("remaining balance");
  });

  it.each(["0", "-5", "abc", "1.234", "", "1e3"])("rejects amount %p", (amount) => {
    const result = parseProofForm(form({ ...valid(), amount }), 1378);
    expect(result.ok).toBe(false);
  });

  it("requires a known method and a sensible reference", () => {
    const result = parseProofForm(form({ ...valid(), paymentMethod: "bitcoin", referenceNumber: "<script>" }), 1378);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["paymentMethod", "referenceNumber"]);
  });

  it("requires a supported receipt file under 5 MB", () => {
    const missing = parseProofForm(form({ amount: "10", paymentMethod: "gcash", referenceNumber: "ABCD" }), 1378);
    expect(!missing.ok && missing.errors.proof).toContain("Attach");

    const gif = parseProofForm(form({ ...valid(), proof: new File(["x"], "a.gif", { type: "image/gif" }) }), 1378);
    expect(!gif.ok && gif.errors.proof).toContain("JPG");

    const big = parseProofForm(form({ ...valid(), proof: new File([new Uint8Array(PROOF_MAX_BYTES + 1)], "a.pdf", { type: "application/pdf" }) }), 1378);
    expect(!big.ok && big.errors.proof).toContain("5 MB");
  });

  it("caps pending proofs per booking at a small number", () => {
    expect(MAX_PENDING_PROOFS_PER_BOOKING).toBeLessThanOrEqual(5);
  });
});

describe("parseProofDecision", () => {
  it("approves without a reason", () => {
    expect(parseProofDecision(form({ decision: "approve" }))).toEqual({ ok: true, value: { decision: "approve" } });
  });

  it("requires a reason to reject", () => {
    expect(parseProofDecision(form({ decision: "reject", reason: "no" })).ok).toBe(false);
    expect(parseProofDecision(form({ decision: "reject", reason: "Amount does not match the receipt" }))).toEqual({
      ok: true,
      value: { decision: "reject", reason: "Amount does not match the receipt" },
    });
  });

  it("rejects unknown decisions", () => {
    expect(parseProofDecision(form({ decision: "maybe" })).ok).toBe(false);
  });
});

describe("proofLedgerMethod", () => {
  it("maps proof methods onto ledger values", () => {
    expect(proofLedgerMethod("gcash")).toBe("gcash");
    expect(proofLedgerMethod("bank_transfer")).toBe("bank_transfer");
    expect(proofLedgerMethod("paymaya")).toBe("other");
  });
});
