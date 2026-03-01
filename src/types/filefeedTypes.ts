import type { FieldType as BaseFieldType } from "./index";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Filefeed {
  export type FieldType = BaseFieldType;

  export type Field = {
    key: string;
    type: FieldType;
    /** Display label. Falls back to `key` when omitted via FilefeedSheet. */
    label?: string;
    required?: boolean;
    unique?: boolean;
  };

  export type SheetConfig = {
    name: string;
    slug: string;
    fields: readonly Field[];
  };

  export type RecordAPI = {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    toObject: () => Record<string, unknown>;
  };

  type FieldsOf<S> = S extends { fields: readonly (infer A)[] }
    ? A
    : S extends { fields: (infer B)[] }
      ? B
      : never;
  type Primitive<T extends FieldType> = T extends "number" ? number : T extends "boolean" ? boolean : string;

  export type RecordFor<S extends { fields: readonly { key: string; type: FieldType }[] }> = {
    [K in FieldsOf<S> as K["key"]]: Primitive<K["type"]>;
  };

  export type RecordWithValuesFor<S extends { fields: readonly { key: string; type: FieldType }[] }> = {
    [K in FieldsOf<S> as K["key"]]: { value?: Primitive<K["type"]> };
  };

  export type TypedRecordAPI<S extends { fields: readonly { key: string; type: FieldType }[] }> = {
    get: <K extends keyof RecordFor<S>>(key: K) => RecordFor<S>[K];
    set: <K extends keyof RecordFor<S>>(key: K, value: RecordFor<S>[K]) => void;
    toObject: () => RecordFor<S>;
  };

  export type SubmitHandler<S extends SheetConfig> = (args: { rows: RecordFor<S>[]; slug: string }) => void | Promise<void>;
}
