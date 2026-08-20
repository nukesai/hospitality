import type { ReactElement, ReactNode } from "react";

export const metadata = {
  title: "Nukes POS Example",
  description: "Consumer fixture for the @nukesai-pos packages.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
