import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Existing code breaks these in many places. They warn for now so CI can
    // block on everything else; tighten one at a time as the warnings are fixed.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // A leading underscore marks a deliberately unused name.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
  // CommonJS files and the Node scripts load modules with require().
  { files: ["**/*.cjs", "scripts/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", ignoreRestSiblings: true }] } },
  // Tests: jest.mock factories require() lazily, and stub links are plain anchors.
  {
    files: ["**/*.test.{ts,tsx}", "e2e/**"],
    rules: { "@typescript-eslint/no-require-imports": "off", "@next/next/no-html-link-for-pages": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "test-results/**", "playwright-report/**", "supabase/**"]),
]);
