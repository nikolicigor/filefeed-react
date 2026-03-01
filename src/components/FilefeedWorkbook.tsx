"use client";

import React, {
  Component,
  useEffect,
  useState,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import type { ErrorInfo } from "react";
import {
  Container,
  Card,
  LoadingOverlay,
  Text,
  Button,
  Stack,
} from "@mantine/core";
import type {
  FilefeedSDKProps,
  FilefeedWorkbookRef,
  TransformRegistry,
  ValidationRegistry,
} from "../types";
import { Z_INDEX, LAYOUT } from "../constants";
import { createWorkbookStore } from "../stores/workbookStore";
import type { WorkbookStore } from "../stores/workbookStore";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import MappingInterface from "./MappingInterface";
import { ImportStep } from "./ImportStep";
import { ReviewStep } from "./ReviewStep";
import { Providers } from "../app/providers";

import { useManualEntry } from "../hooks/useManualEntry";
import { useDynamicRowCount } from "../hooks/useDynamicRowCount";
import { useFileImport } from "../hooks/useFileImport";
import { useWorkbookSubmit, buildManualRows } from "../hooks/useWorkbookSubmit";
import {
  validatePipelineConfig,
  mappingStateToFieldMappings,
} from "../utils/dataProcessing";

// ─────────────────────────────────────────────────────────────────────
// Error Boundary — catches rendering crashes so the host app survives.
// ─────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class FilefeedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Filefeed] Rendering error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Stack align="center" justify="center" p="xl" gap="sm" style={{ minHeight: 200 }}>
          <Text size="sm" c="red.6" fw={500}>Something went wrong in the importer.</Text>
          <Button
            size="xs"
            variant="outline"
            color="dark"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </Button>
        </Stack>
      );
    }
    return this.props.children;
  }
}

type Step = "import" | "mapping" | "review";
type InnerProps = FilefeedSDKProps & { store: StoreApi<WorkbookStore> };

// ─────────────────────────────────────────────────────────────────────
// Inner orchestrator — owns step state, hooks, and delegates rendering
// to focused step components.
// ─────────────────────────────────────────────────────────────────────

const FilefeedWorkbookInner = forwardRef<FilefeedWorkbookRef, InnerProps>(
  ({ config, events, theme = "light", className, store }, ref) => {
    const [activeTab, setActiveTab] = useState<Step>("import");
    const [isManualEntryMode, setIsManualEntryMode] = useState(false);

    // Stable ref for events — avoids stale closures while keeping
    // callbacks stable so children don't needlessly re-render.
    const eventsRef = useRef(events);
    eventsRef.current = events;

    // ── Store: reactive state ────────────────────────────────────────
    const currentSheet = useStore(store, (s) => s.currentSheet);
    const importedData = useStore(store, (s) => s.importedData);
    const mappingState = useStore(store, (s) => s.mappingState);
    const isLoading = useStore(store, (s) => s.isLoading);
    const processingProgress = useStore(store, (s) => s.processingProgress);
    const pipelineMappings = useStore(store, (s) => s.pipelineMappings);
    const transformRegistry = useStore(store, (s) => s.transformRegistry);
    const validationRegistry = useStore(store, (s) => s.validationRegistry);

    // ── Store: stable action references (zustand actions never change) ──
    const {
      setConfig,
      setImportedData,
      setMapping,
      setMappingBatch,
      clearImportedData,
      setFieldMappings,
      setProcessedRows,
      processOnContinue,
      cancelProcessing,
      reset: resetStore,
    } = useMemo(() => store.getState(), [store]);

    const currentSheetConfig = config.sheets.find(
      (s) => s.slug === currentSheet
    );

    // ── Config stability fix ─────────────────────────────────────────
    // Prevents store reset when consumers pass inline config objects
    // that are structurally identical but have a new reference.
    const configJsonRef = useRef("");
    const registriesRef = useRef<{
      t?: TransformRegistry;
      v?: ValidationRegistry;
    }>({});

    useEffect(() => {
      const { transformRegistry: t, validationRegistry: v, ...rest } = config;
      const json = JSON.stringify(rest);
      const registriesChanged =
        t !== registriesRef.current.t || v !== registriesRef.current.v;

      if (json !== configJsonRef.current || registriesChanged) {
        configJsonRef.current = json;
        registriesRef.current = { t, v };
        setConfig(config);
      }
    }, [config, setConfig]);

    // Fire step-change event
    useEffect(() => {
      eventsRef.current?.onStepChange?.(activeTab);
    }, [activeTab]);

    // ── Hooks ────────────────────────────────────────────────────────
    const manualEntry = useManualEntry(
      currentSheetConfig?.fields,
      validationRegistry
    );
    const resetManual = manualEntry.reset;

    const { setContainerRef: setTableContainerRef, maxRows } =
      useDynamicRowCount();

    const hardResetToImport = useCallback(() => {
      resetStore();
      setConfig(config);
      setActiveTab("import");
      setIsManualEntryMode(false);
      resetManual();
      eventsRef.current?.onReset?.();
    }, [config, resetStore, setConfig, resetManual]);

    const { submitRows } = useWorkbookSubmit({
      chunkSize: config?.processing?.chunkSize,
      eventsRef,
      onComplete: hardResetToImport,
    });

    const { isUploading, triggerFilePicker, handleFile } = useFileImport({
      config,
      onImported: (data) => {
        setImportedData(data);
        setActiveTab("mapping");
        if (isManualEntryMode) {
          setIsManualEntryMode(false);
          resetManual();
        }
        eventsRef.current?.onDataImported?.(data);
      },
      onError: (err) => eventsRef.current?.onError?.(err),
    });

    // ── Imperative handle ────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        reset: () => hardResetToImport(),
        cancelProcessing: () => cancelProcessing(),
      }),
      [hardResetToImport, cancelProcessing]
    );

    // ── Mapping step helpers ─────────────────────────────────────────
    const handleMappingChange = useCallback(
      (mapping: Record<string, string | null>) => {
        setMappingBatch(mapping);
        eventsRef.current?.onMappingChanged?.(mapping);
      },
      [setMappingBatch]
    );

    const canProceedToReview = useMemo(() => {
      if (!currentSheetConfig) return false;
      const pipeline = pipelineMappings || {
        fieldMappings: mappingStateToFieldMappings(mappingState),
      };
      const availableTransforms = transformRegistry
        ? Object.keys(transformRegistry)
        : undefined;
      const cfgErrors = validatePipelineConfig(
        currentSheetConfig.fields,
        pipeline,
        availableTransforms
      );
      return !cfgErrors.some((e) =>
        e.toLowerCase().includes("missing mapping for required field")
      );
    }, [currentSheetConfig, pipelineMappings, mappingState, transformRegistry]);

    const isChunkingPlanned = Boolean(
      config?.processing?.chunkSize && config.processing.chunkSize > 0
    );

    const handleContinueToReview = useCallback(async () => {
      try {
        if (isChunkingPlanned) {
          void processOnContinue().catch((err: unknown) => {
            eventsRef.current?.onError?.({
              type: "processing",
              message:
                err instanceof Error ? err.message : "Processing failed",
              originalError: err,
            });
          });
        } else {
          await processOnContinue();
        }
        setActiveTab("review");
      } catch (err) {
        eventsRef.current?.onError?.({
          type: "processing",
          message: err instanceof Error ? err.message : "Processing failed",
          originalError: err,
        });
      }
    }, [isChunkingPlanned, processOnContinue]);

    // ── Submit handlers ──────────────────────────────────────────────
    const handleImportSubmit = useCallback(() => {
      if (!currentSheetConfig) return;
      const rows = buildManualRows(
        manualEntry.manualEntryData,
        currentSheetConfig.fields,
        validationRegistry
      );
      submitRows(rows);
    }, [
      manualEntry.manualEntryData,
      currentSheetConfig,
      validationRegistry,
      submitRows,
    ]);

    const handleReviewSubmit = useCallback(() => {
      submitRows(store.getState().processedData);
    }, [store, submitRows]);

    const handleBackToMapping = useCallback(() => {
      cancelProcessing();
      setProcessedRows([]);
      setActiveTab("mapping");
    }, [cancelProcessing, setProcessedRows]);

    const handleStartManualEntry = useCallback(() => {
      setIsManualEntryMode(true);
      clearImportedData();
      setMapping({});
    }, [clearImportedData, setMapping]);

    // ── Progress toast ───────────────────────────────────────────────
    const percent = Math.max(
      0,
      Math.min(100, Math.round((processingProgress || 0) * 100))
    );

    // ── Render ───────────────────────────────────────────────────────
    return (
      <div
        className={`filefeed-workbook ${className || ""}`}
        data-theme={theme}
        role="region"
        aria-label="Data import workbook"
        style={{ position: "relative" }}
      >
        <LoadingOverlay
          visible={isLoading && !(activeTab === "review" && isChunkingPlanned)}
          zIndex={Z_INDEX.LOADING_OVERLAY}
          overlayProps={{ opacity: 0.15, blur: 1 }}
        />

        <Container size="xl" py="xl">
          {!currentSheetConfig ? null : activeTab === "mapping" &&
            importedData ? (
            <Card shadow="sm" padding={0} radius="md" withBorder>
              <MappingInterface
                importedHeaders={importedData.headers}
                fields={currentSheetConfig.fields}
                mapping={mappingState}
                onMappingChange={handleMappingChange}
                importedData={importedData}
                onBack={hardResetToImport}
                onContinue={handleContinueToReview}
                fieldMappings={pipelineMappings?.fieldMappings}
                onFieldMappingsChange={setFieldMappings}
                transformRegistry={transformRegistry}
                isProcessing={isLoading}
                canContinue={canProceedToReview}
              />
            </Card>
          ) : activeTab === "review" && importedData ? (
            <ReviewStep
              store={store}
              sheetConfig={currentSheetConfig}
              onSubmit={handleReviewSubmit}
              onBack={handleBackToMapping}
              isChunkingPlanned={isChunkingPlanned}
            />
          ) : (
            <ImportStep
              sheetConfig={currentSheetConfig}
              isManualEntryMode={isManualEntryMode}
              onStartManualEntry={handleStartManualEntry}
              onBack={hardResetToImport}
              onSubmit={handleImportSubmit}
              isLoading={isLoading}
              isUploading={isUploading}
              triggerFilePicker={triggerFilePicker}
              handleFile={handleFile}
              manualEntry={manualEntry}
              setTableContainerRef={setTableContainerRef}
              maxRows={maxRows}
            />
          )}
        </Container>

        {/* Chunked-processing progress toast */}
        {isLoading && isChunkingPlanned && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              left: "50%",
              bottom: 16,
              transform: "translateX(-50%)",
              background: "var(--ff-toast-bg, rgba(0,0,0,0.9))",
              color: "var(--ff-toast-text, white)",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              zIndex: Z_INDEX.PROGRESS_TOAST,
              boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
              width: LAYOUT.PROGRESS_TOAST_WIDTH,
              textAlign: "center",
            }}
          >
            Processing data… {percent}%
          </div>
        )}
      </div>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────
// Public wrapper — creates an isolated store per instance and provides
// the Mantine context tree.
// ─────────────────────────────────────────────────────────────────────

FilefeedWorkbookInner.displayName = "FilefeedWorkbookInner";

const FilefeedWorkbook = forwardRef<FilefeedWorkbookRef, FilefeedSDKProps>(
  (props, ref) => {
    const store = useMemo<StoreApi<WorkbookStore>>(
      () => createWorkbookStore(),
      []
    );
    const handleBoundaryError = useCallback((err: Error) => {
      props.events?.onError?.({ type: "processing", message: err.message, originalError: err });
    }, [props.events]);
    return (
      <FilefeedErrorBoundary onError={handleBoundaryError}>
        <Providers colorScheme={props.theme}>
          <FilefeedWorkbookInner ref={ref} {...props} store={store} />
        </Providers>
      </FilefeedErrorBoundary>
    );
  }
);

export default FilefeedWorkbook;
FilefeedWorkbook.displayName = "FilefeedWorkbook";
