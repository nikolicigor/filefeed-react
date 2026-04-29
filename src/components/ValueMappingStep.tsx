"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Button,
  Select,
  Box,
  Flex,
  Paper,
  ScrollArea,
  ThemeIcon,
} from "@mantine/core";
import {
  IconSparkles,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { Z_INDEX } from "../constants";
import type { UniqueValueBucket, ValueMappingSuggestion } from "../utils/valueMapping";
import { suggestValueMapping } from "../utils/valueMapping";

const selectComboboxProps = { withinPortal: true, zIndex: Z_INDEX.SELECT_COMBOBOX } as const;

export interface ValueMappingStepProps {
  buckets: UniqueValueBucket[];
  initialMappings?: Record<string, Record<string, string>>;
  onChange: (mappings: Record<string, Record<string, string>>) => void;
  onBack: () => void;
  onContinue: () => void;
}

interface BucketState {
  fieldKey: string;
  selections: Record<string, string | null>;
  suggestions: Record<string, ValueMappingSuggestion>;
}

function buildInitialState(
  buckets: UniqueValueBucket[],
  initial?: Record<string, Record<string, string>>
): Record<string, BucketState> {
  const state: Record<string, BucketState> = {};
  for (const b of buckets) {
    const selections: Record<string, string | null> = {};
    const suggestions: Record<string, ValueMappingSuggestion> = {};
    for (const v of b.values) {
      const initialPick = initial?.[b.fieldKey]?.[v.value];
      const sug = suggestValueMapping(v.value, b.enumValues);
      suggestions[v.value] = sug;
      selections[v.value] = initialPick ?? null;
    }
    state[b.fieldKey] = { fieldKey: b.fieldKey, selections, suggestions };
  }
  return state;
}

function confidenceTone(c: number): { color: string; label: string } {
  if (c >= 0.9) return { color: "teal", label: "high" };
  if (c >= 0.75) return { color: "yellow", label: "medium" };
  if (c > 0) return { color: "orange", label: "low" };
  return { color: "red", label: "none" };
}

export function ValueMappingStep({
  buckets,
  initialMappings,
  onChange,
  onBack,
  onContinue,
}: ValueMappingStepProps) {
  const [state, setState] = useState<Record<string, BucketState>>(() =>
    buildInitialState(buckets, initialMappings)
  );

  useEffect(() => {
    setState(buildInitialState(buckets, initialMappings));
  }, [buckets, initialMappings]);

  const totals = useMemo(() => {
    let total = 0;
    let resolved = 0;
    let suggested = 0;
    for (const b of buckets) {
      for (const v of b.values) {
        total++;
        const picked = state[b.fieldKey]?.selections[v.value];
        if (picked) resolved++;
        const sug = state[b.fieldKey]?.suggestions[v.value];
        if (sug?.target && sug.confidence >= 0.75) suggested++;
      }
    }
    return { total, resolved, suggested, remaining: total - resolved };
  }, [buckets, state]);

  const emit = (next: Record<string, BucketState>) => {
    const out: Record<string, Record<string, string>> = {};
    for (const fieldKey of Object.keys(next)) {
      const sel = next[fieldKey].selections;
      const cleaned: Record<string, string> = {};
      for (const k of Object.keys(sel)) {
        const v = sel[k];
        if (v) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length) out[fieldKey] = cleaned;
    }
    onChange(out);
  };

  const updateSelection = (fieldKey: string, source: string, target: string | null) => {
    setState((prev) => {
      const next = {
        ...prev,
        [fieldKey]: {
          ...prev[fieldKey],
          selections: { ...prev[fieldKey].selections, [source]: target },
        },
      };
      emit(next);
      return next;
    });
  };

  const applyAllSuggestions = () => {
    setState((prev) => {
      const next: Record<string, BucketState> = {};
      for (const fieldKey of Object.keys(prev)) {
        const b = prev[fieldKey];
        const selections = { ...b.selections };
        for (const source of Object.keys(b.suggestions)) {
          const sug = b.suggestions[source];
          if (sug.target && sug.confidence >= 0.75 && !selections[source]) {
            selections[source] = sug.target;
          }
        }
        next[fieldKey] = { ...b, selections };
      }
      emit(next);
      return next;
    });
  };

  const applyBucketSuggestions = (fieldKey: string) => {
    setState((prev) => {
      const b = prev[fieldKey];
      const selections = { ...b.selections };
      for (const source of Object.keys(b.suggestions)) {
        const sug = b.suggestions[source];
        if (sug.target && sug.confidence >= 0.75 && !selections[source]) {
          selections[source] = sug.target;
        }
      }
      const next = { ...prev, [fieldKey]: { ...b, selections } };
      emit(next);
      return next;
    });
  };

  return (
    <Stack gap="md" p="lg" style={{ maxWidth: 980, margin: "0 auto" }}>
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={3} mb={4} style={{ letterSpacing: "-0.01em" }}>
            Map values to your schema
          </Title>
          <Text size="sm" c="dimmed">
            Some values in your file don't match the target options. Confirm or adjust the
            suggested mappings before continuing.
          </Text>
        </Box>
        <Button
          leftSection={<IconSparkles size={16} />}
          variant="filled"
          color="dark"
          onClick={applyAllSuggestions}
          disabled={totals.suggested === 0}
        >
          Apply {totals.suggested} suggestion{totals.suggested === 1 ? "" : "s"}
        </Button>
      </Group>

      <Paper withBorder radius="md" p="md" bg="gray.0">
        <Group gap="xl">
          <Stat label="Unique values" value={String(totals.total)} />
          <Stat label="Resolved" value={`${totals.resolved} / ${totals.total}`} accent={totals.resolved === totals.total ? "teal" : undefined} />
          <Stat label="Auto-suggested" value={String(totals.suggested)} />
        </Group>
      </Paper>

      <Stack gap="md">
        {buckets.map((bucket) => {
          const bState = state[bucket.fieldKey];
          if (!bState) return null;
          const enumOptions = bucket.enumValues.map((e) => ({ value: e, label: e }));
          const bucketResolved = Object.values(bState.selections).filter(Boolean).length;
          const bucketSuggestable = bucket.values.filter((v) => {
            const sug = bState.suggestions[v.value];
            return sug?.target && sug.confidence >= 0.75 && !bState.selections[v.value];
          }).length;
          return (
            <Card
              key={bucket.fieldKey}
              withBorder
              radius="md"
              padding="lg"
              shadow="xs"
              style={{ borderColor: bucketResolved === bucket.values.length ? "var(--mantine-color-teal-3)" : undefined }}
            >
              <Group justify="space-between" mb="md">
                <Box>
                  <Group gap={8}>
                    <Title order={5}>{bucket.fieldLabel}</Title>
                    <Badge color="gray" variant="light" size="sm">
                      {bucket.values.length} unmatched value{bucket.values.length === 1 ? "" : "s"}
                    </Badge>
                    {bucketResolved === bucket.values.length && (
                      <Badge color="teal" variant="light" size="sm" leftSection={<IconCheck size={12} />}>
                        Resolved
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>
                    Target options: {bucket.enumValues.join(", ")}
                  </Text>
                </Box>
                {bucketSuggestable > 0 && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="dark"
                    leftSection={<IconSparkles size={14} />}
                    onClick={() => applyBucketSuggestions(bucket.fieldKey)}
                  >
                    Apply {bucketSuggestable} suggestion{bucketSuggestable === 1 ? "" : "s"}
                  </Button>
                )}
              </Group>

              <ScrollArea.Autosize mah={360} type="auto">
                <Stack gap="xs">
                  {bucket.values.map((v) => {
                    const sug = bState.suggestions[v.value];
                    const selected = bState.selections[v.value];
                    const tone = confidenceTone(sug?.confidence ?? 0);
                    return (
                      <Flex
                        key={v.value}
                        align="center"
                        gap="md"
                        p="sm"
                        style={{
                          borderRadius: 8,
                          border: "1px solid var(--mantine-color-gray-2)",
                          background: selected ? "var(--mantine-color-gray-0)" : "white",
                        }}
                      >
                        <Box style={{ flex: "0 0 240px" }}>
                          <Text size="sm" fw={500} truncate>
                            {v.value}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {v.count.toLocaleString()} row{v.count === 1 ? "" : "s"}
                          </Text>
                        </Box>

                        <Box style={{ flex: "0 0 32px", color: "var(--mantine-color-gray-5)" }}>
                          <IconArrowRight size={16} />
                        </Box>

                        <Box style={{ flex: 1 }}>
                          <Select
                            value={selected ?? null}
                            onChange={(val) => updateSelection(bucket.fieldKey, v.value, val)}
                            data={enumOptions}
                            placeholder="Select target"
                            clearable
                            searchable
                            nothingFoundMessage="No option"
                            comboboxProps={selectComboboxProps}
                            size="sm"
                          />
                        </Box>

                        <Box style={{ flex: "0 0 130px", textAlign: "right" }}>
                          {sug?.target ? (
                            <Group gap={6} justify="flex-end" wrap="nowrap">
                              {selected ? (
                                <ThemeIcon size="sm" radius="xl" color="teal" variant="light">
                                  <IconCheck size={12} />
                                </ThemeIcon>
                              ) : sug.confidence < 0.75 ? (
                                <ThemeIcon size="sm" radius="xl" color="orange" variant="light">
                                  <IconAlertTriangle size={12} />
                                </ThemeIcon>
                              ) : null}
                              <Badge color={tone.color} variant="light" size="sm">
                                {Math.round((sug.confidence ?? 0) * 100)}% {tone.label}
                              </Badge>
                            </Group>
                          ) : (
                            <Badge color="red" variant="light" size="sm">
                              No match
                            </Badge>
                          )}
                        </Box>
                      </Flex>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            </Card>
          );
        })}
      </Stack>

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
        >
          Back to mapping
        </Button>
        <Button
          color="dark"
          rightSection={<IconArrowRight size={16} />}
          onClick={onContinue}
        >
          Continue to review
        </Button>
      </Group>
    </Stack>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: "0.05em" }}>
        {label}
      </Text>
      <Text fw={700} size="lg" c={accent}>
        {value}
      </Text>
    </Box>
  );
}

export default ValueMappingStep;
