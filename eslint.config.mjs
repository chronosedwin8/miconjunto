import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@next/next/no-img-element": "off",
    },
  },
  {
    ignores: ["node_modules/**", "TheSlide/**", ".next/**", ".next-*/**", "out/**", "build/**", "next-env.d.ts", "public/sw.js", "public/swe-worker*", "storage/**", "screenshots-tmp/**", "playwright-report/**", "test-results/**"],
  },
];

export default eslintConfig;
