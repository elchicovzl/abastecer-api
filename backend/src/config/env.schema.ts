import { z } from "zod";

/**
 * Config validada al arrancar. Si falta un secreto o el TTL está mal escrito,
 * la app NO levanta — y eso es lo que querés. Una app que arranca con
 * `JWT_ACCESS_SECRET` undefined firma tokens con "undefined" y no te enterás
 * hasta que alguien los falsifica.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),

  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, {
    error: "JWT_ACCESS_SECRET debe tener al menos 32 caracteres",
  }),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32, {
    error: "JWT_REFRESH_SECRET debe tener al menos 32 caracteres",
  }),
  JWT_REFRESH_TTL: z.string().default("7d"),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const detalle = result.error.issues
      .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración inválida:\n${detalle}`);
  }

  // Los dos secretos IGUALES anulan el beneficio de tenerlos separados:
  // filtrar el de access te deja forjar refresh tokens de 7 días.
  if (result.data.JWT_ACCESS_SECRET === result.data.JWT_REFRESH_SECRET) {
    throw new Error(
      "JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser DISTINTOS.",
    );
  }

  return result.data;
}
