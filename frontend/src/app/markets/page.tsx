// app/markets/page.tsx — the Market surface (Surface #4), "How is the market changing?".
// The prior theme-organized dashboard has been retired; MarketPage (the Rotation Map) is
// canonical, and its deeper analytics live in the Workstation. MarketPage is a client component
// that reads ?view via useSearchParams, so it is wrapped in a Suspense boundary.

import { Suspense } from "react";
import MarketPage from "@/components/markets/MarketPage";

export default function MarketsRoute() {
  return (
    <Suspense fallback={null}>
      <MarketPage />
    </Suspense>
  );
}
