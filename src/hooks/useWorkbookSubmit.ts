import { useCallback, useEffect, useRef } from "react";
import type {
  DataRow,
  FieldConfig,
  FilefeedEvents,
  ValidationError,
  ValidationRegistry,
} from "../types";
import { PROCESSING } from "../constants";
import { transformValue, validateFieldWithRegistry } from "../utils/dataProcessing";

/**
 * Converts manual-entry data (keyed by row id) into validated DataRow[],
 * suitable for submission through the same pipeline as file-imported data.
 */
export function buildManualRows(
  manualEntryData: Record<string, Record<string, unknown>>,
  fields: FieldConfig[],
  validationRegistry?: ValidationRegistry
): DataRow[] {
  return Object.entries(manualEntryData)
    .map(([rowId, data]) => ({
      index: Number(rowId.replace(/^manual-/, "")) || 0,
      data,
    }))
    .filter(({ data }) =>
      Object.values(data || {}).some((v) => String(v ?? "").trim() !== "")
    )
    .sort((a, b) => a.index - b.index)
    .map(({ index, data }) => {
      const processed: Record<string, unknown> = {};
      const errors: ValidationError[] = [];

      for (const field of fields) {
        const coerced = transformValue(data[field.key], field.type);
        processed[field.key] = coerced;
        errors.push(
          ...validateFieldWithRegistry(
            coerced,
            field,
            index,
            processed,
            validationRegistry
          )
        );
      }

      return {
        id: `manual-row-${index}`,
        data: processed,
        errors,
        isValid: errors.filter((e) => e.severity === "error").length === 0,
      };
    });
}

interface UseWorkbookSubmitArgs {
  chunkSize: number | undefined;
  eventsRef: { readonly current: FilefeedEvents | undefined };
  onComplete: () => void;
}

export function useWorkbookSubmit({
  chunkSize: configChunkSize,
  eventsRef,
  onComplete,
}: UseWorkbookSubmitArgs) {
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const submitRows = useCallback(
    async (rows: DataRow[]) => {
      if (submittingRef.current || !rows || rows.length === 0) return;
      submittingRef.current = true;

      const size =
        configChunkSize && configChunkSize > 0
          ? configChunkSize
          : PROCESSING.DEFAULT_CHUNK_SIZE;

      try {
        const ev = eventsRef.current;

        if (!ev?.onSubmitChunk) {
          ev?.onWorkbookComplete?.(rows);
          if (mountedRef.current) onComplete();
          return;
        }

        const totalChunks = Math.ceil(rows.length / size);
        ev?.onSubmitStart?.();

        for (let i = 0; i < rows.length; i += size) {
          if (!mountedRef.current) return;
          const chunk = rows.slice(i, i + size);
          const chunkIndex = Math.floor(i / size);

          try {
            await ev.onSubmitChunk({ rows: chunk, chunkIndex, totalChunks });
          } catch {
            // Single retry for transient failures (network hiccups, etc.)
            try {
              await ev.onSubmitChunk({ rows: chunk, chunkIndex, totalChunks });
            } catch (retryErr) {
              eventsRef.current?.onError?.({
                type: "submit",
                message:
                  `Chunk ${chunkIndex + 1}/${totalChunks} failed after retry: ` +
                  (retryErr instanceof Error ? retryErr.message : "Unknown error"),
                originalError: retryErr,
              });
              // Stop submitting further chunks — the user's data stays in the
              // review step so they can retry. Chunks already sent are committed;
              // the consumer's backend must handle idempotency for re-submits.
              return;
            }
          }

          await new Promise<void>((r) => setTimeout(r, 0));
        }

        ev?.onSubmitComplete?.();
        if (mountedRef.current) onComplete();
      } catch (err) {
        eventsRef.current?.onError?.({
          type: "submit",
          message: err instanceof Error ? err.message : "Submission failed",
          originalError: err,
        });
      } finally {
        submittingRef.current = false;
      }
    },
    [configChunkSize, eventsRef, onComplete]
  );

  return { submitRows };
}
