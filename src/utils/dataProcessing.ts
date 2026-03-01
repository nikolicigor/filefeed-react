import {
  ImportedData,
  FieldConfig,
  ValidationRule,
  ValidationError,
  DataRow,
  FieldMapping,
  PipelineMappings,
  TransformRegistry,
  ValidationRegistry,
} from "../types";

// Backend-compatible defaults and helpers (CSV/XLSX lightweight parity)
export const defaultTransforms: TransformRegistry = {
  toLowerCase: (v) => (v == null ? v : String(v).toLowerCase()),
  toUpperCase: (v) => (v == null ? v : String(v).toUpperCase()),
  capitalize: (v) => {
    if (v == null) return v;
    const s = String(v).toLowerCase();
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  },
  trim: (v) => (v == null ? v : String(v).trim()),
  toNumber: (v) => (v == null || v === "" ? null : Number(v)),
  formatPhoneNumber: (v) =>
    v == null ? v : String(v).replace(/[^0-9]/g, ""),
  formatEmail: (v) => (v == null ? v : String(v).trim().toLowerCase()),
};

export const applyNamedTransform = (
  value: unknown,
  transformName?: string,
  registry?: TransformRegistry
): unknown => {
  if (!transformName) return value;
  const fn = registry?.[transformName];
  try {
    return fn ? fn(value) : value;
  } catch {
    return value;
  }
};

export const mappingStateToFieldMappings = (
  mapping: Record<string, string | null>
): FieldMapping[] =>
  Object.entries(mapping)
    .filter(([, target]) => !!target)
    .map(([source, target]) => ({ source, target: target as string }));

export const fieldMappingsToMappingState = (
  fieldMappings: FieldMapping[]
): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  for (const m of fieldMappings) out[m.source] = m.target || null;
  return out;
};

export const validatePipelineConfig = (
  fields: FieldConfig[],
  pipeline: PipelineMappings,
  availableTransforms: string[] = Object.keys(defaultTransforms)
): string[] => {
  const errors: string[] = [];
  const required = new Set(fields.filter((f) => f.required).map((f) => f.key));
  const mappedTargets = new Set<string>();
  for (const m of pipeline.fieldMappings || []) {
    if (m.target) mappedTargets.add(m.target);
    if (m.transform && !availableTransforms.includes(m.transform)) {
      errors.push(
        `Transform '${m.transform}' referenced by mapping ${m.source} -> ${m.target} is not available`
      );
    }
  }
  for (const key of required) {
    if (!mappedTargets.has(key))
      errors.push(`Missing mapping for required field '${key}'`);
  }
  return errors;
};

export const processImportedDataWithMappings = (
  importedData: ImportedData,
  fields: FieldConfig[],
  pipeline: PipelineMappings,
  registry: TransformRegistry = defaultTransforms,
  validationRegistry?: ValidationRegistry
): DataRow[] => {
  const rows = processRowBatch(
    importedData.rows,
    0,
    fields,
    pipeline,
    {},
    registry,
    validationRegistry,
    importedData.fileType
  );

  return applyUniquenessChecks(rows, fields);
};


// Validation utilities
export const validateFieldWithRegistry = (
  value: unknown,
  field: FieldConfig,
  rowIndex: number,
  rowData: Record<string, unknown> = {},
  registry?: ValidationRegistry
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Required validation
  if (field.required && (value === null || value === undefined || value === "")) {
    errors.push({
      row: rowIndex,
      field: field.key,
      message: `${field.label} is required`,
      severity: "error",
    });
    return errors; // Don't continue if required field is empty
  }

  // Type validation
  if (value !== null && value !== undefined && value !== "") {
    switch (field.type) {
      case "number":
        if (isNaN(Number(value))) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `${field.label} must be a valid number`,
            severity: "error",
          });
        }
        break;
      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(value))) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `${field.label} must be a valid email address`,
            severity: "error",
          });
        }
        break;
      case "date":
        if (isNaN(Date.parse(String(value)))) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `${field.label} must be a valid date`,
            severity: "error",
          });
        }
        break;
      case "boolean": {
        const booleanValues = ["true", "false", "1", "0", "yes", "no"];
        if (!booleanValues.includes(String(value).toLowerCase())) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `${field.label} must be a valid boolean value`,
            severity: "error",
          });
        }
        break;
      }
      case "phone": {
        const digits = String(value).replace(/[^0-9]/g, "");
        if (digits.length < 7 || digits.length > 15) {
          errors.push({
            row: rowIndex,
            field: field.key,
            message: `${field.label} must be a valid phone number (7-15 digits)`,
            severity: "error",
          });
        }
        break;
      }
    }
  }

  // Custom validations
  if (field.validations) {
    field.validations.forEach((validation) => {
      if (validation.type === "custom" && registry && validation.name) {
        const fn = registry[validation.name];
        if (typeof fn === "function") {
          try {
            const res = fn(value, field, rowIndex, rowData, validation.args as Record<string, unknown>);
            if (res === false) {
              errors.push({
                row: rowIndex,
                field: field.key,
                message: validation.message || `${field.label} failed validation`,
                severity: "error",
              });
            } else if (typeof res === "string") {
              errors.push({
                row: rowIndex,
                field: field.key,
                message: res,
                severity: "error",
              });
            } else if (res && typeof res === "object") {
              const maybe = res as ValidationError;
              errors.push({
                row: maybe.row ?? rowIndex,
                field: maybe.field ?? field.key,
                message: maybe.message || validation.message || `${field.label} failed validation`,
                severity: maybe.severity || "error",
              });
            }
          } catch {
            errors.push({
              row: rowIndex,
              field: field.key,
              message: validation.message || `${field.label}: custom validator threw an error`,
              severity: "error",
            });
          }
          return;
        }
      }
      const validationError = validateRule(value, validation, field, rowIndex);
      if (validationError) {
        errors.push(validationError);
      }
    });
  }

  return errors;
};

const REGEX_CACHE_MAX = 200;
const regexCache = new Map<string, RegExp>();
function getCachedRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    if (regexCache.size >= REGEX_CACHE_MAX) {
      const oldest = regexCache.keys().next().value;
      if (oldest !== undefined) regexCache.delete(oldest);
    }
    regexCache.set(pattern, re);
  }
  return re;
}

const validateRule = (
  value: unknown,
  rule: ValidationRule,
  field: FieldConfig,
  rowIndex: number
): ValidationError | null => {
  switch (rule.type) {
    case "regex":
      if (value && rule.value != null) {
        try {
          if (!getCachedRegex(String(rule.value)).test(String(value))) {
            return {
              row: rowIndex,
              field: field.key,
              message: rule.message,
              severity: "error",
            };
          }
        } catch {
          return {
            row: rowIndex,
            field: field.key,
            message: `Invalid regex pattern: ${rule.value}`,
            severity: "error",
          };
        }
      }
      break;
    case "min":
      if (rule.value != null) {
        const minVal = Number(rule.value);
        if (field.type === "number" && Number(value) < minVal) {
          return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
        }
        if (field.type === "string" && String(value).length < minVal) {
          return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
        }
        if (field.type === "date" && value) {
          const dateVal = new Date(String(value)).getTime();
          const minDate = new Date(String(rule.value)).getTime();
          if (!isNaN(dateVal) && !isNaN(minDate) && dateVal < minDate) {
            return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
          }
        }
      }
      break;
    case "max":
      if (rule.value != null) {
        const maxVal = Number(rule.value);
        if (field.type === "number" && Number(value) > maxVal) {
          return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
        }
        if (field.type === "string" && String(value).length > maxVal) {
          return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
        }
        if (field.type === "date" && value) {
          const dateVal = new Date(String(value)).getTime();
          const maxDate = new Date(String(rule.value)).getTime();
          if (!isNaN(dateVal) && !isNaN(maxDate) && dateVal > maxDate) {
            return { row: rowIndex, field: field.key, message: rule.message, severity: "error" };
          }
        }
      }
      break;
    case "custom":
      // Custom validation would be handled by the consuming application
      break;
  }
  return null;
};

// Data transformation utilities
const excelSerialToDate = (serial: number): Date => {
  const excelEpoch = Date.UTC(1899, 11, 30);
  const ms = Math.round(serial * 86400000);
  return new Date(excelEpoch + ms);
};

const EXCEL_SERIAL_MIN = 365;
const EXCEL_SERIAL_MAX = 600000;

export const transformValue = (value: unknown, fieldType: string, sourceFileType?: string): unknown => {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  switch (fieldType) {
    case "string":
      return String(value).trim();
    case "number": {
      const num = Number(value);
      if (isNaN(num)) return value;
      return num;
    }
    case "boolean": {
      const str = String(value).toLowerCase();
      return str === "true" || str === "1" || str === "yes";
    }
    case "phone":
      return String(value).replace(/[^0-9+\-() ]/g, "").trim();
    case "date":
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? value : value.toISOString();
      }
      if (typeof value === "number") {
        const isExcelSource = sourceFileType === "excel" || sourceFileType === "xlsx" || sourceFileType === "xls";
        const maybeExcel = isExcelSource && value > EXCEL_SERIAL_MIN && value < EXCEL_SERIAL_MAX;
        const d = maybeExcel ? excelSerialToDate(value) : new Date(value);
        return isNaN(d.getTime()) ? value : d.toISOString();
      }
      if (typeof value === "string") {
        const s = value.trim();
        if (!s) return null;
        const d = new Date(s);
        return isNaN(d.getTime()) ? s : d.toISOString();
      }
      return value;
    default:
      return value;
  }
};

/**
 * Process a batch of raw rows into DataRow[] using the given pipeline/mapping.
 * Shared by both sync and chunked processing paths.
 */
export const processRowBatch = (
  rows: Record<string, unknown>[],
  startIndex: number,
  fields: FieldConfig[],
  pipeline: PipelineMappings | undefined,
  mappingState: Record<string, string | null>,
  registry: TransformRegistry = defaultTransforms,
  validationRegistry?: ValidationRegistry,
  sourceFileType?: string
): DataRow[] => {
  const fieldByKey = new Map<string, FieldConfig>();
  for (const f of fields) fieldByKey.set(f.key, f);

  return rows.map((row, offset) => {
    const index = startIndex + offset;
    const processed: Record<string, unknown> = {};
    const errors: ValidationError[] = [];

    if (pipeline) {
      for (const m of pipeline.fieldMappings || []) {
        const { source, target, transform } = m;
        if (!(source in row) || !target) continue;
        const field = fieldByKey.get(target);
        if (!field) continue;
        let v: unknown = row[source];
        const tName = transform ?? field.defaultTransform;
        v = applyNamedTransform(v, tName, registry);
        const coerced = transformValue(v, field.type, sourceFileType);
        processed[target] = coerced;
        const fieldErrors = validateFieldWithRegistry(coerced, field, index, processed, validationRegistry);
        for (let i = 0; i < fieldErrors.length; i++) errors.push(fieldErrors[i]);
      }
    } else {
      for (const [sourceColumn, targetField] of Object.entries(mappingState)) {
        if (!targetField || row[sourceColumn] === undefined) continue;
        const field = fieldByKey.get(targetField);
        if (!field) continue;
        let raw: unknown = row[sourceColumn];
        const tName = field.defaultTransform;
        raw = applyNamedTransform(raw, tName, registry);
        const coerced = transformValue(raw, field.type, sourceFileType);
        processed[targetField] = coerced;
        const fieldErrors = validateFieldWithRegistry(coerced, field, index, processed, validationRegistry);
        for (let i = 0; i < fieldErrors.length; i++) errors.push(fieldErrors[i]);
      }
    }

    for (const f of fields) {
      if (f.required && !(f.key in processed)) {
        errors.push({
          row: index,
          field: f.key,
          message: `${f.label} is required but not mapped`,
          severity: "error",
        });
      }
    }

    return {
      id: `row-${index}`,
      data: processed,
      errors,
      isValid: errors.filter((e) => e.severity === "error").length === 0,
    };
  });
};

/**
 * Apply uniqueness checks across all processed rows.
 * Returns a new array with errors appended to duplicate rows.
 */
export const applyUniquenessChecks = (rows: DataRow[], fields: FieldConfig[]): DataRow[] => {
  const uniqueFields = fields.filter((f) => f.unique);
  if (uniqueFields.length === 0) return rows;

  const result = rows.slice();

  for (const f of uniqueFields) {
    const seen = new Map<string, number>();
    const flagged = new Set<number>();

    for (let idx = 0; idx < result.length; idx++) {
      const val = result[idx].data[f.key];
      if (val === undefined || val === null || val === "") continue;
      const key = String(val);
      if (seen.has(key)) {
        const first = seen.get(key)!;
        const addError = (rowIdx: number) => {
          if (flagged.has(rowIdx)) return;
          flagged.add(rowIdx);
          const error: ValidationError = {
            row: rowIdx,
            field: f.key,
            message: `${f.label} must be unique. Duplicate value '${key}' found`,
            severity: "error",
          };
          result[rowIdx] = {
            ...result[rowIdx],
            errors: [...result[rowIdx].errors, error],
            isValid: false,
          };
        };
        addError(first);
        addError(idx);
      } else {
        seen.set(key, idx);
      }
    }
  }

  return result;
};

// Auto-mapping utilities

const calculateSimilarity = (str1: string, str2: string): number => {
  if (str1 === str2) return 1;
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;

  const prevRow = new Uint16Array(str1.length + 1);
  const currRow = new Uint16Array(str1.length + 1);
  for (let i = 0; i <= str1.length; i++) prevRow[i] = i;

  for (let j = 1; j <= str2.length; j++) {
    currRow[0] = j;
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,
        prevRow[i] + 1,
        prevRow[i - 1] + cost
      );
    }
    prevRow.set(currRow);
  }

  return 1 - prevRow[str1.length] / maxLength;
};

function computeMappingSync(
  importedHeaders: string[],
  fields: FieldConfig[],
  confidenceThreshold: number,
): Record<string, string | null> {
  const fieldLower = fields.map((f) => ({
    key: f.key,
    label: f.label.toLowerCase(),
    keyLower: f.key.toLowerCase(),
  }));

  const headerCandidates = importedHeaders.map((header) => {
    const headerLower = header.toLowerCase();
    const candidates = fieldLower
      .map((f) => {
        const labelConf = calculateSimilarity(headerLower, f.label);
        const keyConf = calculateSimilarity(headerLower, f.keyLower);
        return { key: f.key, confidence: Math.max(labelConf, keyConf) };
      })
      .filter((c) => c.confidence > confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0]?.confidence || 0;
    return { header, candidates, best };
  });

  headerCandidates.sort((a, b) => b.best - a.best);

  const usedTargets = new Set<string>();
  const mapping: Record<string, string | null> = {};

  for (const item of headerCandidates) {
    const pick = item.candidates.find((c) => !usedTargets.has(c.key));
    if (pick) {
      mapping[item.header] = pick.key;
      usedTargets.add(pick.key);
    } else {
      mapping[item.header] = null;
    }
  }

  return mapping;
}

const AUTO_MAP_YIELD_THRESHOLD = 80;

export const generateAutoMapping = (
  importedHeaders: string[],
  fields: FieldConfig[],
  confidenceThreshold: number = 0.7
): Record<string, string | null> => {
  return computeMappingSync(importedHeaders, fields, confidenceThreshold);
};

export const generateAutoMappingAsync = async (
  importedHeaders: string[],
  fields: FieldConfig[],
  confidenceThreshold: number = 0.7
): Promise<Record<string, string | null>> => {
  if (importedHeaders.length * fields.length < AUTO_MAP_YIELD_THRESHOLD * AUTO_MAP_YIELD_THRESHOLD) {
    return computeMappingSync(importedHeaders, fields, confidenceThreshold);
  }

  const fieldLower = fields.map((f) => ({
    key: f.key,
    label: f.label.toLowerCase(),
    keyLower: f.key.toLowerCase(),
  }));

  type Candidate = { key: string; confidence: number };
  const headerCandidates: { header: string; candidates: Candidate[]; best: number }[] = [];

  const BATCH = 50;
  for (let start = 0; start < importedHeaders.length; start += BATCH) {
    const end = Math.min(importedHeaders.length, start + BATCH);
    for (let h = start; h < end; h++) {
      const header = importedHeaders[h];
      const headerLower = header.toLowerCase();
      const candidates = fieldLower
        .map((f) => {
          const labelConf = calculateSimilarity(headerLower, f.label);
          const keyConf = calculateSimilarity(headerLower, f.keyLower);
          return { key: f.key, confidence: Math.max(labelConf, keyConf) };
        })
        .filter((c) => c.confidence > confidenceThreshold)
        .sort((a, b) => b.confidence - a.confidence);
      const best = candidates[0]?.confidence || 0;
      headerCandidates.push({ header, candidates, best });
    }
    if (end < importedHeaders.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  headerCandidates.sort((a, b) => b.best - a.best);

  const usedTargets = new Set<string>();
  const mapping: Record<string, string | null> = {};

  for (const item of headerCandidates) {
    const pick = item.candidates.find((c) => !usedTargets.has(c.key));
    if (pick) {
      mapping[item.header] = pick.key;
      usedTargets.add(pick.key);
    } else {
      mapping[item.header] = null;
    }
  }

  return mapping;
};

