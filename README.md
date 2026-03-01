# @filefeed/react

A powerful React SDK for importing, mapping, validating, and transforming structured data from CSV and Excel files.

## Features

- **File Parsing** — CSV (with encoding detection) and Excel (.xlsx/.xls) support
- **Column Mapping** — Auto-mapping with Levenshtein similarity + manual drag/drop
- **Validation** — Required, type, regex, min/max, custom, and uniqueness rules
- **Transforms** — Built-in transforms (trim, lowercase, etc.) + custom registry
- **Chunked Processing** — Non-blocking processing for large datasets
- **Manual Entry** — Spreadsheet-style manual data input
- **Event System** — Callbacks for every step of the workflow

## Installation

```bash
npm install @filefeed/react
```

Requires React 18+ and `@mantine/core` 7+.

## Quick Start

### Basic Usage — `FilefeedWorkbook`

```tsx
import FilefeedWorkbook from "@filefeed/react";
import type { CreateWorkbookConfig, DataRow } from "@filefeed/react";

const config: CreateWorkbookConfig = {
  name: "Contacts Import",
  sheets: [
    {
      name: "Contacts",
      slug: "contacts",
      fields: [
        { key: "name", label: "Full Name", type: "string", required: true },
        { key: "email", label: "Email", type: "email", required: true, unique: true },
        { key: "age", label: "Age", type: "number", validations: [{ type: "min", value: 0, message: "Age must be positive" }] },
      ],
    },
  ],
};

function App() {
  return (
    <FilefeedWorkbook
      config={config}
      events={{
        onWorkbookComplete: (rows: DataRow[]) => {
          console.log("Imported rows:", rows);
        },
        onError: (error) => {
          console.error(`[${error.type}] ${error.message}`);
        },
      }}
    />
  );
}
```

### Modal Usage — `FilefeedSheet` + `FilefeedProvider`

```tsx
import { FilefeedProvider, FilefeedSheet, useFilefeed } from "@filefeed/react";

function ImportButton() {
  const { openPortal } = useFilefeed();
  return <button onClick={openPortal}>Import Data</button>;
}

function App() {
  return (
    <FilefeedProvider>
      <ImportButton />
      <FilefeedSheet
        config={{
          name: "Users",
          slug: "users",
          fields: [
            { key: "name", label: "Name", type: "string", required: true },
            { key: "email", label: "Email", type: "email" },
          ],
        }}
        onSubmit={({ rows, slug }) => {
          console.log(`Submitted ${rows.length} rows for ${slug}`);
        }}
      />
    </FilefeedProvider>
  );
}
```

### Chunked Processing (Large Datasets)

```tsx
<FilefeedWorkbook
  config={{
    ...config,
    processing: { chunkSize: 5000, maxFileSize: 50 * 1024 * 1024 },
  }}
  events={{
    onSubmitStart: () => console.log("Starting chunked submit..."),
    onSubmitChunk: async ({ rows, chunkIndex, totalChunks }) => {
      await fetch("/api/import", {
        method: "POST",
        body: JSON.stringify({ rows: rows.map(r => r.data), chunkIndex, totalChunks }),
      });
    },
    onSubmitComplete: () => console.log("All chunks submitted!"),
  }}
/>
```

### Custom Transforms & Validation

```tsx
const config: CreateWorkbookConfig = {
  name: "Import",
  transformRegistry: {
    ...defaultTransforms,
    ssn: (v) => String(v).replace(/\D/g, "").replace(/(\d{3})(\d{2})(\d{4})/, "$1-$2-$3"),
  },
  validationRegistry: {
    isPositive: (value) => Number(value) > 0 || "Must be a positive number",
  },
  sheets: [
    {
      name: "Records",
      slug: "records",
      fields: [
        { key: "ssn", label: "SSN", type: "string", defaultTransform: "ssn" },
        { key: "amount", label: "Amount", type: "number", validations: [{ type: "custom", name: "isPositive", message: "" }] },
      ],
    },
  ],
};
```

## API Reference

### `FilefeedWorkbook` Props

| Prop | Type | Description |
|------|------|-------------|
| `config` | `CreateWorkbookConfig` | Workbook configuration with sheets and fields |
| `events` | `FilefeedEvents` | Event callbacks |
| `theme` | `"light" \| "dark"` | UI theme (default: `"light"`) |
| `className` | `string` | CSS class name |

### `FilefeedEvents`

| Event | Description |
|-------|-------------|
| `onDataImported` | File parsed successfully |
| `onMappingChanged` | Column mapping updated |
| `onWorkbookComplete` | Single-shot submit (all rows) |
| `onSubmitStart/Chunk/Complete` | Chunked submit lifecycle |
| `onStepChange` | Step changed (import/mapping/review) |
| `onError` | Error occurred (import/processing/submit) |
| `onReset` | Workbook reset |

### `FieldConfig`

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Unique field identifier |
| `label` | `string` | Display label |
| `type` | `"string" \| "number" \| "email" \| "date" \| "boolean"` | Field type |
| `required` | `boolean` | Whether the field is required |
| `unique` | `boolean` | Enforce uniqueness across all rows |
| `validations` | `ValidationRule[]` | Additional validation rules |
| `defaultTransform` | `string` | Transform to apply automatically |

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Type check
npm run lint         # Lint
npm test             # Run tests
npm run build-lib    # Build for publishing
```

## License

MIT
