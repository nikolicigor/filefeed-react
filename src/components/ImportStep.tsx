"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Card,
  Text,
  Group,
  Button,
  Divider,
  Box,
  Flex,
  Tooltip,
} from "@mantine/core";
import { IconUpload, IconEdit, IconAlertCircle } from "@tabler/icons-react";
import { ReviewFilterBar } from "./ReviewFilterBar";
import type { SheetConfig } from "../types";
import type { UseManualEntryReturn } from "../hooks/useManualEntry";
import { LAYOUT } from "../constants";
import { submitBtnStyles, outlineBtnStyles } from "./sharedStyles";

// ── Props ────────────────────────────────────────────────────────────

export interface ImportStepProps {
  sheetConfig: SheetConfig;
  isManualEntryMode: boolean;
  onStartManualEntry: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  isUploading: boolean;
  triggerFilePicker: () => void;
  handleFile: (file: File) => Promise<void>;
  manualEntry: UseManualEntryReturn;
  setTableContainerRef: (el: HTMLElement | null) => void;
  maxRows: number;
}

const COL_MIN_WIDTH = 150;
const ROW_HEIGHT = 34;
const PREVIEW_ROWS = 12;

// ── Component ────────────────────────────────────────────────────────

export function ImportStep({
  sheetConfig,
  isManualEntryMode,
  onStartManualEntry,
  onBack,
  onSubmit,
  isLoading,
  isUploading,
  triggerFilePicker,
  handleFile,
  manualEntry,
  setTableContainerRef,
  maxRows,
}: ImportStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [focusedCell, setFocusedCell] = useState<string | null>(null);

  const hasManualRows = manualEntry.totalRows > 0;
  const fields = sheetConfig.fields;
  const requiredCount = fields.filter((f) => f.required).length;

  const filterItems = useMemo(
    () => [
      { label: "All" as const, value: "all" as const, count: manualEntry.totalRows },
      { label: "Valid" as const, value: "valid" as const, count: manualEntry.validRows },
      { label: "Invalid" as const, value: "invalid" as const, count: manualEntry.invalidRows },
    ],
    [manualEntry.totalRows, manualEntry.validRows, manualEntry.invalidRows]
  );

  const handleFocus = useCallback((cellKey: string) => {
    setFocusedCell(cellKey);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedCell(null);
  }, []);

  const manualRows = useMemo(() => {
    const visible = Array.from({ length: maxRows }, (_, i) => i).filter(
      manualEntry.isRowVisible
    );
    const rows: { type: "data" | "blank"; originalIndex: number }[] = visible.map(
      (idx) => ({ type: "data" as const, originalIndex: idx })
    );
    const blanksNeeded = maxRows - visible.length;
    for (let i = 0; i < blanksNeeded; i++) {
      rows.push({ type: "blank", originalIndex: maxRows + i });
    }
    return rows;
  }, [maxRows, manualEntry.isRowVisible]);

  const gridTemplate = `repeat(${fields.length}, minmax(${COL_MIN_WIDTH}px, 1fr))`;
  const gridWidth = Math.max(fields.length * COL_MIN_WIDTH, 800);
  const bodyRows = isManualEntryMode ? manualRows : Array.from({ length: PREVIEW_ROWS }).map((_, i) => ({ type: "blank" as const, originalIndex: i }));

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      {/* ─── Header bar ─── */}
      <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
        <Group gap={10} wrap="nowrap">
          <Text size="sm" c="gray.8" fw={600}>
            {sheetConfig.name || "Data Sheet"}
          </Text>
          <Text size="xs" c="dimmed">·</Text>
          <Text size="xs" c="dimmed">{fields.length} fields</Text>
          {!isManualEntryMode && (
            <>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{requiredCount} required</Text>
            </>
          )}
        </Group>
        <Group
          gap="md"
          wrap="nowrap"
          style={{
            opacity: isManualEntryMode ? 1 : 0,
            pointerEvents: isManualEntryMode ? "auto" : "none",
            transition: "opacity 180ms ease",
          }}
        >
          <Button size="xs" variant="outline" color="dark" onClick={onBack} styles={outlineBtnStyles}>
            Back
          </Button>
          <Button
            size="xs"
            radius="md"
            onClick={onSubmit}
            disabled={!hasManualRows || isLoading}
            styles={submitBtnStyles}
          >
            Submit
          </Button>
          <ReviewFilterBar
            items={filterItems}
            selected={manualEntry.selectedFilter}
            onSelect={manualEntry.setSelectedFilter}
            isLoading={manualEntry.isCalculatingValidation}
          />
        </Group>
        {!isManualEntryMode && (
          <Text size="xs" c="dimmed" fw={500} style={{ letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
            Step 1 of 4
          </Text>
        )}
      </Group>

      <Divider mb="sm" />

      {/* ─── Unified table area ─── */}
      <Box
        style={{
          position: "relative",
          minHeight: 500,
          borderRadius: 8,
          border: "1px solid var(--mantine-color-gray-2)",
          background: "white",
          overflow: "hidden",
        }}
      >
        {/* Scrollable grid (always rendered with same layout) */}
        <Box
          ref={setTableContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            overflowX: isManualEntryMode ? "auto" : "hidden",
            overflowY: isManualEntryMode ? "auto" : "hidden",
            opacity: isManualEntryMode ? 1 : 0.55,
            filter: isManualEntryMode ? "none" : "blur(0.3px)",
            pointerEvents: isManualEntryMode ? "auto" : "none",
            transition: "opacity 220ms ease, filter 220ms ease",
          }}
        >
          <div style={{ width: gridWidth, fontSize: 12 }}>
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridTemplate,
                background: "var(--mantine-color-gray-0)",
                borderBottom: "1px solid var(--mantine-color-gray-2)",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}
            >
              {fields.map((field) => (
                <div
                  key={field.key}
                  title={field.label + (field.required ? " (required)" : "")}
                  style={{
                    padding: "10px 12px",
                    fontWeight: 600,
                    fontSize: 11.5,
                    color: "var(--mantine-color-gray-7)",
                    borderRight: "1px solid var(--mantine-color-gray-2)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {field.label}
                  {field.required && (
                    <span style={{ marginLeft: 4, color: "var(--mantine-color-red-6)" }}>*</span>
                  )}
                </div>
              ))}
            </div>

            {/* Body rows */}
            {bodyRows.map((row) => {
              const isDataRow = row.type === "data";
              const rowIndex = row.originalIndex;
              const errorKey = `manual-${rowIndex}`;
              return (
                <div
                  key={`row-${row.type}-${rowIndex}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridTemplate,
                    borderBottom: "1px solid var(--mantine-color-gray-2)",
                  }}
                >
                  {fields.map((field) => {
                    if (!isManualEntryMode) {
                      return (
                        <div
                          key={field.key}
                          style={{
                            height: ROW_HEIGHT,
                            borderRight: "1px solid var(--mantine-color-gray-2)",
                          }}
                        />
                      );
                    }
                    const cellKey = `${errorKey}-${field.key}`;
                    const errorMessage = isDataRow
                      ? manualEntry.manualEntryErrors[errorKey]?.[field.key]
                      : undefined;
                    const hasError = !!errorMessage;
                    const isFocused = focusedCell === cellKey && !hasError;
                    const isEnum = field.type === "enum" && field.enum && field.enum.length > 0;
                    const cellValue = isDataRow
                      ? String(manualEntry.manualEntryData[errorKey]?.[field.key] ?? "")
                      : "";
                    return (
                      <div
                        key={field.key}
                        style={{
                          position: "relative",
                          borderRight: "1px solid var(--mantine-color-gray-2)",
                          background: hasError
                            ? "var(--mantine-color-red-0)"
                            : isFocused
                            ? "var(--mantine-color-gray-0)"
                            : "white",
                          minHeight: ROW_HEIGHT,
                        }}
                      >
                        {hasError && (
                          <Tooltip
                            label={errorMessage}
                            position="top"
                            withArrow
                            color="red"
                            multiline
                            w={240}
                            zIndex={10000}
                          >
                            <span
                              style={{
                                position: "absolute",
                                right: isEnum || field.type === "date" ? 22 : 6,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--mantine-color-red-6)",
                                display: "inline-flex",
                                pointerEvents: "auto",
                                zIndex: 2,
                                cursor: "help",
                              }}
                              tabIndex={0}
                              aria-label={`Error: ${errorMessage}`}
                            >
                              <IconAlertCircle size={13} />
                            </span>
                          </Tooltip>
                        )}
                        {isEnum ? (
                          <>
                            <select
                              aria-label={`${field.label} row ${rowIndex + 1}`}
                              aria-invalid={hasError || undefined}
                              value={cellValue}
                              onChange={(e) =>
                                manualEntry.handleManualEntryChange(rowIndex, field.key, e.target.value)
                              }
                              onFocus={() => handleFocus(cellKey)}
                              onBlur={handleBlur}
                              title={
                                (isDataRow && manualEntry.manualEntryErrors[errorKey]?.[field.key]) ||
                                undefined
                              }
                              style={{
                                width: "100%",
                                height: ROW_HEIGHT,
                                border: "none",
                                outline: isFocused ? "1.5px solid var(--mantine-color-dark-6)" : "none",
                                outlineOffset: -1,
                                padding: "0 24px 0 10px",
                                fontSize: 12,
                                color: hasError
                                  ? "var(--mantine-color-red-7)"
                                  : cellValue
                                  ? "var(--mantine-color-gray-8)"
                                  : "var(--mantine-color-gray-5)",
                                background: "transparent",
                                boxSizing: "border-box",
                                appearance: "none",
                                WebkitAppearance: "none",
                                MozAppearance: "none",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              <option value="">—</option>
                              {field.enum!.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                            <span
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                right: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                pointerEvents: "none",
                                color: "var(--mantine-color-gray-5)",
                                fontSize: 9,
                                lineHeight: 1,
                              }}
                            >
                              ▾
                            </span>
                          </>
                        ) : (
                          <input
                            type={
                              field.type === "number"
                                ? "number"
                                : field.type === "date"
                                ? "date"
                                : field.type === "email"
                                ? "email"
                                : "text"
                            }
                            aria-label={`${field.label} row ${rowIndex + 1}`}
                            aria-invalid={hasError || undefined}
                            data-empty={cellValue === "" || undefined}
                            value={cellValue}
                            onChange={(e) =>
                              manualEntry.handleManualEntryChange(rowIndex, field.key, e.target.value)
                            }
                            onFocus={() => handleFocus(cellKey)}
                            onBlur={handleBlur}
                            title={
                              (isDataRow && manualEntry.manualEntryErrors[errorKey]?.[field.key]) ||
                              undefined
                            }
                            style={{
                              width: "100%",
                              height: ROW_HEIGHT,
                              border: "none",
                              outline: isFocused ? "1.5px solid var(--mantine-color-dark-6)" : "none",
                              outlineOffset: -1,
                              padding: hasError ? "6px 24px 6px 10px" : "6px 10px",
                              fontSize: 12,
                              color: hasError
                                ? "var(--mantine-color-red-7)"
                                : "var(--mantine-color-gray-8)",
                              background: "transparent",
                              boxSizing: "border-box",
                              fontFamily: "inherit",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Box>

        {/* Right-edge fade — only shown in empty state to hint clipped columns */}
        <Box
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 96,
            background:
              "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 70%, white 100%)",
            pointerEvents: "none",
            opacity: isManualEntryMode ? 0 : 1,
            transition: "opacity 220ms ease",
          }}
        />

        {/* Drop overlay — fades out when entering manual mode */}
        <Flex
          align="center"
          justify="center"
          role="region"
          aria-label="File drop zone"
          style={{
            position: "absolute",
            inset: 0,
            background: isDragging ? "rgba(255,255,255,0.55)" : "transparent",
            opacity: isManualEntryMode ? 0 : 1,
            pointerEvents: isManualEntryMode ? "none" : "auto",
            transition: "opacity 220ms ease, background 100ms ease",
          }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) void handleFile(files[0]);
          }}
        >
          <Box
            style={{
              background: "white",
              padding: "28px 40px",
              borderRadius: 12,
              border: isDragging
                ? "1.5px dashed var(--mantine-color-dark-6)"
                : "1px solid var(--mantine-color-gray-2)",
              boxShadow: isDragging
                ? "0 12px 36px -12px rgba(0,0,0,0.22)"
                : "0 8px 28px -14px rgba(0,0,0,0.16)",
              textAlign: "center",
              minWidth: 380,
              transform: isManualEntryMode ? "scale(0.96)" : "scale(1)",
              transition: "box-shadow 120ms ease, border-color 120ms ease, transform 220ms ease",
            }}
          >
            <Text size="md" fw={600} c="dark.8" mb={4}>
              Drop your file here
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              .xlsx, .xls or .csv
            </Text>
            <Group gap="xs" justify="center">
              <Button
                size="sm"
                color="dark"
                leftSection={<IconUpload size={14} />}
                loading={isUploading}
                onClick={triggerFilePicker}
              >
                Choose file
              </Button>
              <Button
                size="sm"
                variant="subtle"
                color="gray"
                leftSection={<IconEdit size={14} />}
                onClick={onStartManualEntry}
              >
                Enter manually
              </Button>
            </Group>
          </Box>
        </Flex>
      </Box>
    </Card>
  );
}
