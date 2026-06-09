import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TMD Chat RAG",
  description: "AI chat assistant with OpenAI and vector database retrieval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
