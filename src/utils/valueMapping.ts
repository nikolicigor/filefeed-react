import type { FieldConfig, FieldMapping, ImportedData } from "../types";

export interface ValueMappingSuggestion {
  source: string;
  target: string | null;
  confidence: number;
  reason: "exact" | "synonym" | "fuzzy" | "ai" | "none";
}

export interface UniqueValueBucket {
  fieldKey: string;
  fieldLabel: string;
  enumValues: string[];
  values: Array<{ value: string; count: number }>;
}

/**
 * Curated synonym groups covering the cross-industry vocabulary most likely to
 * surface in member, claims, employment and benefits files. Each group's
 * canonical form should match an entry in some target enum the SDK is asked to
 * normalize against. Synonyms are matched case-insensitively after trimming.
 *
 * Conservative on purpose: only mappings that are unambiguous in context are
 * listed. When the same source word can mean multiple things (e.g. "partner"
 * is both a relationship and a cover level), the suggester relies on the
 * target enum to disambiguate.
 */
const SYNONYM_GROUPS: Array<{ canonical: string; synonyms: string[] }> = [
  // Relationship enums
  { canonical: "spouse", synonyms: ["husband", "wife", "married partner", "marital partner", "civil partner"] },
  { canonical: "partner", synonyms: ["husband", "wife", "spouse", "domestic partner", "life partner"] },
  { canonical: "child", synonyms: ["son", "daughter", "kid", "child dependant", "child dependent", "adopted child", "stepchild", "step child", "step-child"] },
  { canonical: "other", synonyms: ["adult dependant", "adult dependent", "father", "mother", "parent", "sibling", "brother", "sister", "grandparent", "grandchild", "guardian"] },

  // Cover-level enums
  { canonical: "self only", synonyms: ["single", "individual", "self", "employee only", "member only"] },
  { canonical: "self and partner", synonyms: ["married", "couple", "self plus partner", "self+partner", "self & partner", "duo", "employee plus partner"] },
  { canonical: "self and children", synonyms: ["single parent", "self plus children", "self+children", "parent only", "single with kids", "employee plus children"] },
  { canonical: "self and family", synonyms: ["family", "self plus family", "self+family", "full family", "family cover", "employee plus family"] },
  { canonical: "partner only", synonyms: ["partner cover", "partner only cover", "spouse only"] },

  // Status / lifecycle enums
  { canonical: "approved", synonyms: ["active", "live", "in force", "current", "enrolled"] },
  { canonical: "closed", synonyms: ["leaver", "left", "ex member", "ex-member", "ex", "ended", "terminated", "removed"] },
  { canonical: "cancelled", synonyms: ["canceled", "void", "withdrawn", "rescinded"] },
  { canonical: "pending", synonyms: ["awaiting", "in review", "submitted", "in progress"] },
  { canonical: "hold", synonyms: ["on hold", "paused", "suspended", "frozen"] },
];

const synonymToCanonical = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const s of group.synonyms) {
    const k = s.toLowerCase();
    const arr = synonymToCanonical.get(k) ?? [];
    arr.push(group.canonical.toLowerCase());
    synonymToCanonical.set(k, arr);
  }
  const cKey = group.canonical.toLowerCase();
  const arr = synonymToCanonical.get(cKey) ?? [];
  arr.push(cKey);
  synonymToCanonical.set(cKey, arr);
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function levenshteinSim(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  const prev = new Uint16Array(a.length + 1);
  const curr = new Uint16Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    prev.set(curr);
  }
  return 1 - prev[a.length] / max;
}

function tokenContainmentBoost(source: string, target: string): number {
  const sTokens = source.split(/\s+/).filter(Boolean);
  const tTokens = target.split(/\s+/).filter(Boolean);
  if (sTokens.length === 0 || tTokens.length === 0) return 0;
  const tSet = new Set(tTokens);
  const overlap = sTokens.filter((tok) => tSet.has(tok)).length;
  return overlap / Math.max(sTokens.length, tTokens.length);
}

/**
 * Suggest a target enum value for a source value, returning a confidence
 * score and the rule that produced the match. Tries, in order:
 *
 *  1. Exact case-insensitive match against the target enum.
 *  2. Synonym lookup: source value's canonical form intersects target enum.
 *  3. Token overlap (e.g. "self+partner" → "self and partner").
 *  4. Fuzzy similarity (Levenshtein), gated above 0.6 to avoid noise.
 */
export function suggestValueMapping(
  sourceValue: string,
  targetEnum: string[]
): ValueMappingSuggestion {
  const src = normalize(sourceValue);
  if (!src) return { source: sourceValue, target: null, confidence: 0, reason: "none" };

  const enumLower = targetEnum.map((e) => ({ original: e, lower: e.toLowerCase() }));

  const exact = enumLower.find((e) => e.lower === src);
  if (exact) {
    return { source: sourceValue, target: exact.original, confidence: 1, reason: "exact" };
  }

  const canonicals = synonymToCanonical.get(src);
  if (canonicals) {
    for (const canon of canonicals) {
      const hit = enumLower.find((e) => e.lower === canon);
      if (hit) {
        return { source: sourceValue, target: hit.original, confidence: 0.94, reason: "synonym" };
      }
    }
  }

  let bestTokens: { target: string; score: number } | null = null;
  for (const e of enumLower) {
    const score = tokenContainmentBoost(src, e.lower);
    if (score >= 0.6 && (!bestTokens || score > bestTokens.score)) {
      bestTokens = { target: e.original, score };
    }
  }
  if (bestTokens) {
    return { source: sourceValue, target: bestTokens.target, confidence: 0.78, reason: "synonym" };
  }

  let bestFuzzy: { target: string; score: number } | null = null;
  for (const e of enumLower) {
    const sim = levenshteinSim(src, e.lower);
    if (sim >= 0.6 && (!bestFuzzy || sim > bestFuzzy.score)) {
      bestFuzzy = { target: e.original, score: sim };
    }
  }
  if (bestFuzzy) {
    return {
      source: sourceValue,
      target: bestFuzzy.target,
      confidence: bestFuzzy.score,
      reason: "fuzzy",
    };
  }

  return { source: sourceValue, target: null, confidence: 0, reason: "none" };
}

/**
 * Walk processed rows (after mapping/transform) and return, per enum field,
 * the unique values that still don't match the target enum. Used by the
 * Review step to surface inline-fixable issues without consulting the
 * original source-column structure.
 */
export function extractInvalidEnumValuesFromProcessed(
  processedRows: Array<{ data: Record<string, unknown> }>,
  fields: FieldConfig[]
): UniqueValueBucket[] {
  const buckets: UniqueValueBucket[] = [];
  for (const field of fields) {
    if (field.type !== "enum" || !field.enum?.length) continue;
    const enumLower = new Set(field.enum.map((e) => e.toLowerCase()));
    const counts = new Map<string, number>();
    for (const row of processedRows) {
      const raw = row.data[field.key];
      if (raw == null || raw === "") continue;
      const s = String(raw).trim();
      if (!s) continue;
      if (enumLower.has(s.toLowerCase())) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    if (counts.size === 0) continue;
    const values = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    buckets.push({
      fieldKey: field.key,
      fieldLabel: field.label,
      enumValues: field.enum,
      values,
    });
  }
  return buckets;
}

/**
 * Walk every row and return, per enum field, the unique source values still
 * needing a target mapping (skips values that already match the target enum
 * exactly). Sorted by descending frequency so the UI can show high-impact
 * mismatches first.
 */
export function extractEnumColumnValues(
  importedData: ImportedData,
  fieldMappings: FieldMapping[],
  fields: FieldConfig[]
): UniqueValueBucket[] {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const buckets: UniqueValueBucket[] = [];

  const groupedBySource = new Map<string, { field: FieldConfig; sources: string[] }>();
  for (const m of fieldMappings) {
    const f = fieldByKey.get(m.target);
    if (!f || f.type !== "enum" || !f.enum?.length) continue;
    const existing = groupedBySource.get(f.key);
    if (existing) {
      existing.sources.push(m.source);
    } else {
      groupedBySource.set(f.key, { field: f, sources: [m.source] });
    }
  }

  for (const [, { field, sources }] of groupedBySource) {
    const enumLower = new Set(field.enum!.map((e) => e.toLowerCase()));
    const counts = new Map<string, number>();
    for (const row of importedData.rows) {
      for (const src of sources) {
        const raw = row[src];
        if (raw == null || raw === "") continue;
        const s = String(raw).trim();
        if (!s) continue;
        if (enumLower.has(s.toLowerCase())) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    if (counts.size === 0) continue;
    const values = Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    buckets.push({
      fieldKey: field.key,
      fieldLabel: field.label,
      enumValues: field.enum!,
      values,
    });
  }

  return buckets;
}

/**
 * Merge per-field value-mapping selections back into the FieldMapping list:
 * every FieldMapping that targets a key with mappings gets its valueMappings
 * field stamped with the same dictionary, so processRowBatch applies it to
 * every source column (e.g. all six Dependant Relationship columns).
 */
export function applyValueMappingsToFieldMappings(
  fieldMappings: FieldMapping[],
  perFieldValueMappings: Record<string, Record<string, string>>
): FieldMapping[] {
  return fieldMappings.map((m) => {
    const vm = perFieldValueMappings[m.target];
    if (!vm || Object.keys(vm).length === 0) return m;
    return { ...m, valueMappings: { ...vm } };
  });
}
