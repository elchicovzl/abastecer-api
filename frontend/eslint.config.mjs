import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * eslint-config-next 16 exporta flat config NATIVO (arrays).
 * NO usar FlatCompat de @eslint/eslintrc: con ESLint 10 entra en
 * recursión al serializar el plugin de React y revienta con
 * "Converting circular structure to JSON".
 */
const config = [
  { ignores: [".next/**", "node_modules/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      // React 19 + Compiler: memoizar a mano es ruido, no optimización.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default config;
