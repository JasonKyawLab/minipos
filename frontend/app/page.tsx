// app/page.tsx — Root redirect to /login
import { redirect } from "next/navigation";
export default function RootPage() {
  redirect("/login");
}