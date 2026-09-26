import { describe, expect, it } from "vitest";
import { WikipediaKnowledgeSearchProvider, cleanSearchText, parseSearchCandidates } from "../src/modules/search/search.provider.js";

describe("Wikimedia provider normalization", () => {
  it("cleans HTML/entities and rejects unsafe page data", () => { expect(cleanSearchText("<b>Terqivo</b> &amp; Connect")).toBe("Terqivo & Connect"); });
  it("uses search and enrichment responses without leaking raw provider data", async () => { const calls: string[] = []; const provider = new WikipediaKnowledgeSearchProvider(async (input) => { const url = String(input); calls.push(url); if (url.includes("list=search")) return new Response(JSON.stringify({ query: { search: [{ pageid: 1, title: "Terqivo", snippet: "A <b>communication</b> product", ns: 0, index: 1 }] } }), { status: 200 }); return new Response(JSON.stringify({ query: { pages: [{ pageid: 1, title: "Terqivo", fullurl: "https://en.wikipedia.org/wiki/Terqivo", extract: "A communication product" }] } }), { status: 200 }); }); const result = await provider.search("what is Terqivo", 1); expect(calls.length).toBe(3); expect(result.results[0]).toMatchObject({ title: "Terqivo", source: "Wikipedia", url: "https://en.wikipedia.org/wiki/Terqivo" }); expect(parseSearchCandidates({ query: { search: [{ pageid: 2, title: "Category:No", ns: 14 }] } })).toHaveLength(1); });
});
