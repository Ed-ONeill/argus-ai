// app/workstation/page.tsx — the Workstation (Surface #7), the product's interrogation surface.
// Two states: the Docket and a seven-beat Case. WorkstationPage reads ?subject via
// useSearchParams, so it is wrapped in a Suspense boundary.

import { Suspense } from "react";
import WorkstationPage from "@/components/workstation/WorkstationPage";

export default function WorkstationRoute() {
  return (
    <Suspense fallback={null}>
      <WorkstationPage />
    </Suspense>
  );
}
