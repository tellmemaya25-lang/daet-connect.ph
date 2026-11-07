import { savePackageDraft } from "./actions";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createEmptyDraft } from "./draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/tours/server-auth", () => ({ getVerifiedSession: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockGetSession = getVerifiedSession as jest.MockedFunction<typeof getVerifiedSession>;
const mockCreateSessionClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

const OPERATOR_ID = "39b3e5fc-29e0-4335-b8aa-56f699b34132";
const PROFILE_ID = "972f6ec1-a283-4d42-a93c-080d13d56467";

interface FakeRow extends Record<string, unknown> {
  id: string;
}

/**
 * A tiny in-memory stand-in for the Supabase query builder: enough of
 * select/eq/insert/update/delete to follow one wizard save from start to
 * finish, including the child tables.
 */
function makeClient(options: { rpcError?: { message: string } } = {}) {
  const tables: Record<string, FakeRow[]> = {
    tours_packages: [],
    tours_package_price_variants: [],
    tours_package_inclusions: [],
    tours_package_stops: [],
    tours_package_gallery: [],
  };
  let counter = 0;
  const rpc = jest.fn().mockResolvedValue({ error: options.rpcError ?? null });

  const from = (table: string) => {
    if (!tables[table]) tables[table] = [];
    const filters: Array<[string, unknown]> = [];
    let operation: "select" | "insert" | "update" | "delete" = "select";
    let payload: unknown = null;

    const matches = () => tables[table].filter((row) => filters.every(([column, value]) => row[column] === value));

    const run = (single: boolean) => {
      if (operation === "insert") {
        const incoming = Array.isArray(payload) ? payload : [payload];
        const created = incoming.map((row) => ({
          id: (row as FakeRow).id ?? `row-${++counter}`,
          created_at: new Date("2026-11-07T08:00:00.000Z").toISOString(),
          updated_at: new Date("2026-11-07T08:00:00.000Z").toISOString(),
          ...(row as Record<string, unknown>),
        })) as FakeRow[];
        tables[table].push(...created);
        return { data: single ? created[0] : created, error: null };
      }

      if (operation === "update") {
        const updated = matches().map((row) => ({ ...row, ...(payload as Record<string, unknown>) }));
        for (const row of updated) {
          const index = tables[table].findIndex((existing) => existing.id === row.id);
          if (index >= 0) tables[table][index] = row;
        }
        return { data: single ? (updated[0] ?? null) : updated, error: null };
      }

      if (operation === "delete") {
        const removed = matches();
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return { data: null, error: null };
      }

      const rows = matches();
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };

    const builder = {
      select: () => builder,
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      insert(value: unknown) {
        operation = "insert";
        payload = value;
        return builder;
      },
      update(value: unknown) {
        operation = "update";
        payload = value;
        return builder;
      },
      delete() {
        operation = "delete";
        return builder;
      },
      maybeSingle: () => Promise.resolve(run(true)),
      single: () => Promise.resolve(run(true)),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run(false)).then(resolve, reject),
    };
    return builder;
  };

  return { from: jest.fn(from), rpc, tables };
}

function completeDraft(): EditPackageFormData {
  return {
    ...createEmptyDraft(),
    title: "Bagasbas surf lesson",
    locationName: "Bagasbas Beach, Daet",
    description: "Two hours with a local instructor, board and rash guard included.",
    durationValue: 3,
    durationType: "hours",
    priceVariants: [
      { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: true },
    ],
    inclusions: [{ text: "Board and rash guard", isIncluded: true, displayOrder: 1 }],
    stops: [
      {
        locationName: "Bagasbas Beach",
        description: "Meet at the lifeguard station.",
        latitude: 14.1122,
        longitude: 122.9553,
        estimatedDurationMinutes: 120,
        stopOrder: 1,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReset();
  mockCreateSessionClient.mockReset();
  mockGetSession.mockResolvedValue({ user: { id: PROFILE_ID } as never, role: "operator", error: null });
});

function signInAsOperator(client: ReturnType<typeof makeClient>) {
  const operatorRow = { id: OPERATOR_ID, accreditation_status: "approved", profile_id: PROFILE_ID };
  // The operator lookup is a plain read on tours_operators.
  client.tables.tours_operators = [operatorRow];
  mockCreateSessionClient.mockResolvedValue(client as never);
  return client;
}

describe("savePackageDraft", () => {
  it("creates the draft on the first save and writes every list", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const result = await savePackageDraft({ draft: completeDraft() });

    expect(result.success).toBe(true);
    expect(result.status).toBe("draft");
    expect(result.packageId).toBeTruthy();

    const [created] = client.tables.tours_packages;
    expect(created).toMatchObject({
      id: result.packageId,
      operator_id: OPERATOR_ID,
      status: "draft",
      title: "Bagasbas surf lesson",
      location_name: "Bagasbas Beach, Daet",
      duration_type: "hours",
    });
    expect(client.tables.tours_package_price_variants).toHaveLength(1);
    expect(client.tables.tours_package_inclusions[0]).toMatchObject({ item_text: "Board and rash guard", display_order: 1 });
    expect(client.tables.tours_package_stops[0]).toMatchObject({ stop_order: 1, location_name: "Bagasbas Beach" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("saves again into the same draft instead of starting another", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const first = await savePackageDraft({ draft: completeDraft() });
    const second = await savePackageDraft({
      packageId: first.packageId,
      draft: { ...completeDraft(), title: "Bagasbas surf lesson, sunrise" },
    });

    expect(second.success).toBe(true);
    expect(second.packageId).toBe(first.packageId);
    expect(client.tables.tours_packages).toHaveLength(1);
    expect(client.tables.tours_packages[0].title).toBe("Bagasbas surf lesson, sunrise");
    // Lists are replaced, not duplicated.
    expect(client.tables.tours_package_inclusions).toHaveLength(1);
  });

  it("keeps an incomplete draft saveable, so no step can lose work", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const result = await savePackageDraft({
      draft: { ...createEmptyDraft(), title: "Island hopping", locationName: "Daet" },
    });

    expect(result.success).toBe(true);
    expect(client.tables.tours_package_price_variants).toHaveLength(0);
    expect(client.tables.tours_package_stops).toHaveLength(0);
  });

  it("refuses a package that belongs to another operator", async () => {
    const client = makeClient();
    signInAsOperator(client);
    client.tables.tours_packages.push({
      id: "someone-elses-package",
      operator_id: "another-operator",
      status: "draft",
      updated_at: "2026-11-07T00:00:00.000Z",
    });

    const result = await savePackageDraft({ packageId: "someone-elses-package", draft: completeDraft() });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not be found/i);
    expect(client.tables.tours_packages[0].title).toBeUndefined();
  });

  it("refuses to write while the Tourism Office is reviewing the package", async () => {
    const client = makeClient();
    signInAsOperator(client);
    client.tables.tours_packages.push({
      id: "in-review",
      operator_id: OPERATOR_ID,
      status: "pending_review",
      updated_at: "2026-11-07T00:00:00.000Z",
    });

    const result = await savePackageDraft({ packageId: "in-review", draft: completeDraft() });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/with the Tourism Office/i);
  });

  it("rejects a payload it cannot trust", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const result = await savePackageDraft({ draft: { ...completeDraft(), durationType: "weeks" } });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hours or days/i);
    expect(client.tables.tours_packages).toHaveLength(0);
  });

  it("rejects bad values with field errors, not a database write", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const result = await savePackageDraft({
      draft: { ...completeDraft(), title: "Sh" },
    });

    expect(result.success).toBe(false);
    expect(result.errors?.title).toBeTruthy();
    expect(client.tables.tours_packages).toHaveLength(0);
  });

  it("needs an approved operator account", async () => {
    const client = makeClient();
    client.tables.tours_operators = [{ id: OPERATOR_ID, accreditation_status: "pending", profile_id: PROFILE_ID }];
    mockCreateSessionClient.mockResolvedValue(client as never);

    const result = await savePackageDraft({ draft: completeDraft() });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/approved/i);
    expect(client.tables.tours_packages).toHaveLength(0);
  });

  it("needs a signed-in operator", async () => {
    const client = makeClient();
    signInAsOperator(client);
    mockGetSession.mockResolvedValue({ user: null, role: null, error: null });

    const result = await savePackageDraft({ draft: completeDraft() });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/session/i);
    expect(client.tables.tours_packages).toHaveLength(0);
  });

  it("applies the full rules before sending a package for review", async () => {
    const client = makeClient();
    signInAsOperator(client);
    const draft = completeDraft();
    draft.priceVariants = [];
    draft.stops = [];

    const result = await savePackageDraft({ draft, submitForReview: true });

    expect(result.success).toBe(false);
    expect(result.errors?.priceVariants).toBeTruthy();
    expect(result.errors?.stops).toBeTruthy();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("submits a complete package and reports the new status", async () => {
    const client = makeClient();
    signInAsOperator(client);

    const result = await savePackageDraft({ draft: completeDraft(), submitForReview: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe("pending_review");
    expect(client.rpc).toHaveBeenCalledWith("submit_package_for_review", { p_package_id: result.packageId });
  });

  it("keeps the save when the database guard refuses the review", async () => {
    const client = makeClient({ rpcError: { message: "Add at least one map stop before submitting." } });
    signInAsOperator(client);

    const result = await savePackageDraft({ draft: completeDraft(), submitForReview: true });

    expect(result.success).toBe(true);
    expect(result.status).toBe("draft");
    expect(result.packageId).toBeTruthy();
    expect(result.notice).toMatch(/map stop/i);
  });
});
