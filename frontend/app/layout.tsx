import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });

const description = "BU's most loved dining hall dishes, ranked by students.";

export const metadata: Metadata = {
  title: { default: "BU Big Backs", template: "%s — BU Big Backs" },
  description,
  openGraph: { title: "BU Big Backs", description, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
