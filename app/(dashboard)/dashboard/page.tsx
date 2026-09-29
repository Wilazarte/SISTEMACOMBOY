import { redirect } from "next/navigation";

// El Dashboard de KPIs se implementa en la siguiente fase.
export default function DashboardHome() {
  redirect("/dashboard/compras");
}
