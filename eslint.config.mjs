import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Extra ignores beyond eslint-config-next's built-in defaults
  // (".next/**", "out/**", "build/**", "next-env.d.ts").
  globalIgnores([".vercel/**", ".understand-anything/**"]),
]);

export default eslintConfig;
