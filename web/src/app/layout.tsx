import type { Metadata } from "next";
import { Anton, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
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
      className={`${anton.variable} ${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col bg-ink text-chalk">{children}</body>
    </html>
  );
}