import { resolveAppUrl } from "@/lib/app-url";

describe("resolveAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when it is a real address", () => {
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://daet.example.com/", VERCEL: "1", VERCEL_ENV: "production" })).toBe("https://daet.example.com");
  });

  it("keeps localhost for local development", () => {
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
  });

  it("ignores a localhost value on Vercel and uses the production domain", () => {
    expect(
      resolveAppUrl({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "daet-connect-ph.vercel.app",
        VERCEL_URL: "daet-connect-abc123.vercel.app",
      }),
    ).toBe("https://daet-connect-ph.vercel.app");
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "daet-connect-ph.vercel.app" })).toBe(
      "https://daet-connect-ph.vercel.app",
    );
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "localhost:3000", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "daet-connect-ph.vercel.app" })).toBe(
      "https://daet-connect-ph.vercel.app",
    );
  });

  it("uses the deployment's own address on preview builds", () => {
    expect(
      resolveAppUrl({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "daet-connect-ph.vercel.app", VERCEL_URL: "daet-connect-abc123.vercel.app" }),
    ).toBe("https://daet-connect-abc123.vercel.app");
  });
});
