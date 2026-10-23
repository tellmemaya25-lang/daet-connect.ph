/**
 * Manual payment proofs: a tourist pays the operator's GCash/bank account
 * directly, then uploads the receipt; the operator verifies it, which writes
 * a row into the tours_payments ledger.
 */

export const PROOF_BUCKET = "tours-payment-proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
/** Stops a tourist from flooding an operator with unreviewed uploads. */
export const MAX_PENDING_PROOFS_PER_BOOKING = 3;

export const PROOF_METHODS = {
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  paymaya: "Maya",
  other: "Other",
} as const;
export type ProofMethod = keyof typeof PROOF_METHODS;

export function isProofMethod(value: unknown): value is ProofMethod {
  return typeof value === "string" && Object.hasOwn(PROOF_METHODS, value);
}

/** Ledger payment_method for a verified proof (the ledger has no "paymaya" value). */
export function proofLedgerMethod(method: ProofMethod): "gcash" | "bank_transfer" | "other" {
  return method === "gcash" || method === "bank_transfer" ? method : "other";
}

export type ProofInput = {
  amount: number;
  paymentMethod: ProofMethod;
  referenceNumber: string;
  file: File;
  extension: string;
};

export type ProofParseResult = { ok: true; data: ProofInput } | { ok: false; errors: Record<string, string> };

export function parseProofForm(formData: FormData, remainingBalance: number): ProofParseResult {
  const errors: Record<string, string> = {};

  const amountText = typeof formData.get("amount") === "string" ? String(formData.get("amount")).trim() : "";
  let amount = 0;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amountText)) {
    errors.amount = "Enter the amount you paid, e.g. 1500 or 1500.50.";
  } else {
    amount = Number(amountText);
    if (amount <= 0) errors.amount = "Amount must be greater than zero.";
    else if (amount > remainingBalance + 0.001) {
      errors.amount = `Amount is more than the remaining balance of ₱${remainingBalance.toLocaleString("en-PH", { maximumFractionDigits: 2 })}.`;
    }
  }

  const method = formData.get("paymentMethod");
  if (!isProofMethod(method)) errors.paymentMethod = "Choose how you paid.";

  const reference = typeof formData.get("referenceNumber") === "string" ? String(formData.get("referenceNumber")).trim() : "";
  if (reference.length < 4) errors.referenceNumber = "Enter the reference number from your receipt.";
  else if (reference.length > 60) errors.referenceNumber = "Reference number is too long.";
  else if (!/^[A-Za-z0-9 \-_/#.]+$/.test(reference)) errors.referenceNumber = "Use letters, numbers and - / # only.";

  const file = formData.get("proof");
  let extension = "";
  if (!file || typeof file === "string" || file.size === 0) {
    errors.proof = "Attach a screenshot or PDF of your receipt.";
  } else if (!Object.hasOwn(PROOF_FILE_TYPES, file.type)) {
    errors.proof = "Receipt must be a JPG, PNG, WebP or PDF file.";
  } else if (file.size > PROOF_MAX_BYTES) {
    errors.proof = "Receipt must be 5 MB or smaller.";
  } else {
    extension = PROOF_FILE_TYPES[file.type as keyof typeof PROOF_FILE_TYPES];
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { amount, paymentMethod: method as ProofMethod, referenceNumber: reference, file: file as File, extension },
  };
}

export type ProofDecision = { decision: "approve" } | { decision: "reject"; reason: string };

export function parseProofDecision(formData: FormData): { ok: true; value: ProofDecision } | { ok: false; error: string } {
  const decision = formData.get("decision");
  if (decision === "approve") return { ok: true, value: { decision: "approve" } };
  if (decision === "reject") {
    const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : "";
    if (reason.length < 5) return { ok: false, error: "Tell the tourist why the receipt was rejected (at least 5 characters)." };
    if (reason.length > 500) return { ok: false, error: "Reason must be 500 characters or fewer." };
    return { ok: true, value: { decision: "reject", reason } };
  }
  return { ok: false, error: "Choose approve or reject." };
}
