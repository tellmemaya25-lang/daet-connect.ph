import { z } from "zod";

const OperatorDetailsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter the registered business name (at least 2 characters).")
    .max(160, "Business name must be 160 characters or fewer."),
  contactPerson: z
    .string()
    .trim()
    .min(2, "Enter the name of your authorized contact person.")
    .max(120, "Contact name must be 120 characters or fewer."),
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254, "Email address is too long."),
  contactPhone: z
    .string()
    .trim()
    .min(7, "Enter a contact number with at least 7 digits.")
    .max(24, "Contact number is too long.")
    .regex(/^[+\d\s().-]+$/, "Use digits and common phone-number characters only."),
  businessAddress: z
    .string()
    .trim()
    .min(5, "Enter the business address, including barangay and municipality.")
    .max(300, "Business address must be 300 characters or fewer."),
});

export type OperatorDetails = z.infer<typeof OperatorDetailsSchema>;

export function validateOperatorDetails(input: unknown) {
  return OperatorDetailsSchema.safeParse(input);
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  // First message per top-level field, in issue order (what flatten().fieldErrors gave).
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && issue.message && !(field in errors)) errors[field] = issue.message;
  }
  return errors;
}
