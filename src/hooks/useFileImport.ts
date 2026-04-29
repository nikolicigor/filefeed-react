import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateWorkbookConfig,
  ImportedData,
} from "../types";

interface UseFileImportArgs {
  config: CreateWorkbookConfig;
  onImported: (data: ImportedData) => void;
  onError?: (error: { type: "import"; message: string; originalError?: unknown }) => void;
}

export function useFileImport({
  config,
  onImported,
  onError,
}: UseFileImportArgs) {
  const [isUploading, setIsUploading] = useState(false);
  const mountedRef = useRef(true);
  const onImportedRef = useRef(onImported);
  const onErrorRef = useRef(onError);
  onImportedRef.current = onImported;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const maxFileSize = config?.processing?.maxFileSize;
  const maxRows = config?.processing?.maxRows;
  const autoDetectMetadataRow = config?.processing?.autoDetectMetadataRow;
  const skipRows = config?.processing?.skipRows;

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase();
    const isCSV = ext.endsWith(".csv");
    const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xls");

    if (!isCSV && !isExcel) {
      onErrorRef.current?.({
        type: "import",
        message: "Unsupported file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
      });
      return;
    }

    if (maxFileSize && file.size > maxFileSize) {
      const sizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
      onErrorRef.current?.({
        type: "import",
        message: `File exceeds maximum size of ${sizeMB}MB`,
      });
      return;
    }

    try {
      setIsUploading(true);
      const { parseCSV, parseExcel } = await import("../utils/fileParsing");
      const parseOptions = { autoDetectMetadataRow, skipRows };
      const data = isCSV
        ? await parseCSV(file, maxRows, parseOptions)
        : await parseExcel(file, maxRows, parseOptions);
      if (mountedRef.current) {
        onImportedRef.current(data);
      }
    } catch (error) {
      if (mountedRef.current) {
        onErrorRef.current?.({
          type: "import",
          message: error instanceof Error ? error.message : "Failed to import file",
          originalError: error,
        });
      }
    } finally {
      if (mountedRef.current) {
        setIsUploading(false);
      }
    }
  }, [maxFileSize, maxRows, autoDetectMetadataRow, skipRows]);

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await handleFile(file);
      input.onchange = null;
    };
    input.click();
  }, [handleFile]);

  return { isUploading, triggerFilePicker, handleFile } as const;
}
