import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
