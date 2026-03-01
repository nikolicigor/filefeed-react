export type FieldType = "string" | "number" | "email" | "date" | "boolean" | "phone";

export interface CreateWorkbookConfig {
  name: string;
  labels?: string[];
  namespace?: string;
  spaceId?: string;
  environmentId?: string;
  metadata?: Record<string, unknown>;
  sheets: SheetConfig[];
  transformRegistry?: TransformRegistry;
  validationRegistry?: ValidationRegistry;
  processing?: ProcessingOptions;
}

export interface SheetConfig {
  name: string;
  slug: string;
  fields: FieldConfig[];
  mappingConfidenceThreshold?: number;
  pipelineMappings?: PipelineMappings;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  validations?: ValidationRule[];
  description?: string;
  defaultTransform?: string;
}

export interface ValidationRule {
  type: "regex" | "min" | "max" | "custom";
  value?: string | number;
  message: string;
  name?: string;
  args?: Record<string, unknown>;
}


export interface ProcessingOptions {
  chunkSize?: number;
  maxFileSize?: number;
  maxRows?: number;
}

export type FileType = "csv" | "excel" | "xlsx" | "xls";

export interface ImportedData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName?: string;
  fileType?: FileType;
}

export interface MappingState {
  [sourceColumn: string]: string | null;
}

export interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
  confidence?: number;
}

export interface PipelineMappings {
  options?: {
    delimiter?: string;
    skipHeaderRow?: boolean;
    detectTypes?: boolean;
    validateData?: boolean;
  };
  fieldMappings: FieldMapping[];
  transformations?: Record<string, string>;
  validations?: Record<string, unknown>;
}
export type TransformFn = (value: unknown) => unknown;
export type TransformRegistry = Record<string, TransformFn>;
export type ValidationFn = (
  value: unknown,
  field: FieldConfig,
  rowIndex: number,
  rowData: Record<string, unknown>,
  args?: Record<string, unknown>
) => string | ValidationError | null | undefined | false;
export type ValidationRegistry = Record<string, ValidationFn>;

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface DataRow {
  id: string;
  data: Record<string, unknown>;
  errors: ValidationError[];
  isValid: boolean;
}

export interface WorkbookState {
  config: CreateWorkbookConfig;
  currentSheet: string;
  importedData: ImportedData | null;
  mappingState: MappingState;
  processedData: DataRow[];
  validationErrors: ValidationError[];
  isLoading: boolean;
  pipelineMappings?: PipelineMappings;
  transformRegistry?: TransformRegistry;
  validationRegistry?: ValidationRegistry;
  processingProgress?: number;
}
export interface FilefeedEvents {
  onDataImported?: (data: ImportedData) => void;
  onMappingChanged?: (mapping: MappingState) => void;
  onValidationComplete?: (errors: ValidationError[]) => void;
  onWorkbookComplete?: (data: DataRow[]) => void;
  onSubmitChunk?: (args: {
    rows: DataRow[];
    chunkIndex: number;
    totalChunks: number;
  }) => void | Promise<void>;
  onSubmitStart?: () => void;
  onSubmitComplete?: () => void;
  onStepChange?: (step: "import" | "mapping" | "review") => void;
  onReset?: () => void;
  onError?: (error: { type: "import" | "processing" | "submit" | "validation"; message: string; originalError?: unknown }) => void;
}
export interface FilefeedSDKProps {
  config: CreateWorkbookConfig;
  events?: FilefeedEvents;
  theme?: "light" | "dark";
  className?: string;
}

export interface MappingInterfaceProps {
  importedHeaders: string[];
  fields: FieldConfig[];
  mapping: MappingState;
  onMappingChange: (mapping: MappingState) => void;
  confidenceThreshold?: number;
  importedData?: ImportedData;
  onBack?: () => void;
  onContinue?: () => void;
  fieldMappings?: FieldMapping[];
  onFieldMappingsChange?: (mappings: FieldMapping[]) => void;
  transformRegistry?: TransformRegistry;
  isProcessing?: boolean;
  canContinue?: boolean;
}

export interface FilefeedWorkbookRef {
  reset: () => void;
  cancelProcessing: () => void;
}
