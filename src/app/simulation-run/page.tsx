import { Suspense } from "react";
import SimulationRunPageClient from "./simulation-run-client";

export default function SimulationRunPage() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground container mx-auto max-w-4xl px-4 py-16 text-center text-sm">
          加载中…
        </div>
      }
    >
      <SimulationRunPageClient />
    </Suspense>
  );
}
