"use client";

import React, { useCallback, useRef } from "react";

export interface FilterItem {
  label: string;
  value: "all" | "valid" | "invalid";
  count: number;
}

interface ReviewFilterBarProps {
  items: FilterItem[];
  selected: FilterItem["value"];
  onSelect: (value: FilterItem["value"]) => void;
  isLoading?: boolean;
  panelId?: string;
}

const filterBarStyle: React.CSSProperties = {
  display: "flex",
  backgroundColor: "var(--mantine-color-gray-1)",
  borderRadius: "6px",
  padding: "2px",
  gap: "2px",
};

const buttonBaseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  color: "var(--mantine-color-gray-7)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const selectedButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "white",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
};

const unselectedButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "transparent",
  boxShadow: "none",
};

const countBadgeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  width: "60px",
  height: "20px",
  borderRadius: 4,
  backgroundColor: "var(--mantine-color-gray-0)",
  border: "1px solid var(--mantine-color-gray-3)",
  color: "var(--mantine-color-gray-7)",
  fontSize: "11px",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: 0,
  padding: "0 6px",
  boxSizing: "border-box",
};

const shimmerTrackStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 8,
  borderRadius: 9999,
  overflow: "hidden",
  background: "var(--mantine-color-gray-3)",
};

const shimmerBarStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  transform: "translateX(-100%)",
  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
  animation: "ff-shimmer 1.2s linear infinite",
};

export const ReviewFilterBar = React.memo(function ReviewFilterBar({
  items,
  selected,
  onSelect,
  isLoading,
  panelId,
}: ReviewFilterBarProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();

      const currentIdx = items.findIndex((i) => i.value === selected);
      let nextIdx: number;
      if (e.key === "ArrowRight") {
        nextIdx = (currentIdx + 1) % items.length;
      } else {
        nextIdx = (currentIdx - 1 + items.length) % items.length;
      }
      onSelect(items[nextIdx].value);

      const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIdx]?.focus();
    },
    [items, selected, onSelect]
  );

  return (
    <div
      ref={tablistRef}
      style={filterBarStyle}
      role="tablist"
      aria-label="Data filter"
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const isSelected = item.value === selected;
        return (
          <button
            key={item.value}
            role="tab"
            tabIndex={isSelected ? 0 : -1}
            aria-selected={isSelected}
            aria-controls={panelId}
            onClick={() => onSelect(item.value)}
            style={isSelected ? selectedButtonStyle : unselectedButtonStyle}
          >
            <span>{item.label}</span>
            <div style={countBadgeStyle} aria-busy={isLoading}>
              {isLoading ? (
                <div style={shimmerTrackStyle}>
                  <div style={shimmerBarStyle} />
                </div>
              ) : (
                item.count
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});
