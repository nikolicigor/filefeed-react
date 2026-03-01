"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Card,
  Text,
  Group,
  Button,
  Stack,
  Divider,
  Box,
  Flex,
  Table,
  Title,
} from "@mantine/core";
import { IconUpload, IconEdit } from "@tabler/icons-react";
import { ReviewFilterBar } from "./ReviewFilterBar";
import type { SheetConfig } from "../types";
import type { UseManualEntryReturn } from "../hooks/useManualEntry";
import { LAYOUT } from "../constants";
import { headerCellBase, inputBase, emptyCellStyle, submitBtnStyles, outlineBtnStyles } from "./sharedStyles";

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
  const fieldWidth = `${100 / fields.length}%`;

  const filterItems = useMemo(() => [
    { label: "All" as const, value: "all" as const, count: manualEntry.totalRows },
    { label: "Valid" as const, value: "valid" as const, count: manualEntry.validRows },
    { label: "Invalid" as const, value: "invalid" as const, count: manualEntry.invalidRows },
  ], [manualEntry.totalRows, manualEntry.validRows, manualEntry.invalidRows]);

  const handleFocus = useCallback((cellKey: string) => {
    setFocusedCell(cellKey);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedCell(null);
  }, []);

  const tableRows = useMemo(() => {
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

  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      {/* ─── Header bar ─── */}
      <Group justify="space-between" align="center">
        <Text size="sm" c="gray.8" fw={500}>
          {sheetConfig.name || "Data Sheet"}
        </Text>
        <Group gap="md">
          {isManualEntryMode && (
            <Button
              size="xs"
              variant="outline"
              color="dark"
              onClick={onBack}
              styles={outlineBtnStyles}
            >
              Back
            </Button>
          )}
          {isManualEntryMode && (
            <Button
              size="xs"
              radius="md"
              onClick={onSubmit}
              disabled={!hasManualRows || isLoading}
              styles={submitBtnStyles}
            >
              Submit {sheetConfig.name} Data
            </Button>
          )}
          <ReviewFilterBar
            items={filterItems}
            selected={manualEntry.selectedFilter}
            onSelect={manualEntry.setSelectedFilter}
            isLoading={manualEntry.isCalculatingValidation}
          />
        </Group>
      </Group>

      <Divider my="md" />

      {/* ─── Content area (table + overlay) ─── */}
      <Box
        style={{
          position: "relative",
          minHeight: `${LAYOUT.MIN_CONTENT_HEIGHT}px`,
          overflow: "hidden",
        }}
      >
        {/* Table layer */}
        <Box style={{ position: "absolute", inset: 0, zIndex: 1, padding: "16px" }}>
          <div
            ref={setTableContainerRef}
            style={{ height: "100%", minHeight: `${LAYOUT.MIN_TABLE_HEIGHT}px`, overflow: "hidden" }}
          >
            <Table
              striped={false}
              highlightOnHover={false}
              withTableBorder
              withColumnBorders
              style={{
                height: "100%",
                opacity: isManualEntryMode ? 1 : 0.98,
                filter: isManualEntryMode ? "none" : "blur(0.5px)",
                pointerEvents: isManualEntryMode ? "auto" : "none",
                backgroundColor: "white",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                width: "100%",
              }}
            >
              <Table.Thead>
                <Table.Tr style={{ backgroundColor: "var(--mantine-color-gray-0)" }}>
                  {fields.map((field) => (
                    <Table.Th
                      key={field.key}
                      style={{
                        ...headerCellBase,
                        color: isManualEntryMode
                          ? "var(--mantine-color-gray-8)"
                          : "var(--mantine-color-gray-5)",
                        width: fieldWidth,
                        maxWidth: fieldWidth,
                      }}
                    >
                      {field.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {tableRows.map((row, displayIndex) => {
                  const isDataRow = row.type === "data";
                  const rowIndex = row.originalIndex;
                  const errorKey = `manual-${rowIndex}`;
                  const isLastRow = displayIndex === tableRows.length - 1;

                  return (
                    <Table.Tr
                      key={isDataRow ? `data-${rowIndex}` : `blank-${rowIndex}`}
                      style={{ backgroundColor: "white" }}
                    >
                      {fields.map((field) => (
                        <Table.Td
                          key={field.key}
                          style={{
                            color: "var(--mantine-color-gray-5)",
                            fontSize: "12px",
                            padding: 0,
                            borderRight: "1px solid var(--mantine-color-gray-3)",
                            borderBottom: isLastRow
                              ? "2px solid var(--mantine-color-gray-3)"
                              : "1px solid var(--mantine-color-gray-3)",
                            backgroundColor: "white",
                            minHeight: `${LAYOUT.MANUAL_ROW_HEIGHT}px`,
                            width: fieldWidth,
                            minWidth: `${LAYOUT.MIN_COLUMN_WIDTH}px`,
                            maxWidth: fieldWidth,
                            overflow: "hidden",
                          }}
                        >
                          {isManualEntryMode ? (
                            (() => {
                              const cellKey = `${errorKey}-${field.key}`;
                              const hasError = !!(isDataRow && manualEntry.manualEntryErrors[errorKey]?.[field.key]);
                              const isFocused = focusedCell === cellKey && !hasError;
                              return (
                                <input
                                  type={field.type === "number" ? "number" : "text"}
                                  aria-label={`${field.label} row ${rowIndex + 1}`}
                                  aria-invalid={hasError || undefined}
                                  value={
                                    isDataRow
                                      ? String(manualEntry.manualEntryData[errorKey]?.[field.key] ?? "")
                                      : ""
                                  }
                                  onChange={(e) =>
                                    manualEntry.handleManualEntryChange(
                                      rowIndex,
                                      field.key,
                                      e.target.value
                                    )
                                  }
                                  style={{
                                    ...inputBase,
                                    border: hasError
                                      ? "1px solid var(--mantine-color-red-5)"
                                      : isFocused
                                        ? "1px solid black"
                                        : "1px solid transparent",
                                    borderRadius: isFocused ? "2px" : "0px",
                                    backgroundColor: hasError
                                      ? "var(--mantine-color-red-0)"
                                      : "transparent",
                                  }}
                                  onFocus={() => handleFocus(cellKey)}
                                  onBlur={handleBlur}
                                  title={
                                    (isDataRow &&
                                      manualEntry.manualEntryErrors[errorKey]?.[field.key]) ||
                                    undefined
                                  }
                                />
                              );
                            })()
                          ) : (
                            <div style={emptyCellStyle} />
                          )}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
        </Box>

        {/* Drag-and-drop overlay */}
        {!isManualEntryMode && (
          <Flex
            align="center"
            justify="center"
            direction="column"
            role="region"
            aria-label="File drop zone — drag a file here or use the upload button"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              backgroundColor: isDragging
                ? "var(--mantine-color-gray-0)"
                : "rgba(255, 255, 255, 0.02)",
              backdropFilter: "none",
              border: isDragging
                ? "2px dashed var(--mantine-color-gray-6)"
                : "2px dashed var(--mantine-color-gray-3)",
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
            <Stack align="center" gap="sm">
              <div style={{ textAlign: "center" }}>
                <Title order={2} size="sm" fw={600} c="gray.8">
                  Drag and drop or upload a file to get started
                </Title>
              </div>
              <Stack gap="md" align="center">
                <Button
                  size="xs"
                  variant="outline"
                  color="dark"
                  leftSection={<IconUpload size={15} />}
                  loading={isUploading}
                  onClick={triggerFilePicker}
                  styles={outlineBtnStyles}
                >
                  Upload file
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="dark"
                  leftSection={<IconEdit size={15} />}
                  onClick={onStartManualEntry}
                  styles={outlineBtnStyles}
                >
                  Manually enter data
                </Button>
              </Stack>
            </Stack>
          </Flex>
        )}
      </Box>
    </Card>
  );
}
