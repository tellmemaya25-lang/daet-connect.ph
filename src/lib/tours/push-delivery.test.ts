import { deliverNotification, type PushStore, type StoredSubscription } from "@/lib/tours/push-delivery";

const notification = { id: "n1", profile_id: "p1", type: "payment_received", title: "Payment received", body: "₱500.00", link: "/tours/operator/payments", pushed_at: null as string | null };
const sub = (id: string): StoredSubscription => ({ id, endpoint: `https://push.example/${id}`, p256dh_key: "k", auth_key: "a" });

function store(overrides: Partial<PushStore> = {}): PushStore & { removed: string[]; pushed: string[] } {
  const removed: string[] = [];
  const pushed: string[] = [];
  return {
    removed,
    pushed,
    getNotification: async () => notification,
    getSubscriptions: async () => [sub("s1"), sub("s2"), sub("s3")],
    removeSubscription: async (id) => void removed.push(id),
    markPushed: async (id) => void pushed.push(id),
    ...overrides,
  };
}

describe("deliverNotification", () => {
  it("sends the payload to every device and forgets expired ones", async () => {
    const s = store();
    const payloads: string[] = [];
    const result = await deliverNotification("n1", s, async (subscription, payload) => {
      payloads.push(payload);
      if (subscription.endpoint.endsWith("s2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (subscription.endpoint.endsWith("s3")) throw Object.assign(new Error("server"), { statusCode: 500 });
    });
    expect(result).toEqual({ status: "sent", sent: 1, removed: 1, failed: 1 });
    expect(s.removed).toEqual(["s2"]);
    expect(s.pushed).toEqual(["n1"]);
    expect(JSON.parse(payloads[0])).toEqual({ title: "Payment received", body: "₱500.00", url: "/tours/operator/payments", tag: "notification:n1" });
  });

  it("never pushes twice, and skips missing notifications or users without devices", async () => {
    const send = jest.fn();
    expect((await deliverNotification("n1", store({ getNotification: async () => ({ ...notification, pushed_at: "2026-10-23T00:00:00Z" }) }), send)).status).toBe("already_sent");
    expect((await deliverNotification("n1", store({ getNotification: async () => null }), send)).status).toBe("not_found");
    const noDevices = store({ getSubscriptions: async () => [] });
    expect((await deliverNotification("n1", noDevices, send)).status).toBe("no_devices");
    expect(noDevices.pushed).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
