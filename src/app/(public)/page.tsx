// src/app/page.tsx
import LandingClient from "@/app/_landing/LandingClient";

export const dynamic = "force-static";
export const revalidate = 3600;

export default function Page() {
  return <LandingClient />;
}
