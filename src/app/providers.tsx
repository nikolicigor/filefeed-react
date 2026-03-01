"use client";
import "../styles/filefeed.css";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { MantineProvider } from "@mantine/core";

const FilefeedProvidersActive = createContext(false);

let mantineCSSInjected = false;

function useMantineCSS() {
  const injectedRef = useRef(false);
  useEffect(() => {
    if (mantineCSSInjected || injectedRef.current) return;
    if (document.querySelector('style[data-filefeed-mantine]')) {
      mantineCSSInjected = true;
      return;
    }
    if (document.querySelector('link[href*="@mantine/core"]') ||
        document.querySelector('style[data-mantine-styles]')) {
      mantineCSSInjected = true;
      return;
    }

    injectedRef.current = true;
    mantineCSSInjected = true;
    import("@mantine/core/styles.css");
  }, []);
}

export function Providers({
  children,
  colorScheme,
}: {
  children: React.ReactNode;
  colorScheme?: "light" | "dark";
}) {
  const alreadyProvided = useContext(FilefeedProvidersActive);
  useMantineCSS();
  if (alreadyProvided) return <>{children}</>;
  return (
    <FilefeedProvidersActive.Provider value={true}>
      <MantineProvider forceColorScheme={colorScheme}>
        {children}
      </MantineProvider>
    </FilefeedProvidersActive.Provider>
  );
}
