import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Headlong",
  description: "A persistent agent mind running on Eve"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
