"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Card,
  Text,
  Group,
  Button,
  Divider,
  Table,
  Popover,
  Stack,
  Select,
  Checkbox,
  Badge,
  Box,
  ScrollArea,
  Loader,
} from "@mantine/core";
import { IconTrash, IconSparkles, IconAlertTriangle, IconChevronDown } from "@tabler/icons-react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { ReviewFilterBar } from "./ReviewFilterBar";
import type { WorkbookStore } from "../stores/workbookStore";
import type { SheetConfig, FieldConfig, DataRow } from "../types";
import { LAYOUT, PROCESSING, Z_INDEX } from "../constants";
import { headerCellBase, outlineBtnStyles } from "./sharedStyles";
import {
  extractInvalidEnumValuesFromProcessed,
  suggestValueMapping,
  type UniqueValueBucket,
  type ValueMappingSuggestion,
} from "../utils/valueMapping";

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

// Select must render its dropdown inside the popover's own DOM tree —
// otherwise Mantine Popover's closeOnClickOutside fires when the user clicks
// an option (which is rendered in a separate portal), dismissing the popover
// before Select's onChange can register the new value.
const popoverComboboxProps = { withinPortal: false } as const;

// ── Enum cell popover ────────────────────────────────────────────────

interface EnumCellPopoverProps {
  field: FieldConfig;
  rawValue: string;
  occurrences: number;
  suggestion: ValueMappingSuggestion | null;
  onApply: (target: string, applyToAll: boolean) => void;
}

function EnumCellPopover({ field, rawValue, occurrences, suggestion, onApply }: EnumCellPopoverProps) {
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<string | null>(suggestion?.target ?? null);
  const [applyToAll, setApplyToAll] = useState(occurrences > 1);

  useEffect(() => {
    if (opened) {
      setSelected(suggestion?.target ?? null);
      setApplyToAll(occurrences > 1);
    }
  }, [opened, suggestion?.target, occurrences]);

  const enumOptions = useMemo(
    () => (field.enum || []).map((e) => ({ value: e, label: e })),
    [field.enum]
  );

  const handleApply = () => {
    if (!selected) return;
    onApply(selected, applyToAll);
    setOpened(false);
  };

  const confidencePct = suggestion?.confidence ? Math.round(suggestion.confidence * 100) : 0;
  const confidenceTone =
    confidencePct >= 90 ? "teal" : confidencePct >= 75 ? "yellow" : confidencePct > 0 ? "orange" : "red";

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withArrow
      shadow="md"
      width={320}
      withinPortal
      zIndex={Z_INDEX.SELECT_COMBOBOX}
    >
      <Popover.Target>
        <button
          type="button"
          onClick={() => setOpened((o) => !o)}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            border: "none",
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--mantine-color-red-7)",
            fontWeight: 500,
          }}
          title={`${rawValue} — not in target enum (${field.enum?.join(", ")})`}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <IconAlertTriangle size={12} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rawValue}</span>
          </span>
          <IconChevronDown size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
        </button>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="sm">
          <Box>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.06em" }}>
              {field.label}
            </Text>
            <Group gap={6} mt={4} wrap="nowrap">
              <Text size="sm" fw={600} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rawValue}
              </Text>
              {suggestion?.target && (
                <Badge size="xs" color={confidenceTone} variant="light">
                  {confidencePct}% suggested
                </Badge>
              )}
            </Group>
          </Box>

          <Select
            label="Map to"
            value={selected}
            onChange={setSelected}
            data={enumOptions}
            placeholder="Select target"
            comboboxProps={popoverComboboxProps}
            size="sm"
            allowDeselect={false}
          />

          {occurrences > 1 && (
            <Checkbox
              label={`Apply to all ${occurrences} '${rawValue}' rows`}
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.currentTarget.checked)}
              size="sm"
            />
          )}

          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button size="xs" color="dark" onClick={handleApply} disabled={!selected}>
              Apply
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// ── Memoized Row ─────────────────────────────────────────────────────

interface ReviewRowProps {
  pRow: DataRow;
  mappedFields: string[];
  fieldMap: Map<string, FieldConfig>;
  rowHeight: number;
  invalidEnumValueCounts: Map<string, Map<string, number>>;
  updateRowData: (rowId: string, fieldKey: string, value: unknown) => void;
  bulkApplyValueMappings: (m: Record<string, Record<string, string>>) => void;
  deleteRow: (rowId: string) => void;
  setEditingRowId: React.Dispatch<React.SetStateAction<string | null>>;
  unpinTimerRef: React.MutableRefObject<number | null>;
  resolveSuggestion: (
    fieldKey: string,
    source: string,
    enumValues: string[]
  ) => ValueMappingSuggestion;
}

const ReviewRow = React.memo(function ReviewRow({
  pRow,
  mappedFields,
  fieldMap,
  rowHeight,
  invalidEnumValueCounts,
  updateRowData,
  bulkApplyValueMappings,
  deleteRow,
  setEditingRowId,
  unpinTimerRef,
  resolveSuggestion,
}: ReviewRowProps) {
  return (
    <Table.Tr>
      {mappedFields.map((targetField) => {
        const field = fieldMap.get(targetField);
        const value = (pRow.data || {})[targetField] ?? "";
        const fieldHasError = (pRow.errors || []).some((e) => e.field === targetField);
        const firstError = (pRow.errors || []).find((e) => e.field === targetField);
        const isEnum = field?.type === "enum" && field.enum?.length;
        const valueStr = String(value);
        const enumLower = isEnum ? new Set(field!.enum!.map((e) => e.toLowerCase())) : null;
        const isInvalidEnum =
          isEnum && valueStr.trim() !== "" && !enumLower!.has(valueStr.trim().toLowerCase());

        return (
          <Table.Td
            key={`${pRow.id}-${targetField}`}
            style={{
              borderBottom: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
              borderRight: "1px solid var(--ff-border, var(--mantine-color-gray-3))",
              padding: 0,
              backgroundColor: isInvalidEnum
                ? "var(--mantine-color-orange-0)"
                : fieldHasError
                ? "var(--mantine-color-red-0)"
                : "var(--ff-bg-surface, white)",
              height: rowHeight,
            }}
          >
            {isInvalidEnum ? (
              <EnumCellPopover
                field={field!}
                rawValue={valueStr}
                occurrences={invalidEnumValueCounts.get(targetField)?.get(valueStr) ?? 1}
                suggestion={resolveSuggestion(targetField, valueStr, field!.enum!)}
                onApply={(target, applyToAll) => {
                  if (applyToAll) {
                    bulkApplyValueMappings({ [targetField]: { [valueStr]: target } });
                  } else {
                    updateRowData(pRow.id, targetField, target);
                  }
                }}
              />
            ) : (
              <input
                type={field?.type === "number" ? "number" : "text"}
                value={valueStr}
                aria-label={`${field?.label ?? targetField} for row ${pRow.id}`}
                aria-invalid={fieldHasError || undefined}
                onChange={(e) => updateRowData(pRow.id, targetField, e.target.value)}
                onFocus={() => {
                  if (unpinTimerRef.current) {
                    window.clearTimeout(unpinTimerRef.current);
                    unpinTimerRef.current = null;
                  }
                  setEditingRowId(pRow.id);
                }}
                onBlur={() => {
                  if (unpinTimerRef.current) window.clearTimeout(unpinTimerRef.current);
                  unpinTimerRef.current = window.setTimeout(() => {
                    setEditingRowId((curr) => (curr === pRow.id ? null : curr));
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
            )}
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

// ── Top action bar (value mapping summary) ───────────────────────────

interface ValueMappingBarProps {
  buckets: UniqueValueBucket[];
  onApplyAll: () => void;
  highConfidenceCount: number;
  aiLoading: boolean;
  aiActive: boolean;
}

function ValueMappingBar({
  buckets,
  onApplyAll,
  highConfidenceCount,
  aiLoading,
  aiActive,
}: ValueMappingBarProps) {
  const totalUnmapped = buckets.reduce((acc, b) => acc + b.values.length, 0);
  if (totalUnmapped === 0) return null;
  return (
    <Box
      mb="md"
      p="sm"
      style={{
        background: "var(--mantine-color-orange-0)",
        border: "1px solid var(--mantine-color-orange-2)",
        borderRadius: 8,
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconAlertTriangle size={16} color="var(--mantine-color-orange-7)" />
          <Text size="sm" fw={500} c="orange.9">
            {totalUnmapped} unmapped value{totalUnmapped === 1 ? "" : "s"} across {buckets.length} column
            {buckets.length === 1 ? "" : "s"}
          </Text>
          {aiLoading ? (
            <Group gap={6} wrap="nowrap">
              <Loader size={12} color="orange" />
              <Text size="xs" c="orange.8" fw={500}>
                AI analyzing…
              </Text>
            </Group>
          ) : aiActive ? (
            <Badge size="xs" color="grape" variant="light" leftSection={<IconSparkles size={10} />}>
              AI suggestions ready
            </Badge>
          ) : (
            <Text size="xs" c="dimmed">
              Click any highlighted cell to fix individually, or apply suggestions in bulk.
            </Text>
          )}
        </Group>
        <Button
          size="xs"
          color="dark"
          leftSection={<IconSparkles size={14} />}
          onClick={onApplyAll}
          disabled={highConfidenceCount === 0 || aiLoading}
        >
          Apply {highConfidenceCount} suggestion{highConfidenceCount === 1 ? "" : "s"}
        </Button>
      </Group>
    </Box>
  );
}

// ── AI suggestion fetcher ─────────────────────────────────────────────

interface AiMappingResult {
  source: string;
  target: string | null;
  confidence: number;
  reason?: string;
}

async function fetchAiSuggestions(
  endpoint: string,
  buckets: UniqueValueBucket[]
): Promise<Map<string, Map<string, AiMappingResult>>> {
  const out = new Map<string, Map<string, AiMappingResult>>();
  if (buckets.length === 0) return out;
  try {
    const payload = {
      buckets: buckets.map((b) => ({
        fieldKey: b.fieldKey,
        fieldLabel: b.fieldLabel,
        sourceValues: b.values.map((v) => v.value),
        targetEnum: b.enumValues,
      })),
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { results?: Array<{ fieldKey: string; mappings?: AiMappingResult[] }> };
    for (const r of data.results ?? []) {
      const inner = new Map<string, AiMappingResult>();
      for (const m of r.mappings ?? []) {
        if (typeof m.source === "string") {
          inner.set(m.source, m);
        }
      }
      if (inner.size > 0) out.set(r.fieldKey, inner);
    }
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[ReviewStep] AI suggestion fetch failed; falling back to local synonyms.", err);
    }
  }
  return out;
}

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
  const bulkApplyValueMappings = useStore(store, (s) => s.bulkApplyValueMappings);
  const aiSuggestEndpoint = useStore(store, (s) => s.config.aiSuggestEndpoint);

  // AI suggestion overlay (fetched once per unique bucket signature)
  const [aiSuggestions, setAiSuggestions] = useState<Map<string, Map<string, AiMappingResult>>>(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const aiFetchedKeyRef = useRef<string | null>(null);
  const aiInflightSigRef = useRef<string | null>(null);

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

  // Single-pass partition
  const { validSubset, invalidSubset, validCount, invalidCount } = useMemo(() => {
    const valid: typeof processedData = [];
    const invalid: typeof processedData = [];
    for (let i = 0; i < processedData.length; i++) {
      if (processedData[i].isValid) valid.push(processedData[i]);
      else invalid.push(processedData[i]);
    }
    return {
      validSubset: valid,
      invalidSubset: invalid,
      validCount: valid.length,
      invalidCount: invalid.length,
    };
  }, [processedData]);

  const allCount = processedData.length;
  const showCountLoader = isLoading && isChunkingPlanned;

  const filterItems = useMemo(
    () => [
      { label: "All" as const, value: "all" as const, count: allCount },
      { label: "Valid" as const, value: "valid" as const, count: validCount },
      { label: "Invalid" as const, value: "invalid" as const, count: invalidCount },
    ],
    [allCount, validCount, invalidCount]
  );

  const mappedFields = useMemo(
    () =>
      Object.entries(mappingState)
        .filter(([, tgt]) => tgt)
        .map(([, tgt]) => String(tgt)),
    [mappingState]
  );

  // Compute invalid enum buckets from the *current* processed data so it
  // updates live as the user fixes values inline.
  const enumBuckets = useMemo(
    () => extractInvalidEnumValuesFromProcessed(processedData, sheetConfig.fields),
    [processedData, sheetConfig.fields]
  );

  // O(1) lookup: per target-field, count of each invalid raw value. Drives the
  // popover's "Apply to all N rows" affordance without a second pass.
  const invalidEnumValueCounts = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const b of enumBuckets) {
      const inner = new Map<string, number>();
      for (const v of b.values) inner.set(v.value, v.count);
      map.set(b.fieldKey, inner);
    }
    return map;
  }, [enumBuckets]);

  // Resolve a suggestion for a (field, source) pair: prefer AI when present,
  // fall back to the deterministic local synonym/fuzzy strategy.
  const resolveSuggestion = useCallback(
    (fieldKey: string, source: string, enumValues: string[]) => {
      const ai = aiSuggestions.get(fieldKey)?.get(source);
      if (ai && ai.target) {
        return {
          source,
          target: ai.target,
          confidence: ai.confidence,
          reason: "ai" as const,
        };
      }
      const local = suggestValueMapping(source, enumValues);
      return { ...local, reason: local.reason };
    },
    [aiSuggestions]
  );

  // Pre-compute high-confidence suggestions for the bulk-apply button.
  const highConfidenceMappings = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    let total = 0;
    for (const b of enumBuckets) {
      for (const v of b.values) {
        const sug = resolveSuggestion(b.fieldKey, v.value, b.enumValues);
        if (sug.target && sug.confidence >= 0.85) {
          if (!out[b.fieldKey]) out[b.fieldKey] = {};
          out[b.fieldKey][v.value] = sug.target;
          total++;
        }
      }
    }
    return { mappings: out, count: total };
  }, [enumBuckets, resolveSuggestion]);

  // Trigger an AI batch fetch whenever the set of unmatched values changes
  // (e.g. after the initial processing finishes, or after a bulk fix shrinks
  // the bucket list). Uses an in-flight signature ref instead of a per-effect
  // cancelled closure: when chunked processing emits a new processedData ref
  // mid-fetch, enumBuckets recomputes to a new array but the signature is
  // unchanged. A cleanup-cancel here would orphan the in-flight loading flag.
  useEffect(() => {
    if (!aiSuggestEndpoint) return;
    if (enumBuckets.length === 0) return;

    const signature = enumBuckets
      .map((b) => `${b.fieldKey}:${b.values.map((v) => v.value).sort().join("|")}`)
      .sort()
      .join(";;");

    if (signature === aiFetchedKeyRef.current) return;
    aiFetchedKeyRef.current = signature;
    aiInflightSigRef.current = signature;

    setAiLoading(true);
    fetchAiSuggestions(aiSuggestEndpoint, enumBuckets).then((result) => {
      if (aiInflightSigRef.current !== signature) return;
      aiInflightSigRef.current = null;
      setAiSuggestions(result);
      setAiLoading(false);
    });
  }, [aiSuggestEndpoint, enumBuckets]);

  const handleApplyAllSuggestions = useCallback(() => {
    if (highConfidenceMappings.count === 0) return;
    bulkApplyValueMappings(highConfidenceMappings.mappings);
  }, [highConfidenceMappings, bulkApplyValueMappings]);

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
          Review &amp; fix
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
            Back to mapping
          </Button>
          <Button
            size="xs"
            radius="md"
            onClick={onSubmit}
            disabled={isLoading}
            styles={submitBtnStyle}
          >
            Submit
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

      <ValueMappingBar
        buckets={enumBuckets}
        onApplyAll={handleApplyAllSuggestions}
        highConfidenceCount={highConfidenceMappings.count}
        aiLoading={aiLoading}
        aiActive={!aiLoading && aiSuggestions.size > 0}
      />

      {/* ─── Scrollable virtualized table ─── */}
      <div
        ref={reviewViewportRef}
        onScroll={handleScroll}
        style={{ height: LAYOUT.REVIEW_VIEWPORT_HEIGHT, overflow: "auto" }}
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
            width: "max-content",
            minWidth: "100%",
          }}
        >
          <Table.Thead>
            <Table.Tr style={{ backgroundColor: "var(--ff-header-bg, var(--mantine-color-gray-0))" }}>
              {mappedFields.map((targetField) => {
                const field = fieldMap.get(targetField);
                return (
                  <Table.Th
                    key={targetField}
                    style={{ ...headerCellStyle, minWidth: LAYOUT.MIN_COLUMN_WIDTH }}
                  >
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
                invalidEnumValueCounts={invalidEnumValueCounts}
                updateRowData={updateRowData}
                bulkApplyValueMappings={bulkApplyValueMappings}
                deleteRow={deleteRow}
                setEditingRowId={setEditingRowId}
                unpinTimerRef={unpinTimerRef}
                resolveSuggestion={resolveSuggestion}
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
