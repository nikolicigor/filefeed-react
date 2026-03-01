import React from "react";
import { LAYOUT } from "../constants";

export const headerCellBase: React.CSSProperties = {
  fontWeight: 500,
  fontSize: "12px",
  height: "24px",
  borderBottom: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
  borderRight: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
  backgroundColor: "var(--ff-header-bg, var(--mantine-color-gray-0))",
  padding: "6px 10px",
  minWidth: `${LAYOUT.MIN_COLUMN_WIDTH}px`,
};

export const inputBase: React.CSSProperties = {
  width: "100%",
  height: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
  minHeight: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
  maxHeight: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
  outline: "none",
  padding: "6px 10px",
  fontSize: "12px",
  color: "var(--ff-text, var(--mantine-color-gray-8))",
  boxSizing: "border-box",
  minWidth: 0,
  borderRadius: "0px",
  transition: "border-color 0.1s ease, background-color 0.1s ease",
};

export const emptyCellStyle: React.CSSProperties = {
  padding: "6px 10px",
  height: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
  minHeight: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
};

export const submitBtnStyles = {
  root: {
    backgroundColor: "black",
    color: "white",
    border: "none",
    "&:hover": { backgroundColor: "#333" },
    "&:disabled": {
      backgroundColor: "var(--mantine-color-gray-4)",
      color: "var(--mantine-color-gray-6)",
      border: "none",
      cursor: "not-allowed",
    },
  },
} as const;

export const outlineBtnStyles = {
  root: {
    backgroundColor: "var(--ff-bg-surface, white)",
    borderColor: "var(--ff-text, black)",
    color: "var(--ff-text, black)",
    fontSize: "12px",
    "&:hover": { backgroundColor: "var(--ff-header-bg, var(--mantine-color-gray-0))" },
  },
} as const;
