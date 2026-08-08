"use client";

import { LogIn } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { loginAction, type ActionState } from "@/app/actions";
import { ErrorMessage } from "@/app/_components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `useActionState` da el estado de pendiente sin useState ni useEffect para
 * el submit. React 19 + Compiler: no hay useMemo ni useCallback — el
 * compilador se encarga y ponerlos a mano sería ruido.
 */
export function LoginForm() {
  const [state, action, isPending] = useActionState<
    ActionState | null,
    FormData
  >(loginAction, null);

  // El error también va a toast: si el usuario tenía la vista scrolleada,
  // un mensaje inline debajo del campo puede pasar desapercibido.
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="usuario@asofer.com"
          required
        />
        {state?.fieldErrors?.email && (
          <ErrorMessage>{state.fieldErrors.email}</ErrorMessage>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state?.fieldErrors?.password && (
          <ErrorMessage>{state.fieldErrors.password}</ErrorMessage>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        <LogIn />
        {isPending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
