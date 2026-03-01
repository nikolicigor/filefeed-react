import { useCallback, useEffect, useState } from "react";
import { LAYOUT } from "../constants";

const HEADER_BORDER = 2;
const ROW_BORDER = 1;
const CONTAINER_PADDING = 32;
const MIN_ROWS = 5;
const MAX_ROWS = 50;

export function useDynamicRowCount() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [maxRows, setMaxRows] = useState(18);

  const setContainerRef = useCallback((el: HTMLElement | null) => {
    setContainer(el);
  }, []);

  useEffect(() => {
    if (!container) return;

    const calculate = () => {
      const containerHeight = container.clientHeight;
      const headerHeight = LAYOUT.MANUAL_ROW_HEIGHT + HEADER_BORDER;
      const rowHeight = LAYOUT.MANUAL_ROW_HEIGHT + ROW_BORDER;
      const availableHeight = containerHeight - headerHeight - CONTAINER_PADDING;
      const calculatedRows = Math.floor(availableHeight / rowHeight);
      const newMaxRows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, calculatedRows));
      setMaxRows(newMaxRows);
    };

    calculate();
    const ro = new ResizeObserver(calculate);
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  return { setContainerRef, maxRows } as const;
}
