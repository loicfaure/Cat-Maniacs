import { describe, expect, it } from "vitest";
import { csvToRecords, parseCsv, stringifyCsv } from "../csv";

describe("CSV support", () => {
  it("parses embedded newlines and escaped quotes", () => {
    const parsed = parseCsv('name,"long\nheader"\nNala,"hello, ""cat"""\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      ["name", "long\nheader"],
      ["Nala", 'hello, "cat"'],
    ]);
  });

  it("round-trips records", () => {
    const csv = stringifyCsv(["id", "notes"], [{ id: "1", notes: "line one\nline two" }]);
    expect(csvToRecords(csv)).toEqual([{ id: "1", notes: "line one\nline two" }]);
  });

  it("stringifies typed scalar and list values", () => {
    expect(
      stringifyCsv(
        ["count", "enabled", "profiles", "empty"],
        [{ count: 4, enabled: true, profiles: ["ADULT", "KITTEN"], empty: null }],
      ),
    ).toBe("count,enabled,profiles,empty\n4,true,ADULT|KITTEN,\n");
  });
});
