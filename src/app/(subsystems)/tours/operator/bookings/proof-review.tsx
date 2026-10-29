"use client";

import { formatPeso } from "@/lib/money";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { PROOF_METHODS, isProofMethod } from "@/lib/tours/payment-proof";
import { getProofViewUrl, reviewPaymentProof } from "./payment-actions";

export type ReviewableProof = {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string;
  submitted_at: string;
};

const peso = formatPeso;

export function ProofReview({ proofs }: { proofs: ReviewableProof[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [approving, setApproving] = useState<ReviewableProof | null>(null);
  const [rejecting, setRejecting] = useState<ReviewableProof | null>(null);
  const [reason, setReason] = useState("");

  if (proofs.length === 0) return null;

  function submit(proofId: string, decision: "approve" | "reject") {
    const formData = new FormData();
    formData.set("proofId", proofId);
    formData.set("decision", decision);
    if (decision === "reject") formData.set("reason", reason);
    startTransition(async () => {
      const response = await reviewPaymentProof(formData);
      setResult(response.success ? { tone: "success", text: response.message ?? "Saved." } : { tone: "error", text: response.error ?? "Something went wrong." });
      if (response.success) {
        setApproving(null);
        setRejecting(null);
        setReason("");
        router.refresh();
      }
    });
  }

  function viewReceipt(proofId: string) {
    startTransition(async () => {
      const response = await getProofViewUrl(proofId);
      if (response.url) window.open(response.url, "_blank", "noopener,noreferrer");
      else setResult({ tone: "error", text: response.error ?? "The receipt could not be opened." });
    });
  }

  return (
    <div className="mb-4 rounded-2xl bg-yellow-50/60 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold text-yellow-900">
        Receipts to verify <Badge tone="warning">{proofs.length}</Badge>
      </p>
      {result ? <Notice variant={result.tone} className="mb-3">{result.text}</Notice> : null}
      <ul className="space-y-3">
        {proofs.map((proof) => (
          <li key={proof.id} className="rounded-2xl bg-white p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base font-bold text-daet-ink">{peso(proof.amount)}</span>
              <span className="text-daet-ink/70">
                {isProofMethod(proof.payment_method) ? PROOF_METHODS[proof.payment_method] : proof.payment_method} · Ref {proof.reference_number}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="ghost" onClick={() => viewReceipt(proof.id)} disabled={pending}>
                View
              </Button>
              <Button variant="danger" onClick={() => setRejecting(proof)} disabled={pending}>
                Reject
              </Button>
              <Button onClick={() => setApproving(proof)} disabled={pending}>
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={approving !== null}
        title="Confirm this payment?"
        description={
          approving
            ? `Only approve after you see ${peso(approving.amount)} (ref ${approving.reference_number}) in your GCash or bank account. It will be added to the booking's payments.`
            : undefined
        }
        confirmLabel="Yes, payment received"
        confirmVariant="primary"
        loading={pending}
        onConfirm={() => approving && submit(approving.id, "approve")}
        onCancel={() => setApproving(null)}
      />

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject this receipt?"
        description="The tourist will see your reason and can send a new receipt."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={() => rejecting && submit(rejecting.id, "reject")}>
              Reject receipt
            </Button>
          </>
        }
      >
        <Field id="reject-reason" label="Reason" hint="e.g. Amount not received, or reference number doesn't match" required>
          <Textarea id="reject-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </Field>
      </Modal>
    </div>
  );
}
