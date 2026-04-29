export type FieldType = "string" | "number" | "email" | "date" | "boolean" | "phone" | "enum";

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
  /**
   * Optional URL the SDK can POST to in order to obtain AI-driven value
   * mapping suggestions. Receives `{ buckets: BucketRequest[] }`, expects
   * `{ results: [{ fieldKey, mappings: [{ source, target, confidence }] }] }`.
   * Falls back silently to the local synonym/fuzzy strategy if the endpoint
   * is unset or fails.
   */
  aiSuggestEndpoint?: string;
  /**
   * Optional URL the SDK can POST to for AI-driven column-mapping fallback.
   * Called after local fuzzy matching, with the unmatched headers and the
   * full target schema; the response is merged into the existing mapping
   * state. Falls back silently if unset or if the request fails.
   */
  aiColumnSuggestEndpoint?: string;
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
  enum?: string[];
  format?: NumberFormat | DateFormat;
}

export interface NumberFormat {
  digits?: number;
}

export interface DateFormat {
  output?: string;
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
  autoDetectMetadataRow?: boolean;
  skipRows?: number[];
  dateOutputFormat?: string;
}

export interface MetadataRowInfo {
  rowIndex: number;
  hints: Record<string, string>;
}

export type FileType = "csv" | "excel" | "xlsx" | "xls";

export interface ImportedData {
  headers: string[];
  rows: Record<string, unknown>[];
  fileName?: string;
  fileType?: FileType;
  metadataRow?: MetadataRowInfo;
}

export interface MappingState {
  [sourceColumn: string]: string | null;
}

export interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
  confidence?: number;
  valueMappings?: Record<string, string>;
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
  valueMappings?: Record<string, Record<string, string>>;
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
  onStepChange?: (step: "import" | "mapping" | "values" | "review") => void;
  onMetadataRowDetected?: (info: MetadataRowInfo) => void;
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
