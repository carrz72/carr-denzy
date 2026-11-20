import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * Next.js 16 dropped `next lint`, so lint runs through the ESLint CLI
 * (`npm run lint`). This is the standard Next.js set: Core Web Vitals plus
 * the TypeScript rules.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "public/sw.js", "next-env.d.ts", "legacy/**"],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    // New with the React Compiler rules in Next.js 16. The code they flag
    // predates them and is deliberate: reading browser-only state (online,
    // standalone mode, push permission) once mounted, and comparing against
    // Date.now() while a server component renders. Kept visible as warnings
    // rather than rewritten wholesale without a behaviour reason.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
