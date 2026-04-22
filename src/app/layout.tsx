import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavBar } from "@/components/nav-bar";

export const metadata: Metadata = {
  title: "Agent Benchmark",
  description: "AI Agent Benchmark Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
