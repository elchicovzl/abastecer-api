/**
 * Tailwind 4 se engancha vía @tailwindcss/postcss.
 * El plugin `tailwindcss` directo es de la v3 y acá NO funciona.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
