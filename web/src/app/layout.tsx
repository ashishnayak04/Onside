import type { Metadata } from "next";
import { Bebas_Neue, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  variable: "--font-headline",
  subsets: ["latin"],
  weight: "400",
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-label",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Onside — Football Prediction Platform | La Liga & UCL",
  description:
    "Dixon-Coles + SOT model backtested on 1,527 matches. Real form, expected goals, injuries and H2H — every number shows its reasoning.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F5F5F0] text-[#1B4332]">{children}</body>
    </html>
  );
}

