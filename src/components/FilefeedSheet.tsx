import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFilefeed } from "../hooks/useFilefeed";
import type { Filefeed } from "../types/filefeedTypes";
import { ActionIcon, Modal, Group, Button, Text } from "@mantine/core";
import { Providers } from "../app/providers";
import { Z_INDEX, LAYOUT } from "../constants";

import FilefeedWorkbook from "./FilefeedWorkbook";
import type { CreateWorkbookConfig, ProcessingOptions, DataRow, FilefeedWorkbookRef } from "../types";

type Props<S extends Filefeed.SheetConfig> = {
  config: S;
  onSubmit?: Filefeed.SubmitHandler<S>;
  onRecordHook?: (record: Filefeed.TypedRecordAPI<S>) => Filefeed.TypedRecordAPI<S> | void;
  autoCloseOnComplete?: boolean;
  processing?: ProcessingOptions;
  theme?: "light" | "dark";
  /** Optional URL the SDK can POST to for AI-powered value mapping suggestions. */
  aiSuggestEndpoint?: string;
  /** Optional URL the SDK can POST to for AI-powered column mapping fallback. */
  aiColumnSuggestEndpoint?: string;
  /** @deprecated Use `processing` instead */
  importOptions?: ProcessingOptions;
};

function makeRecordAPI<S extends Filefeed.SheetConfig>(row: Record<string, unknown>): Filefeed.TypedRecordAPI<S> {
  const data: Record<string, unknown> = { ...row };
  return {
    get: (k) => data[k as string],
    set: (k, v) => {
      data[k as string] = v;
    },
    toObject: () => ({ ...data }),
  } as Filefeed.TypedRecordAPI<S>;
}

function applyRecordHook<S extends Filefeed.SheetConfig>(
  rows: Record<string, unknown>[],
  hook?: (r: Filefeed.TypedRecordAPI<S>) => Filefeed.TypedRecordAPI<S> | void
): Record<string, unknown>[] {
  if (!hook) return rows;
  return rows.map((row) => {
    const rec = makeRecordAPI<S>(row);
    try {
      const out = hook(rec);
      return out ? out.toObject() : rec.toObject();
    } catch {
      return rec.toObject();
    }
  });
}

export function FilefeedSheet<S extends Filefeed.SheetConfig>({
  config,
  onSubmit,
  onRecordHook,
  autoCloseOnComplete = true,
  processing,
  theme,
  aiSuggestEndpoint,
  aiColumnSuggestEndpoint,
  importOptions,
}: Props<S>) {
  const { open, portalContainer, closePortal } = useFilefeed();
  const wbRef = useRef<FilefeedWorkbookRef | null>(null);

  const effectiveProcessing = processing ?? importOptions;
  const wbConfig = useMemo<CreateWorkbookConfig>(() => ({
    name: config.name,
    sheets: [
      {
        name: config.name,
        slug: config.slug,
        fields: config.fields.map((f) => ({ label: f.key, ...f })),
        ...(config.mappingConfidenceThreshold != null
          ? { mappingConfidenceThreshold: config.mappingConfidenceThreshold }
          : {}),
      },
    ],
    processing: effectiveProcessing,
    aiSuggestEndpoint,
    aiColumnSuggestEndpoint,
  }), [config.name, config.slug, config.fields, config.mappingConfidenceThreshold, effectiveProcessing, aiSuggestEndpoint, aiColumnSuggestEndpoint]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const onEscapeRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    if (onEscapeRef.current) {
      window.removeEventListener("keydown", onEscapeRef.current);
      onEscapeRef.current = null;
    }

    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmOpen(true);
      }
    };
    onEscapeRef.current = handler;
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      onEscapeRef.current = null;
    };
  }, [open]);

  const handleComplete = useCallback((rows: DataRow[]) => {
    try {
      const normalized = Array.isArray(rows)
        ? rows.map((r) => (r && typeof r === "object" && "data" in r ? r.data : r))
        : [];
      const transformed = applyRecordHook<S>(normalized as Record<string, unknown>[], onRecordHook);
      (onSubmit as Filefeed.SubmitHandler<S> | undefined)?.({
        rows: transformed as Filefeed.RecordFor<S>[],
        slug: config.slug,
      });
    } catch (err) {
      console.error("[Filefeed] onSubmit callback error:", err);
    }
    if (autoCloseOnComplete) closePortal();
  }, [onSubmit, onRecordHook, config.slug, autoCloseOnComplete, closePortal]);

  const handleChunk = useCallback(async ({ rows }: { rows: DataRow[]; chunkIndex: number; totalChunks: number }) => {
    const normalized = Array.isArray(rows)
      ? rows.map((r) => (r && typeof r === "object" && "data" in r ? r.data : r))
      : [];
    const transformed = applyRecordHook<S>(normalized as Record<string, unknown>[], onRecordHook);
    await (onSubmit as Filefeed.SubmitHandler<S> | undefined)?.({
      rows: transformed as Filefeed.RecordFor<S>[],
      slug: config.slug,
    });
  }, [onSubmit, onRecordHook, config.slug]);

  const handleSubmitComplete = useCallback(() => {
    if (autoCloseOnComplete) closePortal();
  }, [autoCloseOnComplete, closePortal]);

  const wbEvents = useMemo(() => ({
    onWorkbookComplete: handleComplete,
    onSubmitChunk: handleChunk,
    onSubmitComplete: handleSubmitComplete,
  }), [handleComplete, handleChunk, handleSubmitComplete]);

  const inner = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: Z_INDEX.SHEET_OVERLAY,
        background: "rgba(0,0,0,0.4)",
        padding: "32px 24px",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Providers colorScheme={theme}>
        <div style={{ position: "relative", width: LAYOUT.SHEET_MODAL_WIDTH, maxWidth: LAYOUT.SHEET_MODAL_MAX_WIDTH, background: "var(--ff-bg-surface, white)", borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.2)", margin: "0 auto" }}>
          <ActionIcon
            aria-label="Close importer"
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            variant="default"
            size="sm"
            style={{ position: "absolute", top: 8, right: 8, zIndex: Z_INDEX.SHEET_CLOSE_BTN }}
          >
            ✕
          </ActionIcon>
          <FilefeedWorkbook
            ref={wbRef}
            config={wbConfig}
            events={wbEvents}
            theme={theme}
          />
          <Modal
            opened={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Close importer?"
            centered
            zIndex={Z_INDEX.SHEET_CONFIRM_MODAL}
            overlayProps={{ opacity: 0.45, blur: 2 }}
          >
            <Text size="sm" c="gray.7" mb="md">
              Are you sure you want to close the importer? Unsaved changes will be lost.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}>
                Cancel
              </Button>
              <Button color="red" onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); wbRef.current?.cancelProcessing?.(); closePortal(); }}>
                Close importer
              </Button>
            </Group>
          </Modal>
        </div>
      </Providers>
    </div>
  );

  if (!open || !portalContainer) {
    return null;
  }

  return createPortal(inner, portalContainer);
}
