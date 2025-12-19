// src/app/(public)/layout.tsx

import { Suspense } from "react";
import MetaPixel from "@/components/meta/MetaPixel";
import MetaRouteTracker from "@/components/meta/MetaRouteTracker";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MetaPixel />
      <Suspense fallback={null}>
        <MetaRouteTracker />
      </Suspense>
      {children}
    </>
  );
}
