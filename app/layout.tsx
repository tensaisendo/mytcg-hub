import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MYTCG HUB | Catalogue de cartes",
  description: "Parcourez, comparez et collectionnez vos cartes TCG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={poppins.variable}>
      <body>{children}<SiteFooter /></body>
    </html>
  );
}
