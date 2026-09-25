import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/sw.js"] },
  ...nextVitals,
  ...nextTs,
];

export default eslintConfig;
