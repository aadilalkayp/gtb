export const metadata = {
  title: "GTB OS API",
  description: "Backend for GTB OS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
