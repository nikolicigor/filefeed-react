import { useContext, useSyncExternalStore } from "react";
import { FilefeedContext } from "../provider/FilefeedProvider";
import type { GlobalPortalState } from "../provider/globalPortal";
import {
  subscribe as subscribeGlobal,
  getSnapshot as getGlobalSnapshot,
  openPortal as openGlobalPortal,
  closePortal as closeGlobalPortal,
  getServerSnapshot as getGlobalServerSnapshot,
} from "../provider/globalPortal";

const NOOP_SUBSCRIBE = () => () => {};
const EMPTY_SNAPSHOT: GlobalPortalState = { open: false, portalContainer: null };
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export function useFilefeed() {
  const ctx = useContext(FilefeedContext);
  const hasCtx = ctx !== null;

  const snapshot = useSyncExternalStore(
    hasCtx ? NOOP_SUBSCRIBE : subscribeGlobal,
    hasCtx ? getEmptySnapshot : getGlobalSnapshot,
    hasCtx ? getEmptySnapshot : getGlobalServerSnapshot
  );

  if (ctx) return ctx;

  return {
    open: snapshot.open,
    openPortal: openGlobalPortal,
    closePortal: closeGlobalPortal,
    portalContainer: snapshot.portalContainer,
  } as const;
}
