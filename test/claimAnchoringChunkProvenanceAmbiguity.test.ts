import { assert } from "chai";
import { reanchorQuoteCitationsToClaims } from "../src/services/quotes/claimAnchoring";
import { buildQuoteCitation } from "../src/services/quotes/quoteCitations";
import type { QuoteCitation } from "../src/shared/types";

const INTRO_SENTENCE =
  "Wetting phenomena have been studied for over two centuries, and the moving contact line remains a canonical difficulty for continuum hydrodynamics.";
const OUTER_SENTENCE =
  "The dissipation integral is evaluated over the outer region of the wedge.";
const SINGULARITY_SENTENCE =
  "The pressure gradient diverges as the contact line is approached, so the viscous dissipation integral is logarithmically singular at alpha equal to three.";
const METHODS_SENTENCE =
  "Samples were prepared under vacuum and annealed for six hours before measurement.";
const SINGULARITY_CLAIM =
  "The pressure gradient is singular at the contact line because the viscous dissipation integral diverges logarithmically. [[quote:q1]]";

/** The Introduction citation of a multi-chunk read: page 1, section Introduction. */
function introCitation(): QuoteCitation {
  return buildQuoteCitation({
    id: "q1",
    quoteText: INTRO_SENTENCE,
    sourceMatchText: INTRO_SENTENCE,
    sourceMatchKind: "exact",
    sourceMatchSource: "pdf-page-text",
    citationLabel: "Orion, 2025",
    sourceSectionLabel: "Introduction",
    sourceChunkKind: "body",
    contextItemId: 11,
    itemId: 11,
    pageHintIndex: 0,
    pageHintLabel: "1",
  })!;
}

function reanchor(
  citations: QuoteCitation[],
  passage: string,
  text = SINGULARITY_CLAIM,
) {
  const passageTextByCitationId = new Map<string, string>();
  for (const citation of citations) {
    passageTextByCitationId.set(citation.id, passage);
  }
  return reanchorQuoteCitationsToClaims({
    text,
    quoteCitations: citations,
    passageTextByCitationId,
  });
}

describe("claimAnchoring chunk provenance ambiguity", function () {
  it("drops the page hint when the quote text occurs in three chunks of the read", function () {
    // The lookup answers with an index only when exactly one chunk holds the
    // quote. Three occurrences is the case beyond the two-chunk pair: the
    // anchor lands in the very chunk a first-match lookup would name, so an
    // ambiguity counted only as "found somewhere" reads as "never left".
    const threeDuplicatePassage = [
      "[chunk 3]",
      "## Introduction",
      INTRO_SENTENCE,
      SINGULARITY_SENTENCE,
      "",
      "[chunk 5]",
      "## Methods",
      INTRO_SENTENCE,
      METHODS_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      INTRO_SENTENCE,
      OUTER_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [introCitation()],
      threeDuplicatePassage,
    );

    assert.include(
      quoteCitations[0].quoteText,
      "logarithmically singular",
      "the anchor moves to the singularity sentence in the first chunk",
    );
    assert.isUndefined(
      quoteCitations[0].pageHintIndex,
      "a quote occurring in three chunks places the citation in none of them",
    );
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the page hint of an ambiguous quote even when the anchor stays in its own chunk", function () {
    // The cost of withholding an unprovable page, stated as a test rather than
    // left for a reader to discover: the citation really was cut from chunk 0
    // and the anchor never leaves chunk 0, but the same sentence also sits in
    // chunk 1, so nothing in the citation proves which one it came from. The
    // page is withheld instead of guessed — an anchor moving within a chunk
    // that CAN be identified keeps its page, as the multi-chunk control pins.
    const duplicateWithinChunkPassage = [
      "[chunk 3]",
      "## Introduction",
      INTRO_SENTENCE,
      SINGULARITY_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      INTRO_SENTENCE,
      OUTER_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [introCitation()],
      duplicateWithinChunkPassage,
    );

    assert.include(
      quoteCitations[0].quoteText,
      "logarithmically singular",
      "the winning sentence is in the chunk the citation was cut from",
    );
    assert.isUndefined(
      quoteCitations[0].pageHintIndex,
      "an unprovable source chunk withholds the page even when nothing crossed",
    );
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
  });

  it("keeps the page hint when only the anchor sentence is duplicated (control)", function () {
    // Controls the direction the lookup reads in: it searches for the quote the
    // citation was CUT from, never for the sentence the anchor lands on. A
    // passage where the destination sentence appears in both chunks while the
    // source sentence appears once is therefore unambiguous, and the page of
    // the chunk that holds the source survives.
    const duplicateAnchorPassage = [
      "[chunk 3]",
      "## Introduction",
      INTRO_SENTENCE,
      SINGULARITY_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      OUTER_SENTENCE,
      SINGULARITY_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [introCitation()],
      duplicateAnchorPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.equal(
      quoteCitations[0].pageHintIndex,
      0,
      "one chunk holds the source quote, so the anchor provably stayed in it",
    );
    assert.equal(quoteCitations[0].pageHintLabel, "1");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Introduction");
  });

  it("keeps the page hint of a single-chunk read whose quote the snippet does not carry (control)", function () {
    // Controls the `chunks.length > 1` bound specifically, which the existing
    // marker-free control cannot: there the quote IS in the one chunk, so the
    // lookup succeeds and both a one-chunk and a many-chunk guard agree. Here
    // the retrieved snippet is a bounded window that does not carry the quoted
    // sentence, so the lookup can only answer "unprovable". A single-chunk read
    // has no chunk to cross into, and its page must survive that answer.
    const singleChunk = [
      "Recovery was 81% across the later sessions.",
      "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
    ].join("\n");

    const citation = buildQuoteCitation({
      id: "q1",
      quoteText:
        "A short-time existence result closes the section on the weak formulation.",
      sourceMatchText:
        "A short-time existence result closes the section on the weak formulation.",
      sourceMatchKind: "exact",
      sourceMatchSource: "pdf-page-text",
      citationLabel: "Orion, 2025",
      sourceSectionLabel: "Results",
      sourceChunkKind: "body",
      contextItemId: 11,
      itemId: 11,
      pageHintIndex: 4,
      pageHintLabel: "5",
    })!;

    const { quoteCitations } = reanchor(
      [citation],
      singleChunk,
      "After washout recovery was 81% across the later sessions [[quote:q1]].",
    );

    assert.equal(
      quoteCitations[0].quoteText,
      "Recovery was 81% across the later sessions.",
      "the anchor moves, inside the only chunk there is",
    );
    assert.equal(
      quoteCitations[0].pageHintIndex,
      4,
      "a read of one chunk cannot leave it, so nothing is dropped",
    );
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });

  it("keeps the citation unchanged for a passage of chunk markers alone (control)", function () {
    // Controls the empty bound of the split: a passage that is nothing but
    // markers has no chunk with text, so there are no candidates, the
    // re-anchorer returns before the comparison, and the citation keeps every
    // field it arrived with.
    const markersOnlyPassage = ["[chunk 3]", "", "[chunk 7]", ""].join("\n");

    const { quoteCitations, decisions } = reanchor(
      [introCitation()],
      markersOnlyPassage,
    );

    assert.equal(quoteCitations[0].quoteText, INTRO_SENTENCE);
    assert.equal(quoteCitations[0].pageHintIndex, 0);
    assert.equal(quoteCitations[0].pageHintLabel, "1");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Introduction");
    assert.equal(decisions[0].match, "passage");
  });
});
