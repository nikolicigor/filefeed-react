// Main SDK exports
export { default as FilefeedWorkbook } from "./components/FilefeedWorkbook";
export { FilefeedSheet } from "./components/FilefeedSheet";
export { ValueMappingStep } from "./components/ValueMappingStep";
export { useFilefeed } from "./hooks/useFilefeed";
export { FilefeedProvider } from "./provider/FilefeedProvider";
export { destroyPortal, resetGlobalPortal } from "./provider/globalPortal";
export { defaultTransforms } from "./utils/dataProcessing";
export { validatePipelineConfig } from "./utils/dataProcessing";
export { generateAutoMappingAsync } from "./utils/dataProcessing";
export {
  parseFlexibleDate,
  formatDate,
  detectAllCapsField,
  TRANSFORM_LABELS,
  TRANSFORM_EXAMPLES,
  transformLabel,
  transformExample,
} from "./utils/dataProcessing";
export {
  suggestValueMapping,
  extractEnumColumnValues,
  extractInvalidEnumValuesFromProcessed,
  applyValueMappingsToFieldMappings,
} from "./utils/valueMapping";
export { detectMetadataRow } from "./utils/fileParsing";
export type { ValueMappingSuggestion, UniqueValueBucket } from "./utils/valueMapping";
export type { Filefeed } from "./types/filefeedTypes";

// Type exports
export type {
  CreateWorkbookConfig,
  ProcessingOptions,
  SheetConfig,
  FieldConfig,
  FieldType,
  FileType,
  ValidationRule,
  ImportedData,
  MappingState,
  ValidationError,
  DataRow,
  WorkbookState,
  FilefeedEvents,
  FilefeedSDKProps,
  FieldMapping,
  PipelineMappings,
  TransformRegistry,
  TransformFn,
  ValidationRegistry,
  ValidationFn,
  FilefeedWorkbookRef,
  MappingInterfaceProps,
  MetadataRowInfo,
  NumberFormat,
  DateFormat,
} from "./types";

// Default export for convenience
export { default } from "./components/FilefeedWorkbook";
