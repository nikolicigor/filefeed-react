"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Card,
  Text,
  Group,
  Button,
  Divider,
  Table,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ReviewFilterBar } from "./ReviewFilterBar";
import type { WorkbookStore } from "../stores/workbookStore";
import type { SheetConfig, FieldConfig, DataRow } from "../types";
import { LAYOUT, PROCESSING } from "../constants";
import { headerCellBase, outlineBtnStyles } from "./sharedStyles";

// ── Static styles ────────────────────────────────────────────────────

const headerCellStyle: React.CSSProperties = {
  ...headerCellBase,
  color: "var(--ff-text, var(--mantine-color-gray-8))",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const actionsHeaderStyle: React.CSSProperties = {
  ...headerCellStyle,
  borderRight: undefined,
  width: LAYOUT.ACTIONS_COLUMN_WIDTH,
};

const deleteInvalidBtnStyles = {
  root: {
    backgroundColor: "var(--ff-bg-surface, white)",
    borderColor: "var(--mantine-color-red-6)",
    color: "var(--mantine-color-red-6)",
    "&:hover": { backgroundColor: "var(--mantine-color-red-0)" },
    "&:disabled": {
      borderColor: "var(--mantine-color-gray-4)",
      color: "var(--mantine-color-gray-6)",
    },
  },
} as const;

const spacerCellStyle: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
};

// ── Memoized Row ─────────────────────────────────────────────────────

interface ReviewRowProps {
  pRow: DataRow;
  mappedFields: string[];
  fieldMap: Map<string, FieldConfig>;
  rowHeight: number;
  updateRowData: (rowId: string, fieldKey: string, value: unknown) => void;
  deleteRow: (rowId: string) => void;
  setEditingRowId: React.Dispatch<React.SetStateAction<string | null>>;
  unpinTimerRef: React.MutableRefObject<number | null>;
}

const ReviewRow = React.memo(function ReviewRow({
  pRow,
  mappedFields,
  fieldMap,
  rowHeight,
  updateRowData,
  deleteRow,
  setEditingRowId,
  unpinTimerRef,
}: ReviewRowProps) {
  return (
    <Table.Tr>
      {mappedFields.map((targetField) => {
        const field = fieldMap.get(targetField);
        const value = (pRow.data || {})[targetField] ?? "";
        const fieldHasError = (pRow.errors || []).some(
          (e) => e.field === targetField
        );
        const firstError = (pRow.errors || []).find(
          (e) => e.field === targetField
        );
        return (
          <Table.Td
            key={`${pRow.id}-${targetField}`}
            style={{
              borderBottom: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
              borderRight: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
              padding: 0,
              backgroundColor: fieldHasError
                ? "var(--mantine-color-red-0)"
                : "var(--ff-bg-surface, white)",
            }}
          >
            <input
              type={field?.type === "number" ? "number" : "text"}
              value={String(value)}
              aria-label={`${field?.label ?? targetField} for row ${pRow.id}`}
              aria-invalid={fieldHasError || undefined}
              onChange={(e) =>
                updateRowData(pRow.id, targetField, e.target.value)
              }
              onFocus={() => {
                if (unpinTimerRef.current) {
                  window.clearTimeout(unpinTimerRef.current);
                  unpinTimerRef.current = null;
                }
                setEditingRowId(pRow.id);
              }}
              onBlur={() => {
                if (unpinTimerRef.current)
                  window.clearTimeout(unpinTimerRef.current);
                unpinTimerRef.current = window.setTimeout(() => {
                  setEditingRowId((curr) =>
                    curr === pRow.id ? null : curr
                  );
                  unpinTimerRef.current = null;
                }, PROCESSING.UNPIN_DELAY_MS);
              }}
              title={firstError?.message}
              style={{
                width: "100%",
                height: `${rowHeight - 2}px`,
                border: fieldHasError
                  ? "1px solid var(--mantine-color-red-5)"
                  : "1px solid transparent",
                outline: "none",
                padding: "6px 10px",
                fontSize: "12px",
                backgroundColor: "transparent",
                color: "var(--ff-text, var(--mantine-color-gray-8))",
                boxSizing: "border-box",
              }}
            />
          </Table.Td>
        );
      })}

      {/* Actions column */}
      <Table.Td
        style={{
          borderBottom: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
          padding: 0,
          backgroundColor: "var(--ff-bg-surface, white)",
          textAlign: "center",
          width: LAYOUT.ACTIONS_COLUMN_WIDTH,
        }}
      >
        <Button
          size="compact-xs"
          variant="subtle"
          color="red"
          aria-label={`Delete row ${pRow.id}`}
          onClick={() => deleteRow(pRow.id)}
          leftSection={<IconTrash size={14} />}
          styles={{
            root: {
              height: `${rowHeight - 6}px`,
              paddingLeft: 8,
              paddingRight: 8,
            },
          }}
        >
          Delete
        </Button>
      </Table.Td>
    </Table.Tr>
  );
});

// ── Props ────────────────────────────────────────────────────────────

export interface ReviewStepProps {
  store: StoreApi<WorkbookStore>;
  sheetConfig: SheetConfig;
  onSubmit: () => void;
  onBack: () => void;
  isChunkingPlanned: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function ReviewStep({
  store,
  sheetConfig,
  onSubmit,
  onBack,
  isChunkingPlanned,
}: ReviewStepProps) {
  // Store subscriptions
  const processedData = useStore(store, (s) => s.processedData);
  const mappingState = useStore(store, (s) => s.mappingState);
  const isLoading = useStore(store, (s) => s.isLoading);
  const updateRowData = useStore(store, (s) => s.updateRowData);
  const deleteRow = useStore(store, (s) => s.deleteRow);
  const deleteInvalidRows = useStore(store, (s) => s.deleteInvalidRows);

  // Local state
  const [reviewFilter, setReviewFilter] = useState<"all" | "valid" | "invalid">("all");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [reviewScrollTop, setReviewScrollTop] = useState(0);
  const [reviewViewportHeight, setReviewViewportHeight] = useState<number>(LAYOUT.REVIEW_VIEWPORT_HEIGHT);
  const reviewViewportRef = useRef<HTMLDivElement | null>(null);
  const unpinTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // O(1) field lookup instead of .find() per cell
  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldConfig>();
    for (const f of sheetConfig.fields) map.set(f.key, f);
    return map;
  }, [sheetConfig.fields]);

  // Single-pass partition: derive counts and filtered subsets together
  const { validSubset, invalidSubset, validCount, invalidCount } = useMemo(() => {
    const valid: typeof processedData = [];
    const invalid: typeof processedData = [];
    for (let i = 0; i < processedData.length; i++) {
      if (processedData[i].isValid) valid.push(processedData[i]);
      else invalid.push(processedData[i]);
    }
    return { validSubset: valid, invalidSubset: invalid, validCount: valid.length, invalidCount: invalid.length };
  }, [processedData]);

  const allCount = processedData.length;
  const showCountLoader = isLoading && isChunkingPlanned;

  const filterItems = useMemo(() => [
    { label: "All" as const, value: "all" as const, count: allCount },
    { label: "Valid" as const, value: "valid" as const, count: validCount },
    { label: "Invalid" as const, value: "invalid" as const, count: invalidCount },
  ], [allCount, validCount, invalidCount]);

  // Which target fields are mapped (preserves header order)
  const mappedFields = useMemo(
    () =>
      Object.entries(mappingState)
        .filter(([, tgt]) => tgt)
        .map(([, tgt]) => String(tgt)),
    [mappingState]
  );

  const visibleRows = useMemo(() => {
    let rows = processedData;
    if (reviewFilter === "valid") rows = validSubset;
    else if (reviewFilter === "invalid") rows = invalidSubset;
    if (reviewFilter === "invalid" && editingRowId) {
      const editing = processedData.find((r) => r.id === editingRowId);
      if (editing && !rows.some((r) => r.id === editing.id)) {
        rows = [editing, ...rows];
      }
    }
    return rows;
  }, [processedData, validSubset, invalidSubset, reviewFilter, editingRowId]);

  // ── Virtualization ────────────────────────────────────────────────
  const ROW_H = LAYOUT.REVIEW_ROW_HEIGHT;

  useEffect(() => {
    const el = reviewViewportRef.current;
    if (!el) return;
    const measure = () =>
      setReviewViewportHeight(el.clientHeight || LAYOUT.REVIEW_VIEWPORT_HEIGHT);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const unpinRef = unpinTimerRef;
    const animRef = rafRef;
    return () => {
      if (unpinRef.current) window.clearTimeout(unpinRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setReviewScrollTop(scrollTop);
    });
  }, []);

  const visibleCount = Math.ceil(reviewViewportHeight / ROW_H) + LAYOUT.REVIEW_OVERSCAN;
  const startIdx = Math.max(
    0,
    Math.floor(reviewScrollTop / ROW_H) - LAYOUT.REVIEW_OVERSCAN_HALF
  );
  const endIdx = Math.min(visibleRows.length, startIdx + visibleCount);
  const paddingTop = startIdx * ROW_H;
  const paddingBottom = Math.max(0, (visibleRows.length - endIdx) * ROW_H);

  // ── Callbacks ─────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    setEditingRowId(null);
    onBack();
  }, [onBack]);

  const submitBtnStyle = useMemo(
    () => ({
      root: {
        backgroundColor: isLoading ? "var(--mantine-color-gray-4)" : "black",
        color: "white",
        border: "none",
        opacity: isLoading ? 0.7 : 1,
        "&:hover": { backgroundColor: "#333" },
        "&:disabled": {
          backgroundColor: "var(--mantine-color-gray-4)",
          color: "var(--mantine-color-gray-6)",
          border: "none",
          cursor: "not-allowed",
          boxShadow: "none",
          textDecoration: "none",
        },
      },
    }),
    [isLoading]
  );

  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      {/* ─── Header bar ─── */}
      <Group justify="space-between" align="center">
        <Text size="sm" c="gray.8" fw={500}>
          Review Mapped Data
        </Text>
        <Group gap="md">
          <Button
            size="xs"
            variant="outline"
            color="red"
            onClick={() => deleteInvalidRows()}
            disabled={invalidCount === 0}
            styles={deleteInvalidBtnStyles}
          >
            Delete all invalid
          </Button>
          <Button variant="outline" size="xs" onClick={handleBack} styles={outlineBtnStyles}>
            Back to Mapping
          </Button>
          <Button
            size="xs"
            radius="md"
            onClick={onSubmit}
            disabled={isLoading}
            styles={submitBtnStyle}
          >
            Submit {sheetConfig.name} Data
          </Button>
          <ReviewFilterBar
            items={filterItems}
            selected={reviewFilter}
            onSelect={setReviewFilter}
            isLoading={showCountLoader}
          />
        </Group>
      </Group>

      <Divider my="md" />

      {/* ─── Scrollable virtualized table ─── */}
      <div
        ref={reviewViewportRef}
        onScroll={handleScroll}
        style={{ height: LAYOUT.REVIEW_VIEWPORT_HEIGHT, overflowY: "auto" }}
      >
        <Table
          striped={false}
          highlightOnHover
          withTableBorder
          withColumnBorders
          style={{
            backgroundColor: "var(--ff-bg-surface, white)",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            width: "100%",
          }}
        >
          <Table.Thead>
            <Table.Tr style={{ backgroundColor: "var(--ff-header-bg, var(--mantine-color-gray-0))" }}>
              {mappedFields.map((targetField) => {
                const field = fieldMap.get(targetField);
                return (
                  <Table.Th key={targetField} style={headerCellStyle}>
                    {String(field?.label ?? targetField)}
                  </Table.Th>
                );
              })}
              <Table.Th style={actionsHeaderStyle}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {/* Top spacer */}
            {paddingTop > 0 && (
              <Table.Tr>
                <Table.Td
                  colSpan={Math.max(1, mappedFields.length) + 1}
                  style={{ ...spacerCellStyle, height: paddingTop }}
                />
              </Table.Tr>
            )}

            {/* Visible rows */}
            {visibleRows.slice(startIdx, endIdx).map((pRow) => (
              <ReviewRow
                key={pRow.id}
                pRow={pRow}
                mappedFields={mappedFields}
                fieldMap={fieldMap}
                rowHeight={ROW_H}
                updateRowData={updateRowData}
                deleteRow={deleteRow}
                setEditingRowId={setEditingRowId}
                unpinTimerRef={unpinTimerRef}
              />
            ))}

            {/* Bottom spacer */}
            {paddingBottom > 0 && (
              <Table.Tr>
                <Table.Td
                  colSpan={Math.max(1, mappedFields.length) + 1}
                  style={{ ...spacerCellStyle, height: paddingBottom }}
                />
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>
    </Card>
  );
}
