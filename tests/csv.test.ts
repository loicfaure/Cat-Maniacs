import { describe, expect, it } from "vitest";
import { csvToRecords, parseCsv, stringifyCsv } from "../src/infrastructure/csv";

describe("CSV support", () => {
  it("parses embedded newlines and escaped quotes", () => {
    const parsed = parseCsv('name,"long\nheader"\nNala,"hello, ""cat"""\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      ["name", "long\nheader"],
      ["Nala", 'hello, "cat"']
    ]);
  });

  it("round-trips records", () => {
    const csv = stringifyCsv(["id", "notes"], [{ id: "1", notes: "line one\nline two" }]);
    expect(csvToRecords(csv)).toEqual([{ id: "1", notes: "line one\nline two" }]);
  });
});
