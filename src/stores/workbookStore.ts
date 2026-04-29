import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import {
  WorkbookState,
  CreateWorkbookConfig,
  ImportedData,
  MappingState,
  DataRow,
  ValidationError,
  FieldMapping,
  FieldConfig,
  SheetConfig,
} from "../types";
import {
  generateAutoMappingAsync as computeAutoMappingAsync,
  processRowBatch,
  applyUniquenessChecks,
  mappingStateToFieldMappings,
  fieldMappingsToMappingState,
  defaultTransforms,
  validateFieldWithRegistry,
  detectAllCapsField,
} from "../utils/dataProcessing";
import { PROCESSING } from "../constants";

interface WorkbookActions {
  setConfig: (config: CreateWorkbookConfig) => void;

  setImportedData: (data: ImportedData) => void;
  clearImportedData: () => void;

  setMapping: (mapping: MappingState) => void;
  setMappingBatch: (mapping: MappingState) => void;
  updateMapping: (sourceColumn: string, targetField: string | null) => void;
  setFieldMappings: (fieldMappings: FieldMapping[]) => void;
  setValueMappings: (valueMappings: Record<string, Record<string, string>>) => void;
  bulkApplyValueMappings: (perFieldMappings: Record<string, Record<string, string>>) => void;

  processDataChunked: () => Promise<void>;
  processOnContinue: () => Promise<void>;
  cancelProcessing: () => void;
  setProcessedRows: (rows: DataRow[]) => void;
  updateRowData: (rowId: string, fieldKey: string, value: unknown) => void;
  deleteRow: (rowId: string) => void;
  deleteInvalidRows: () => void;

  setLoading: (loading: boolean) => void;

  reset: () => void;
}

export type WorkbookStore = WorkbookState & WorkbookActions;

const initialState: WorkbookState = {
  config: {
    name: "",
    sheets: [],
  },
  currentSheet: "",
  importedData: null,
  mappingState: {},
  processedData: [],
  validationErrors: [],
  isLoading: false,
  processingProgress: 0,
  pipelineMappings: undefined,
  transformRegistry: defaultTransforms,
  validationRegistry: undefined,
  valueMappings: {},
};

function getCurrentSheetConfig(state: WorkbookState): SheetConfig | undefined {
  return state.config.sheets.find((s) => s.slug === state.currentSheet);
}

function extractValidationErrors(rows: DataRow[]): ValidationError[] {
  return rows.flatMap((r) => r.errors || []);
}

/**
 * Strip existing uniqueness errors from all rows, then re-run uniqueness
 * checks from scratch. Necessary after any mutation (edit, delete) that
 * could create or resolve duplicate values.
 */
function refreshUniqueness(rows: DataRow[], fields: FieldConfig[]): DataRow[] {
  const uniqueFields = fields.filter((f) => f.unique);
  if (uniqueFields.length === 0) return rows;

  const uniqueKeys = new Set(uniqueFields.map((f) => f.key));

  const cleaned = rows.map((row) => {
    const kept = row.errors.filter(
      (e) => !uniqueKeys.has(e.field) || !e.message.includes("must be unique")
    );
    if (kept.length === row.errors.length) return row;
    return {
      ...row,
      errors: kept,
      isValid: kept.filter((e) => e.severity === "error").length === 0,
    };
  });

  return applyUniquenessChecks(cleaned, fields);
}

export const createWorkbookStore = (): StoreApi<WorkbookStore> => {
  let processingRunId = 0;

  return createStore<WorkbookStore>()((set, get) => ({
    ...initialState,

    setConfig: (config) => {
      if (config.sheets.length === 0) {
        if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
          console.warn("[Filefeed] config.sheets is empty — the SDK requires at least one sheet to function.");
        }
      }
      const first = config.sheets[0];
      set({
        config,
        transformRegistry: config.transformRegistry || defaultTransforms,
        validationRegistry: config.validationRegistry,
        ...(first && {
          currentSheet: first.slug,
          pipelineMappings: first.pipelineMappings,
        }),
      });
    },

    setProcessedRows: (rows) => {
      set({
        processedData: rows,
        validationErrors: extractValidationErrors(rows),
      });
    },

    setImportedData: (data) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig({ ...state, importedData: data });

      if (!sheetConfig) {
        set({ importedData: data });
        return;
      }

      let pm = sheetConfig.pipelineMappings;

      if (pm) {
        const filtered = (pm.fieldMappings || []).filter(
          (m) => data.headers.includes(m.source)
        );
        const seenTargets = new Set<string>();
        const deduped = filtered.filter((m) => {
          if (!m.target) return false;
          if (seenTargets.has(m.target)) return false;
          seenTargets.add(m.target);
          return true;
        });
        pm = { ...pm, fieldMappings: deduped };
        set({
          importedData: data,
          mappingState: fieldMappingsToMappingState(deduped),
          pipelineMappings: pm,
          processedData: [],
          validationErrors: [],
          isLoading: false,
        });
        return;
      }

      set({ importedData: data, isLoading: true });

      computeAutoMappingAsync(
        data.headers,
        sheetConfig.fields,
        sheetConfig.mappingConfidenceThreshold
      ).then((autoMapping) => {
        if (get().importedData !== data) return;
        const fm = mappingStateToFieldMappings(autoMapping).map((m) => {
          const f = sheetConfig.fields.find((x) => x.key === m.target);
          let transform = f?.defaultTransform;
          if (!transform && f && (f.type === "string" || f.type === "enum")) {
            const samples = data.rows.slice(0, 50).map((r) => r[m.source]);
            if (detectAllCapsField(samples)) transform = "capitalize";
          }
          return transform ? { ...m, transform } : m;
        });
        set({
          mappingState: autoMapping,
          pipelineMappings: { fieldMappings: fm },
          processedData: [],
          validationErrors: [],
          isLoading: false,
        });
      });
    },

    processDataChunked: async () => {
      const state = get();
      if (!state.importedData) return;
      const sheetConfig = getCurrentSheetConfig(state);
      if (!sheetConfig) return;

      const rows = state.importedData.rows || [];
      const fields = sheetConfig.fields;
      const pipeline = state.pipelineMappings;
      const registry = state.transformRegistry || defaultTransforms;
      const vRegistry = state.validationRegistry;
      const fileType = state.importedData.fileType;
      const runId = ++processingRunId;

      set({ isLoading: true, processingProgress: 0 });

      const BATCH =
        state.config?.processing?.chunkSize && state.config.processing.chunkSize > 0
          ? state.config.processing.chunkSize
          : PROCESSING.DEFAULT_CHUNK_SIZE;
      const processed: DataRow[] = [];
      const total = rows.length || 1;
      let lastProgressUpdate = 0;
      let lastDataUpdate = 0;
      const DATA_UPDATE_MS = 500;

      for (let start = 0; start < rows.length; start += BATCH) {
        if (runId !== processingRunId) return;

        const end = Math.min(rows.length, start + BATCH);
        const batchRows = rows.slice(start, end);

        const batchResult = processRowBatch(
          batchRows,
          start,
          fields,
          pipeline,
          state.mappingState,
          registry,
          vRegistry,
          fileType,
          { dateOutputFormat: state.config?.processing?.dateOutputFormat }
        );
        for (let i = 0; i < batchResult.length; i++) processed.push(batchResult[i]);

        if (runId !== processingRunId) return;

        const now = Date.now();
        const isLast = end >= rows.length;
        if (now - lastProgressUpdate >= PROCESSING.PROGRESS_THROTTLE_MS || isLast) {
          lastProgressUpdate = now;
          const progress = Math.min(1, processed.length / total);

          // Full data snapshot only at wider intervals or the final batch
          // to avoid O(n²) copying on every progress tick.
          if (now - lastDataUpdate >= DATA_UPDATE_MS || isLast) {
            lastDataUpdate = now;
            set({ processedData: processed.slice(), processingProgress: progress });
          } else {
            set({ processingProgress: progress });
          }
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      if (runId !== processingRunId) return;

      const final = applyUniquenessChecks(processed, fields);

      if (runId !== processingRunId) return;
      set({
        processedData: final,
        validationErrors: extractValidationErrors(final),
        isLoading: false,
        processingProgress: 1,
      });
    },

    processOnContinue: async () => {
      const state = get();
      if (!state.importedData) return;
      const previousData = state.processedData;
      const previousErrors = state.validationErrors;
      try {
        await get().processDataChunked();
      } catch (err) {
        set({
          isLoading: false,
          processedData: previousData,
          validationErrors: previousErrors,
          processingProgress: 0,
        });
        throw err;
      }
    },

    cancelProcessing: () => {
      processingRunId++;
      set({ isLoading: false, processingProgress: 0 });
    },

    clearImportedData: () => {
      set({
        importedData: null,
        mappingState: {},
        processedData: [],
        validationErrors: [],
      });
    },

    setMapping: (mapping) => {
      processingRunId++;
      set({
        mappingState: mapping,
        pipelineMappings: { fieldMappings: mappingStateToFieldMappings(mapping) },
        isLoading: false,
        processingProgress: 0,
        processedData: [],
        validationErrors: [],
      });
    },

    setMappingBatch: (mapping) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      const fm = mappingStateToFieldMappings(mapping).map((m) => {
        const f = sheetConfig?.fields.find((x) => x.key === m.target);
        return f?.defaultTransform ? { ...m, transform: f.defaultTransform } : m;
      });
      processingRunId++;
      set({
        mappingState: mapping,
        pipelineMappings: { fieldMappings: fm },
        processedData: [],
        validationErrors: [],
      });
    },

    updateMapping: (sourceColumn, targetField) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      const newMapping: MappingState = { ...state.mappingState };
      if (targetField) {
        for (const [src, tgt] of Object.entries(newMapping)) {
          if (src !== sourceColumn && tgt === targetField) newMapping[src] = null;
        }
      }
      newMapping[sourceColumn] = targetField;

      const existing = state.pipelineMappings?.fieldMappings || [];
      let next: FieldMapping[] = existing.filter((m) => m.source !== sourceColumn);
      if (targetField) {
        next = next.filter((m) => m.target !== targetField);
        let transform = existing.find((m) => m.source === sourceColumn)?.transform;
        if (!transform && sheetConfig) {
          const f = sheetConfig.fields.find((x) => x.key === targetField);
          transform = f?.defaultTransform;
        }
        next.push({ source: sourceColumn, target: targetField, transform });
      }

      processingRunId++;
      set({
        mappingState: newMapping,
        pipelineMappings: {
          ...(state.pipelineMappings || {}),
          fieldMappings: next,
        },
        isLoading: false,
        processingProgress: 0,
        processedData: [],
        validationErrors: [],
      });
    },

    setFieldMappings: (fieldMappings) => {
      const state = get();
      const byTarget = new Map<string, FieldMapping>();
      for (const m of fieldMappings || []) {
        if (!m.target) continue;
        byTarget.set(m.target, { ...m });
      }
      const compacted: FieldMapping[] = Array.from(byTarget.values());
      processingRunId++;
      set({
        pipelineMappings: {
          ...(state.pipelineMappings || {}),
          fieldMappings: compacted,
        },
        mappingState: fieldMappingsToMappingState(compacted),
        isLoading: false,
        processingProgress: 0,
        processedData: [],
        validationErrors: [],
      });
    },

    setValueMappings: (valueMappings) => {
      const state = get();
      const existing = state.pipelineMappings?.fieldMappings || [];
      const stamped = existing.map((m) => {
        const vm = valueMappings[m.target];
        if (!vm || Object.keys(vm).length === 0) {
          if (m.valueMappings) {
            const { valueMappings: _omit, ...rest } = m;
            return rest as FieldMapping;
          }
          return m;
        }
        return { ...m, valueMappings: { ...vm } };
      });
      processingRunId++;
      set({
        valueMappings: { ...valueMappings },
        pipelineMappings: {
          ...(state.pipelineMappings || {}),
          fieldMappings: stamped,
        },
        processedData: [],
        validationErrors: [],
      });
    },

    bulkApplyValueMappings: (perFieldMappings) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      if (!sheetConfig) return;
      const fields = sheetConfig.fields;

      // Pre-build lower-case lookup tables to avoid repeated normalisation
      // when mapping is applied to thousands of rows.
      const lowerLookup: Record<string, Map<string, string>> = {};
      for (const [fieldKey, mappings] of Object.entries(perFieldMappings)) {
        if (!mappings || Object.keys(mappings).length === 0) continue;
        const m = new Map<string, string>();
        for (const [src, tgt] of Object.entries(mappings)) {
          if (src && tgt) m.set(src.toLowerCase(), tgt);
        }
        if (m.size > 0) lowerLookup[fieldKey] = m;
      }
      if (Object.keys(lowerLookup).length === 0) return;

      const updated = state.processedData.map((row, idx) => {
        const newData = { ...row.data };
        let changed = false;
        for (const fieldKey of Object.keys(lowerLookup)) {
          const v = newData[fieldKey];
          if (v == null || v === "") continue;
          const key = String(v).trim().toLowerCase();
          const tgt = lowerLookup[fieldKey].get(key);
          if (tgt && tgt !== newData[fieldKey]) {
            newData[fieldKey] = tgt;
            changed = true;
          }
        }
        if (!changed) return row;
        const errors: ValidationError[] = [];
        for (const field of fields) {
          if (!(field.key in newData)) {
            if (field.required) {
              errors.push({
                row: idx,
                field: field.key,
                message: `${field.label} is required but not mapped`,
                severity: "error",
              });
            }
            continue;
          }
          const fieldErrors = validateFieldWithRegistry(
            newData[field.key],
            field,
            idx,
            newData,
            state.validationRegistry
          );
          for (let i = 0; i < fieldErrors.length; i++) errors.push(fieldErrors[i]);
        }
        return {
          ...row,
          data: newData,
          errors,
          isValid: errors.filter((e) => e.severity === "error").length === 0,
        };
      });

      // Merge into existing valueMappings so future re-imports keep these fixes
      const mergedValueMappings: Record<string, Record<string, string>> = {
        ...(state.valueMappings || {}),
      };
      for (const [fieldKey, mappings] of Object.entries(perFieldMappings)) {
        mergedValueMappings[fieldKey] = {
          ...(mergedValueMappings[fieldKey] || {}),
          ...mappings,
        };
      }

      const final = applyUniquenessChecks(updated, fields);
      set({
        processedData: final,
        validationErrors: extractValidationErrors(final),
        valueMappings: mergedValueMappings,
      });
    },

    updateRowData: (rowId, fieldKey, value) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      if (!sheetConfig) return;

      const idx = state.processedData.findIndex((r) => r.id === rowId);
      if (idx === -1) return;

      const row = state.processedData[idx];
      const newData = { ...row.data, [fieldKey]: value };

      // Re-validate ALL fields on this row so cross-field validators
      // that depend on the changed value are re-evaluated.
      const errors: ValidationError[] = [];
      for (const field of sheetConfig.fields) {
        if (!(field.key in newData)) {
          if (field.required) {
            errors.push({
              row: idx,
              field: field.key,
              message: `${field.label} is required but not mapped`,
              severity: "error",
            });
          }
          continue;
        }
        const fieldErrors = validateFieldWithRegistry(
          newData[field.key],
          field,
          idx,
          newData,
          state.validationRegistry
        );
        for (let i = 0; i < fieldErrors.length; i++) errors.push(fieldErrors[i]);
      }

      const updatedRow: DataRow = {
        ...row,
        data: newData,
        errors,
        isValid: errors.filter((e) => e.severity === "error").length === 0,
      };

      const updatedData = state.processedData.slice();
      updatedData[idx] = updatedRow;

      const final = refreshUniqueness(updatedData, sheetConfig.fields);
      set({
        processedData: final,
        validationErrors: extractValidationErrors(final),
      });
    },

    deleteRow: (rowId) => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      const filtered = state.processedData.filter((row) => row.id !== rowId);
      const final = sheetConfig
        ? refreshUniqueness(filtered, sheetConfig.fields)
        : filtered;
      set({
        processedData: final,
        validationErrors: extractValidationErrors(final),
      });
    },

    deleteInvalidRows: () => {
      const state = get();
      const sheetConfig = getCurrentSheetConfig(state);
      const kept = state.processedData.filter((row) => row.isValid);
      const final = sheetConfig
        ? refreshUniqueness(kept, sheetConfig.fields)
        : kept;
      set({
        processedData: final,
        validationErrors: extractValidationErrors(final),
      });
    },

    setLoading: (loading) => {
      set({ isLoading: loading });
    },

    reset: () => {
      processingRunId++;
      set(initialState);
    },
  }));
};
