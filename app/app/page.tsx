import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { homeDaInterface } from "@/lib/navigation/interface";
export default async function AppHome() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // Instalação recém-criada ainda não tem vínculo/organização. Perfil era o
  // fallback técnico de uma interface vazia, mas não permite iniciar o CRM.
  if (!org) redirect("/get-started");
  redirect(
    homeDaInterface(
      org?.interface_settings,
      user.is_platform_admin && !user.support,
      org?.role ?? null,
    ),
  );
}
