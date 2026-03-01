import { useCallback, useMemo, useRef, useState } from "react";
import type { FieldConfig, ValidationRegistry } from "../types";
import { validateFieldWithRegistry } from "../utils/dataProcessing";

export type ManualEntryFilter = "all" | "valid" | "invalid";

export interface UseManualEntryReturn {
  manualEntryData: Record<string, Record<string, unknown>>;
  manualEntryErrors: Record<string, Record<string, string>>;
  selectedFilter: ManualEntryFilter;
  setSelectedFilter: (f: ManualEntryFilter) => void;
  isCalculatingValidation: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  isRowVisible: (rowIndex: number) => boolean;
  handleManualEntryChange: (
    rowIndex: number,
    fieldKey: string,
    value: string
  ) => void;
  reset: () => void;
}

export function useManualEntry(
  fields?: FieldConfig[],
  validationRegistry?: ValidationRegistry
): UseManualEntryReturn {
  const [manualEntryData, setManualEntryData] = useState<Record<string, Record<string, unknown>>>({});
  const [manualEntryErrors, setManualEntryErrors] = useState<Record<string, Record<string, string>>>({});
  const [selectedFilter, setSelectedFilter] = useState<ManualEntryFilter>("all");

  const dataRef = useRef(manualEntryData);
  dataRef.current = manualEntryData;

  const validateField = useCallback((fieldKey: string, value: unknown, rowIndex: number, rowData: Record<string, unknown>): string | null => {
    if (!fields || fields.length === 0) return null;
    const field = fields.find((f) => f.key === fieldKey);
    if (!field) return null;

    const errors = validateFieldWithRegistry(value, field, rowIndex, rowData, validationRegistry);
    return errors.length > 0 ? errors[0].message : null;
  }, [fields, validationRegistry]);

  const handleManualEntryChange = useCallback((
    rowIndex: number,
    fieldKey: string,
    value: string
  ) => {
    const rowId = `manual-${rowIndex}`;
    const rowData = { ...(dataRef.current[rowId] || {}), [fieldKey]: value };

    setManualEntryData((prev) => ({ ...prev, [rowId]: rowData }));

    setManualEntryErrors((prevErrors) => {
      const rowHasAnyValue = Object.values(rowData).some(
        (v) => v && v.toString().trim() !== ""
      );
      if (!rowHasAnyValue) {
        const next = { ...prevErrors };
        delete next[rowId];
        return next;
      }
      const fieldError = validateField(fieldKey, value, rowIndex, rowData);
      return {
        ...prevErrors,
        [rowId]: {
          ...(prevErrors[rowId] || {}),
          [fieldKey]: fieldError || "",
        },
      };
    });
  }, [validateField]);

  const { totalRows, validRows, invalidRows } = useMemo(() => {
    let total = 0;
    let valids = 0;
    let invalids = 0;

    Object.keys(manualEntryData).forEach((rowId) => {
      const rowData = manualEntryData[rowId];
      const rowErrors = manualEntryErrors[rowId] || {};

      const hasData = Object.values(rowData).some(
        (v) => v && v.toString().trim() !== ""
      );
      if (!hasData) return;

      total++;
      const hasErrors = Object.values(rowErrors).some((e) => e && e.trim() !== "");
      if (hasErrors) invalids++;
      else valids++;
    });

    return { totalRows: total, validRows: valids, invalidRows: invalids };
  }, [manualEntryData, manualEntryErrors]);

  const isRowVisible = useCallback((rowIndex: number): boolean => {
    if (selectedFilter === "all") return true;

    const rowId = `manual-${rowIndex}`;
    const rowData = manualEntryData[rowId];
    const rowErrors = manualEntryErrors[rowId] || {};

    const hasData =
      rowData && Object.values(rowData).some((v) => v && v.toString().trim() !== "");
    if (!hasData) return false;

    const hasErrors = Object.values(rowErrors).some((e) => e && e.trim() !== "");
    if (selectedFilter === "valid") return !hasErrors;
    if (selectedFilter === "invalid") return hasErrors;
    return true;
  }, [selectedFilter, manualEntryData, manualEntryErrors]);

  const reset = useCallback(() => {
    setManualEntryData({});
    setManualEntryErrors({});
    setSelectedFilter("all");
  }, []);

  return {
    manualEntryData,
    manualEntryErrors,
    selectedFilter,
    setSelectedFilter,
    isCalculatingValidation: false,
    totalRows,
    validRows,
    invalidRows,
    isRowVisible,
    handleManualEntryChange,
    reset,
  };
}
