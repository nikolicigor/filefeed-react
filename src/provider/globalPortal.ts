export type GlobalPortalState = {
  open: boolean;
  portalContainer: HTMLDivElement | null;
};

export const SERVER_SNAPSHOT: GlobalPortalState = {
  open: false,
  portalContainer: null,
};

let state: GlobalPortalState = {
  open: false,
  portalContainer: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function ensureContainer(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (!state.portalContainer) {
    const el = document.createElement("div");
    el.setAttribute("data-filefeed-portal", "true");
    document.body.appendChild(el);
    state = { ...state, portalContainer: el };
  }
  return state.portalContainer;
}

let openCallers = 0;

export function openPortal() {
  ensureContainer();
  openCallers++;
  if (openCallers > 1 && typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    console.warn(
      "[Filefeed] openPortal() called while already open. The global portal is a singleton — " +
      "wrap each importer in its own <FilefeedProvider> to avoid conflicts."
    );
  }
  if (!state.open) {
    state = { ...state, open: true };
    emit();
  } else {
    emit();
  }
}

export function closePortal() {
  openCallers = Math.max(0, openCallers - 1);
  if (state.open) {
    state = { ...state, open: false };
    emit();
  }
  scheduleAutoDestroy();
}

let autoDestroyTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoDestroy() {
  if (autoDestroyTimer) clearTimeout(autoDestroyTimer);
  autoDestroyTimer = setTimeout(() => {
    if (!state.open && state.portalContainer) {
      destroyPortal();
    }
    autoDestroyTimer = null;
  }, 500);
}

export function destroyPortal() {
  if (autoDestroyTimer) {
    clearTimeout(autoDestroyTimer);
    autoDestroyTimer = null;
  }
  if (state.portalContainer?.parentNode) {
    state.portalContainer.parentNode.removeChild(state.portalContainer);
  }
  state = { open: false, portalContainer: null };
  emit();
}

/**
 * Fully reset all global portal state. Use in SSR environments
 * (e.g. between requests) or in test teardown to prevent state leakage.
 */
export function resetGlobalPortal() {
  if (autoDestroyTimer) {
    clearTimeout(autoDestroyTimer);
    autoDestroyTimer = null;
  }
  if (state.portalContainer?.parentNode) {
    state.portalContainer.parentNode.removeChild(state.portalContainer);
  }
  state = { open: false, portalContainer: null };
  openCallers = 0;
  listeners.clear();
}

export function getSnapshot(): GlobalPortalState {
  return state;
}

export function getServerSnapshot(): GlobalPortalState {
  return SERVER_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
