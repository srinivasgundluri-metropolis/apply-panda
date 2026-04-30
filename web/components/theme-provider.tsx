"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps `next-themes` so the rest of the app can call `useTheme()` and the
 * <html> root gets a `class="dark"` toggle for the dark-mode CSS variables.
 * Defaults to system preference; the user's last manual choice is stored
 * in localStorage by next-themes automatically.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
