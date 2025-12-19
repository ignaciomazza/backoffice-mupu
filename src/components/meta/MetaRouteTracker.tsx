// src/components/meta/MetaRouteTracker.tsx

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackViewContent } from "@/lib/meta/pixel";

type MetaRouteTrackerProps = {
  enabled?: boolean;
  getContentName?: (pathname: string) => string;
};

export default function MetaRouteTracker({
  enabled = true,
  getContentName,
}: MetaRouteTrackerProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    if (!enabled) return;

    const fullPath = search ? `${pathname}?${search}` : pathname;
    if (lastPathRef.current === fullPath) return;

    lastPathRef.current = fullPath;
    const contentName = getContentName ? getContentName(pathname) : pathname;

    trackViewContent({ content_name: contentName }, { eventSourceUrl: window.location.href });
  }, [enabled, getContentName, pathname, search]);

  return null;
}
