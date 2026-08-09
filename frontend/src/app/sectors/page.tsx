// app/sectors/page.tsx — Sectors is now the "Inside stocks" zoom of the Market surface.
// The route collapses into /markets (mirrors the Explorer -> Company collapse); the prior
// standalone sectors page has been retired.

import { redirect } from "next/navigation";

export default function SectorsRoute() {
  redirect("/markets?view=stocks");
}
