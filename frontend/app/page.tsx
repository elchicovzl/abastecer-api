import { redirect } from "next/navigation";

import { homeRouteFor } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

/** La raíz manda a cada rol donde tiene trabajo, o al login. */
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? homeRouteFor(user.role) : "/login");
}
