import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX } from "../constants";

type Ctx = {
  open: boolean;
  openPortal: () => void;
  closePortal: () => void;
  portalContainer: HTMLDivElement | null;
};

export const FilefeedContext = createContext<Ctx | null>(null);

export function FilefeedProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-filefeed-portal", "true");
    document.body.appendChild(el);
    setPortalContainer(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      setPortalContainer(null);
    };
  }, []);

  const openPortal = useCallback(() => {
    setOpen(true);
  }, []);

  const closePortal = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo<Ctx>(() => ({
    open,
    openPortal,
    closePortal,
    portalContainer,
  }), [open, openPortal, closePortal, portalContainer]);

  return (
    <FilefeedContext.Provider value={value}>
      {props.children}
      {open && portalContainer
        ? createPortal(
            <div
              id="filefeed-portal-root"
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: Z_INDEX.PORTAL_ROOT }}
            />,
            portalContainer
          )
        : null}
    </FilefeedContext.Provider>
  );
}
