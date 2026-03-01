"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Card,
  Group,
  Text,
  Select,
  Stack,
  Button,
  Box,
  Flex,
  Paper,
  ThemeIcon,
  ScrollArea,
  Modal,
  List,
  Loader,
} from "@mantine/core";
import { IconArrowRight, IconFileText, IconAlertCircle } from "@tabler/icons-react";
import { MappingInterfaceProps, FieldMapping } from "../types";
import { Z_INDEX, PROCESSING } from "../constants";
import {
  fieldMappingsToMappingState,
  mappingStateToFieldMappings,
} from "../utils/dataProcessing";

const mappedSelectInputStyle: React.CSSProperties = {
  fontSize: "12px",
  border: "none",
  backgroundColor: "white",
  cursor: "pointer",
};

const unmappedSelectInputStyle: React.CSSProperties = {
  fontSize: "12px",
  border: "1px solid var(--mantine-color-gray-4)",
  backgroundColor: "white",
  cursor: "pointer",
};

const transformSelectInputStyle: React.CSSProperties = {
  fontSize: "12px",
  backgroundColor: "white",
  cursor: "pointer",
};

const mappedSelectStyles = { input: mappedSelectInputStyle } as const;
const unmappedSelectStyles = { input: unmappedSelectInputStyle } as const;
const transformSelectStyles = { input: transformSelectInputStyle } as const;

const EMPTY_OPTIONS: { value: string; label: string }[] = [];

const selectComboboxProps = { withinPortal: true, zIndex: Z_INDEX.SELECT_COMBOBOX } as const;

interface MappingHeaderRowProps {
  header: string;
  mappedField: string | null;
  hoveredSource: string | null;
  selectOptions: { value: string; label: string }[];
  stableFieldMappings: FieldMapping[];
  hasRegistry: boolean;
  transformOptions: { value: string; label: string }[];
  onMappingUpdate: (source: string, target: string | null) => void;
  onTransformUpdate: (source: string, transform: string | null) => void;
  onHoverEnter: (header: string) => void;
  onHoverLeave: () => void;
}

const MappingHeaderRow = React.memo(function MappingHeaderRow({
  header,
  mappedField,
  hoveredSource,
  selectOptions,
  stableFieldMappings,
  hasRegistry,
  transformOptions,
  onMappingUpdate,
  onTransformUpdate,
  onHoverEnter,
  onHoverLeave,
}: MappingHeaderRowProps) {
  const isMapped = !!mappedField;
  const currentTransform = stableFieldMappings.find((m) => m.source === header)?.transform;
  const showTransform = isMapped && (hasRegistry || !!currentTransform);

  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        backgroundColor:
          hoveredSource === header
            ? "var(--mantine-color-gray-0)"
            : "white",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={() => onHoverEnter(header)}
      onMouseLeave={onHoverLeave}
      onFocus={() => onHoverEnter(header)}
      onBlur={onHoverLeave}
    >
      <Flex align="center" style={{ flex: 1 }} gap="md">
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={500} c="gray.8">
            {header}
          </Text>
        </Box>

        <Box>
          <IconArrowRight size={16} color="gray" />
        </Box>

        <Box style={{ flex: 1, display: "flex", gap: 8 }}>
          <Select
            placeholder="Select field"
            value={mappedField}
            onChange={(value) => onMappingUpdate(header, value ?? null)}
            data={selectOptions}
            searchable={false}
            clearable
            size="xs"
            comboboxProps={selectComboboxProps}
            styles={isMapped ? mappedSelectStyles : unmappedSelectStyles}
          />
          {showTransform && (
            <Select
              placeholder="Transform"
              value={currentTransform || null}
              onChange={(value) => onTransformUpdate(header, value === "none" ? null : value)}
              data={transformOptions}
              size="xs"
              clearable
              comboboxProps={selectComboboxProps}
              styles={transformSelectStyles}
            />
          )}
        </Box>
      </Flex>
    </Card>
  );
});

const MappingInterface: React.FC<MappingInterfaceProps> = ({
  importedHeaders,
  fields,
  mapping,
  onMappingChange,
  importedData,
  onBack,
  onContinue,
  fieldMappings,
  onFieldMappingsChange,
  transformRegistry,
  isProcessing,
  canContinue,
}) => {
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);
  const [draggedSource, setDraggedSource] = useState<string | null>(null);
  const [lastHoveredSource, setLastHoveredSource] = useState<string | null>(null);
  const [missingModalOpen, setMissingModalOpen] = useState(false);

  const handleMappingUpdate = useCallback((
    sourceColumn: string,
    targetField: string | null
  ) => {
    const newMapping = { ...mapping, [sourceColumn]: targetField };
    onMappingChange(newMapping);
    if (onFieldMappingsChange) {
      const fm: FieldMapping[] = fieldMappings
        ? [...fieldMappings]
        : mappingStateToFieldMappings(newMapping);
      const idx = fm.findIndex((m) => m.source === sourceColumn);
      if (idx >= 0) {
        if (targetField) fm[idx] = { ...fm[idx], target: targetField };
        else fm.splice(idx, 1);
      } else if (targetField) {
        fm.push({ source: sourceColumn, target: targetField });
      }
      onFieldMappingsChange(fm);
    }
  }, [mapping, onMappingChange, fieldMappings, onFieldMappingsChange]);

  const handleTransformUpdate = useCallback((
    sourceColumn: string,
    transformName: string | null
  ) => {
    if (!onFieldMappingsChange) return;
    const current = fieldMappings || mappingStateToFieldMappings(mapping);
    const idx = current.findIndex((m) => m.source === sourceColumn);
    if (idx >= 0) {
      const updated = [...current];
      const t = transformName || undefined;
      updated[idx] = { ...updated[idx], transform: t };
      onFieldMappingsChange(updated);
    }
  }, [fieldMappings, mapping, onFieldMappingsChange]);

  const handleDragStart = useCallback((e: React.DragEvent, sourceColumn: string) => {
    setDraggedSource(sourceColumn);
    e.dataTransfer.setData("text/plain", sourceColumn);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetField: string) => {
    e.preventDefault();
    const sourceColumn = e.dataTransfer.getData("text/plain");
    if (sourceColumn) {
      handleMappingUpdate(sourceColumn, targetField);
    }
    setDraggedSource(null);
  }, [handleMappingUpdate]);

  const handleRemoveMapping = useCallback((sourceColumn: string) => {
    handleMappingUpdate(sourceColumn, null);
  }, [handleMappingUpdate]);

  const getPreviewData = useCallback((sourceColumn: string) => {
    if (!importedData?.rows) return [];
    return importedData.rows
      .slice(0, PROCESSING.PREVIEW_ROWS)
      .map((row) => row[sourceColumn])
      .filter((val) => val !== undefined && val !== null && val !== "");
  }, [importedData?.rows]);

  const destinationFieldsCount = fields.length;
  const effectiveMapping = useMemo(
    () => fieldMappings ? fieldMappingsToMappingState(fieldMappings) : mapping,
    [fieldMappings, mapping]
  );

  const { mappedCount, usedTargets, availableTargets, missingRequired } = useMemo(() => {
    const used = Object.values(effectiveMapping).filter(Boolean) as string[];
    return {
      mappedCount: used.length,
      usedTargets: used,
      availableTargets: fields.filter((field) => !used.includes(field.key)),
      missingRequired: fields.filter((f) => f.required && !used.includes(f.key)),
    };
  }, [effectiveMapping, fields]);

  const selectOptionsPerHeader = useMemo(() => {
    const result: Record<string, { value: string; label: string }[]> = {};
    for (const header of importedHeaders) {
      const mappedField = effectiveMapping[header];
      const currentTarget = mappedField
        ? fields.find((f) => f.key === mappedField)
        : undefined;
      const options = [
        ...(currentTarget
          ? [{ value: currentTarget.key, label: `${currentTarget.label}${currentTarget.required ? " *" : ""}` }]
          : []),
        ...availableTargets.map((f) => ({ value: f.key, label: `${f.label}${f.required ? " *" : ""}` })),
      ];
      const seen = new Set<string>();
      result[header] = options.filter((opt) => {
        if (seen.has(opt.value)) return false;
        seen.add(opt.value);
        return true;
      });
    }
    return result;
  }, [importedHeaders, effectiveMapping, fields, availableTargets]);

  const stableFieldMappings = useMemo(
    () => fieldMappings || [],
    [fieldMappings]
  );

  const activePreviewKey = hoveredSource ?? lastHoveredSource;
  const previewData = useMemo(
    () => activePreviewKey ? getPreviewData(activePreviewKey) : [],
    [activePreviewKey, getPreviewData]
  );

  const transformKeys = useMemo(
    () => Object.keys(transformRegistry || {}),
    [transformRegistry]
  );
  const transformOptions = useMemo(
    () => [
      { value: "none", label: "None" },
      ...transformKeys.map((name) => ({ value: name, label: name })),
    ],
    [transformKeys]
  );
  const hasRegistry = transformKeys.length > 0;

  const handleHoverEnter = useCallback((header: string) => {
    setHoveredSource(header);
    setLastHoveredSource(header);
  }, []);

  const handleHoverLeave = useCallback(() => {
    setHoveredSource(null);
  }, []);

  return (
    <Box style={{ padding: "16px", minHeight: "600px" }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="md">
        <Group>
          <Text size="lg" fw={600} c="gray.8">
            Column Mapping
          </Text>
          <Text size="sm" c="gray.6">Mapped {mappedCount}/{destinationFieldsCount}</Text>
        </Group>

        <Group gap="xs">
          <Button variant="default" size="xs" onClick={onBack}>
            Back
          </Button>
          {isProcessing && (
            <Group gap="xs">
              <Loader size="xs" color="gray" />
              <Text size="xs" c="gray.6">Processing...</Text>
            </Group>
          )}
          <Button
            size="xs"
            radius="md"
            variant="filled"
            color="dark"
            disabled={isProcessing}
            onClick={() => {
              if (canContinue) onContinue?.();
              else setMissingModalOpen(true);
            }}
          >
            Continue
          </Button>
        </Group>
      </Flex>

      <Modal
        opened={missingModalOpen}
        onClose={() => setMissingModalOpen(false)}
        title={
          <Group gap="xs">
            <ThemeIcon color="red" variant="light" radius="xl" size="sm">
              <IconAlertCircle size={14} />
            </ThemeIcon>
            <Text size="sm" fw={600}>Missing required fields</Text>
          </Group>
        }
        centered
        zIndex={Z_INDEX.MISSING_FIELDS_MODAL}
        overlayProps={{ opacity: 0.45, blur: 2 }}
      >
        <Text size="sm" c="gray.7" mb="xs">
          Map these fields to continue.
        </Text>
        <Paper withBorder radius="md" p="xs">
          <ScrollArea style={{ maxHeight: 180 }}>
            <List
              spacing="xs"
              icon={
                <ThemeIcon color="red" variant="light" radius="xl" size="sm">
                  <IconAlertCircle size={12} />
                </ThemeIcon>
              }
            >
              {missingRequired.map((f) => (
                <List.Item key={f.key}>
                  <Text size="sm" c="gray.8">{f.label || f.key}</Text>
                </List.Item>
              ))}
            </List>
          </ScrollArea>
        </Paper>
        <Group justify="flex-end" mt="sm">
          <Button size="xs" color="red" onClick={() => setMissingModalOpen(false)}>
            Got it
          </Button>
        </Group>
      </Modal>

      {/* Main Mapping Interface - Two Column Layout */}
      <Flex gap="md" style={{ minHeight: "500px" }}>
        {/* Left Side - Mapping Fields */}
        <Box style={{ flex: 1 }}>
          <Paper p="md" withBorder radius="md" style={{ height: "500px" }}>
            <Text size="sm" fw={600} c="gray.8" mb="md">
              Field Mappings
            </Text>

            <ScrollArea style={{ height: "440px" }}>
              <Stack gap="xs">
                {importedHeaders.map((header) => (
                  <MappingHeaderRow
                    key={header}
                    header={header}
                    mappedField={effectiveMapping[header] || null}
                    hoveredSource={hoveredSource}
                    selectOptions={selectOptionsPerHeader[header] || EMPTY_OPTIONS}
                    stableFieldMappings={stableFieldMappings}
                    hasRegistry={hasRegistry}
                    transformOptions={transformOptions}
                    onMappingUpdate={handleMappingUpdate}
                    onTransformUpdate={handleTransformUpdate}
                    onHoverEnter={handleHoverEnter}
                    onHoverLeave={handleHoverLeave}
                  />
                ))}
              </Stack>
            </ScrollArea>
          </Paper>
        </Box>

        {/* Right Side - Row Preview */}
        <Box style={{ flex: 1 }}>
          <Paper p="md" withBorder radius="md" style={{ height: "500px" }}>
            <Text size="sm" fw={600} c="gray.8" mb="md">
              Data Preview
            </Text>

            <Box style={{ height: "440px", overflow: "auto" }}>
              {activePreviewKey ? (
                <Box>
                  <Text size="sm" fw={500} c="gray.7" mb="md">
                    Column: {activePreviewKey}
                  </Text>

                  <Stack gap="xs">
                    <Text size="xs" fw={500} c="gray.6" tt="uppercase">
                      Sample Values:
                    </Text>
                    {previewData
                      .slice(0, PROCESSING.PREVIEW_SAMPLE_VALUES)
                      .map((value, index) => (
                        <Box
                          key={index}
                          style={{
                            padding: "8px 12px",
                            backgroundColor: "var(--mantine-color-gray-0)",
                            borderRadius: "4px",
                            border: "1px solid var(--mantine-color-gray-2)",
                          }}
                        >
                          <Text size="sm" c="gray.8">
                            Row {index + 1}: {String(value)}
                          </Text>
                        </Box>
                      ))}

                    {previewData.length === 0 && (
                      <Text
                        size="sm"
                        c="gray.5"
                        style={{ fontStyle: "italic" }}
                      >
                        No data available for this column
                      </Text>
                    )}

                    {previewData.length > PROCESSING.PREVIEW_SAMPLE_VALUES && (
                      <Text
                        size="xs"
                        c="gray.5"
                        style={{ fontStyle: "italic" }}
                      >
                        ... and {previewData.length - PROCESSING.PREVIEW_SAMPLE_VALUES} more rows
                      </Text>
                    )}
                  </Stack>
                </Box>
              ) : (
                <Flex
                  align="center"
                  justify="center"
                  style={{ height: "100%" }}
                  direction="column"
                  gap="md"
                >
                  <ThemeIcon variant="light" color="gray" size="xl">
                    <IconFileText size={24} />
                  </ThemeIcon>
                  <Text size="sm" c="gray.5" ta="center">
                    Hover over a field mapping on the left
                    <br />
                    to see data preview
                  </Text>
                </Flex>
              )}
            </Box>
          </Paper>
        </Box>
      </Flex>
    </Box>
  );
};

export default MappingInterface;
