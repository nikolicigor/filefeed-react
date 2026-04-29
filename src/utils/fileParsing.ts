import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detect as detectEncoding } from "jschardet";
import type { ImportedData, MetadataRowInfo } from "../types";
import { PROCESSING } from "../constants";

export interface ParseOptions {
  autoDetectMetadataRow?: boolean;
  skipRows?: number[];
}

const RULE_INDICATOR = /\b(only|accept(ed|able)?|correct|format(ting|ted)?|allowed|valid|values?|must|should|required|optional|note|enum|two decimals?|date format|use \w+|enter \w+|provide |if |when )/i;

/**
 * Heuristic for spotting an embedded "validation rules" / instructions row that
 * customers sometimes append to template files (e.g. the AND Digital sample
 * places one in row 16, the Helix template uses "Accepted values: …"). A row
 * qualifies when at least half of its non-empty cells contain rule-like
 * vocabulary AND at least one cell reads sentence-like (> 22 chars) AND
 * the row is sparser than typical data rows for the same headers (lots of
 * cells empty, since instruction rows usually only annotate a subset of cols).
 */
export function detectMetadataRow(
  rows: Record<string, unknown>[],
  headers: string[]
): MetadataRowInfo | null {
  if (rows.length < 3) return null;
  const last = rows[rows.length - 1];
  const cells = headers
    .map((h) => last[h])
    .filter((v) => v != null && String(v).trim() !== "");
  if (cells.length < 2) return null;
  const ruleHits = cells.filter((v) => RULE_INDICATOR.test(String(v))).length;
  const sentenceHits = cells.filter((v) => String(v).length > 22).length;
  if (sentenceHits === 0) return null;
  const ruleRatio = ruleHits / cells.length;
  const sentenceRatio = sentenceHits / cells.length;
  if (ruleRatio < 0.4 && sentenceRatio < 0.5) return null;
  const hints: Record<string, string> = {};
  for (const h of headers) {
    const v = last[h];
    if (v != null && String(v).trim()) hints[h] = String(v);
  }
  return { rowIndex: rows.length - 1, hints };
}

function applyRowFilters(
  rows: Record<string, unknown>[],
  headers: string[],
  options?: ParseOptions
): { finalRows: Record<string, unknown>[]; metadataRow?: MetadataRowInfo } {
  let working = rows;
  let metadataRow: MetadataRowInfo | undefined;

  if (options?.skipRows && options.skipRows.length) {
    const skip = new Set(options.skipRows.map((n) => n - 2));
    working = working.filter((_, idx) => !skip.has(idx));
  }

  if (options?.autoDetectMetadataRow !== false) {
    const detected = detectMetadataRow(working, headers);
    if (detected) {
      metadataRow = detected;
      working = working.slice(0, detected.rowIndex);
    }
  }

  return { finalRows: working, metadataRow };
}

export const parseCSV = (
  file: File,
  maxRows?: number,
  options?: ParseOptions
): Promise<ImportedData> => {
  const limit = maxRows ?? Infinity;

  return new Promise((resolve, reject) => {
    const sampler = new FileReader();
    sampler.onerror = () => reject(new Error("Failed to read file"));
    sampler.onload = () => {
      try {
        const buffer = sampler.result as ArrayBuffer;
        const sampleBytes = new Uint8Array(
          buffer.slice(0, Math.min(buffer.byteLength, PROCESSING.ENCODING_SAMPLE_SIZE))
        );

        // jschardet expects a string where each char maps 1:1 to a byte value.
        // ISO-8859-1 provides this identity mapping (byte 0xNN → U+00NN).
        // Windows-1252 remaps 0x80-0x9F to different codepoints, which corrupts
        // the byte patterns jschardet relies on for multibyte encoding detection.
        let sampleString: string;
        try {
          sampleString = new TextDecoder("iso-8859-1").decode(sampleBytes);
        } catch {
          sampleString = Array.from(sampleBytes)
            .map((c) => String.fromCharCode(c))
            .join("");
        }
        const detection = detectEncoding(sampleString);
        let encoding = (detection.encoding || "utf-8").toLowerCase();
        if (!detection.encoding || (detection.confidence || 0) < 0.2) {
          encoding = "utf-8";
        }

        const rows: Record<string, unknown>[] = [];
        let headers: string[] = [];
        let parseErrors: { type: string; message: string }[] = [];
        let headerMap: Map<string, string> | null = null;
        let aborted = false;

        const config: Papa.ParseConfig = {
          header: true,
          skipEmptyLines: true,
          worker: true,
          encoding,
          step: (result: Papa.ParseStepResult<Record<string, unknown>>, parser: Papa.Parser) => {
            if (aborted) return;

            if (!headers.length && Array.isArray(result.meta?.fields)) {
              const originalHeaders = (result.meta.fields as string[]) || [];
              const used = new Set<string>();
              headerMap = new Map<string, string>();
              headers = originalHeaders.map((h) => {
                const base = typeof h === "string" ? h.trim() : String(h || "");
                let name = base || "";
                if (used.has(name)) {
                  let i = 2;
                  while (used.has(`${name}_${i}`)) i++;
                  name = `${name}_${i}`;
                }
                used.add(name);
                headerMap!.set(h, name);
                return name;
              });
            }

            if (rows.length >= limit) {
              aborted = true;
              parser.abort();
              reject(
                new Error(
                  `File exceeds the maximum row limit of ${limit.toLocaleString()} rows. ` +
                    `Configure processing.maxRows to increase the limit.`
                )
              );
              return;
            }

            if (result?.data && typeof result.data === "object") {
              const row = result.data as Record<string, unknown>;
              const normalized: Record<string, unknown> = {};
              if (headerMap) {
                for (const [orig, norm] of headerMap.entries()) {
                  const v = row[orig];
                  normalized[norm] = typeof v === "string" ? v.trim() : v;
                }
              } else {
                for (const k of Object.keys(row)) {
                  const v = row[k];
                  normalized[k] = typeof v === "string" ? v.trim() : v;
                }
              }
              rows.push(normalized);
            }
            if (Array.isArray(result.errors) && result.errors.length) {
              parseErrors = parseErrors.concat(
                result.errors.map((e) => ({ type: e.type, message: e.message }))
              );
            }
          },
          complete: () => {
            if (aborted) return;
            if (!headers.length && rows.length) {
              headers = Object.keys(rows[0]);
            }
            const serious = parseErrors.find(
              (e) => e.type !== "FieldMismatch" && e.type !== "Delimiter"
            );
            if (serious) {
              reject(new Error(`CSV parsing error: ${serious.message}`));
              return;
            }
            const { finalRows, metadataRow } = applyRowFilters(
              rows,
              headers,
              options
            );
            resolve({
              headers,
              rows: finalRows,
              fileName: file.name,
              fileType: "csv",
              ...(metadataRow ? { metadataRow } : {}),
            });
          },
        } as Papa.ParseConfig;

        try {
          Papa.parse(file as unknown as string, config);
        } catch {
          Papa.parse(file as unknown as string, { ...config, worker: false });
        }
      } catch (err) {
        reject(err);
      }
    };
    const sampleBlob = file.slice(0, Math.min(file.size, PROCESSING.ENCODING_SAMPLE_SIZE));
    sampler.readAsArrayBuffer(sampleBlob);
  });
};

const EXCEL_IN_MEMORY_LIMIT = 50 * 1024 * 1024; // 50 MB

export const parseExcel = (
  file: File,
  maxRows?: number,
  options?: ParseOptions
): Promise<ImportedData> => {
  const limit = maxRows ?? Infinity;

  return new Promise((resolve, reject) => {
    if (file.size > EXCEL_IN_MEMORY_LIMIT) {
      reject(
        new Error(
          `Excel file is ${(file.size / (1024 * 1024)).toFixed(1)}MB which exceeds the ` +
          `${EXCEL_IN_MEMORY_LIMIT / (1024 * 1024)}MB safety limit. ` +
          `Consider converting to CSV for large datasets, or increase processing.maxFileSize.`
        )
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", dense: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          reject(new Error("Empty Excel file"));
          return;
        }

        const rawHeaders = (jsonData[0] as unknown[]).map((h) => {
          const base = typeof h === "string" ? h.trim() : String(h ?? "");
          return base || "";
        });
        const used = new Set<string>();
        const headers = rawHeaders.map((base) => {
          let name = base;
          if (used.has(name)) {
            let i = 2;
            while (used.has(`${name}_${i}`)) i++;
            name = `${name}_${i}`;
          }
          used.add(name);
          return name;
        });

        const dataRows = jsonData.slice(1);
        if (dataRows.length > limit) {
          reject(
            new Error(
              `File exceeds the maximum row limit of ${limit.toLocaleString()} rows. ` +
                `Configure processing.maxRows to increase the limit.`
            )
          );
          return;
        }

        const rows = dataRows.map((row: unknown) => {
          const rowArr = row as unknown[];
          const rowObj: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            const v = rowArr[index] ?? "";
            rowObj[header] = typeof v === "string" ? v.trim() : v;
          });
          return rowObj;
        });

        const { finalRows, metadataRow } = applyRowFilters(
          rows,
          headers,
          options
        );

        resolve({
          headers,
          rows: finalRows,
          fileName: file.name,
          fileType: "excel",
          ...(metadataRow ? { metadataRow } : {}),
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};
