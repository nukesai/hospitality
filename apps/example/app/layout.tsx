import type { ReactElement, ReactNode } from "react";

export const metadata = {
  title: "Nukes POS Example",
  description: "Consumer fixture for the @nukesai-pos packages.",
};

/**
 * The APP's own root layout — example-only, never scaffolded. A real consumer
 * already owns this file, which is exactly why the scaffolded
 * `app/[locale]/layout.tsx` must be a NESTED layout: emitting a second
 * <html>/<body> (and someone else's <title>) into their tree is not the CLI's
 * business.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
