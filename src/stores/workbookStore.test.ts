import { describe, it, expect } from "vitest";
import { createWorkbookStore } from "./workbookStore";
import type { CreateWorkbookConfig } from "../types";

const testConfig: CreateWorkbookConfig = {
  name: "Test Workbook",
  sheets: [
    {
      name: "Sheet 1",
      slug: "sheet-1",
      fields: [
        { key: "name", label: "Name", type: "string", required: true },
        { key: "age", label: "Age", type: "number" },
      ],
    },
  ],
};

describe("workbookStore", () => {
  it("creates a store with initial state", () => {
    const store = createWorkbookStore();
    const state = store.getState();
    expect(state.config.name).toBe("");
    expect(state.processedData).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it("setConfig updates config and selects first sheet", () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    const state = store.getState();
    expect(state.config.name).toBe("Test Workbook");
    expect(state.currentSheet).toBe("sheet-1");
  });

  it("setImportedData stores data and generates auto-mapping", async () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    store.getState().setImportedData({
      headers: ["Name", "Age"],
      rows: [{ Name: "Alice", Age: "30" }],
    });
    // Auto-mapping is async; wait for the promise to settle
    await new Promise((r) => setTimeout(r, 10));
    const state = store.getState();
    expect(state.importedData).not.toBeNull();
    expect(state.importedData!.headers).toEqual(["Name", "Age"]);
    expect(Object.keys(state.mappingState).length).toBeGreaterThan(0);
  });

  it("clearImportedData resets import state", () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    store.getState().setImportedData({
      headers: ["Name"],
      rows: [{ Name: "Alice" }],
    });
    store.getState().clearImportedData();
    const state = store.getState();
    expect(state.importedData).toBeNull();
    expect(state.mappingState).toEqual({});
    expect(state.processedData).toEqual([]);
  });

  it("updateMapping sets a single mapping", () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    store.getState().setImportedData({
      headers: ["Name Col", "Age Col"],
      rows: [],
    });
    store.getState().updateMapping("Name Col", "name");
    expect(store.getState().mappingState["Name Col"]).toBe("name");
  });

  it("deleteRow removes a row", () => {
    const store = createWorkbookStore();
    store.getState().setProcessedRows([
      { id: "row-0", data: { name: "Alice" }, errors: [], isValid: true },
      { id: "row-1", data: { name: "Bob" }, errors: [], isValid: true },
    ]);
    store.getState().deleteRow("row-0");
    expect(store.getState().processedData).toHaveLength(1);
    expect(store.getState().processedData[0].id).toBe("row-1");
  });

  it("deleteInvalidRows keeps only valid rows", () => {
    const store = createWorkbookStore();
    store.getState().setProcessedRows([
      { id: "row-0", data: { name: "Alice" }, errors: [], isValid: true },
      { id: "row-1", data: { name: "" }, errors: [{ row: 1, field: "name", message: "required", severity: "error" }], isValid: false },
    ]);
    store.getState().deleteInvalidRows();
    expect(store.getState().processedData).toHaveLength(1);
    expect(store.getState().processedData[0].id).toBe("row-0");
  });

  it("reset restores initial state", () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    store.getState().setImportedData({ headers: ["Name"], rows: [{ Name: "A" }] });
    store.getState().reset();
    const state = store.getState();
    expect(state.config.name).toBe("");
    expect(state.importedData).toBeNull();
    expect(state.processedData).toEqual([]);
  });

  it("each store instance has isolated processingRunId", () => {
    const store1 = createWorkbookStore();
    const store2 = createWorkbookStore();
    store1.getState().setConfig(testConfig);
    store2.getState().setConfig(testConfig);

    store1.getState().cancelProcessing();
    expect(store2.getState().isLoading).toBe(false);
  });

  it("setMappingBatch updates all mappings in one call", () => {
    const store = createWorkbookStore();
    store.getState().setConfig(testConfig);
    store.getState().setMappingBatch({ "Col A": "name", "Col B": "age" });
    const state = store.getState();
    expect(state.mappingState["Col A"]).toBe("name");
    expect(state.mappingState["Col B"]).toBe("age");
    expect(state.pipelineMappings?.fieldMappings).toHaveLength(2);
  });
});
