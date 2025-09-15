// src/app/layout.tsx
import { Poppins, Arimo, Reenie_Beanie } from "next/font/google";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import { AuthProvider } from "@/context/AuthContext";
import "react-toastify/dist/ReactToastify.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const arimo = Arimo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // las que necesites
  variable: "--font-arimo",
  display: "swap",
});

export const reenie = Reenie_Beanie({
  subsets: ["latin"],
  weight: "400", // solo 400 disponible
  variable: "--font-reenie",
  display: "swap",
});

export const metadata = {
  title: "Ofistur",
  description: "Sistema de gestión para Agencias de Viaje",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${arimo.variable} ${reenie.variable}`}
    >
      <body className="font-sans">
        <AuthProvider>
          <LayoutWrapper>{children}</LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
