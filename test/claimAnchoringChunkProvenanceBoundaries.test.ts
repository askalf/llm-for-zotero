import { assert } from "chai";
import { reanchorQuoteCitationsToClaims } from "../src/services/quotes/claimAnchoring";
import { buildQuoteCitation } from "../src/services/quotes/quoteCitations";
import { resolveQuoteCitationPageHintForTests } from "../src/modules/contextPanel/assistantCitationLinks";
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

/** The Introduction citation of the two-chunk read: page 1, section Introduction. */
function introCitation(id = "q1"): QuoteCitation {
  return buildQuoteCitation({
    id,
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

/** The Analysis citation of the same read: page 7, section Analysis. */
function analysisCitation(id = "q2"): QuoteCitation {
  return buildQuoteCitation({
    id,
    quoteText: OUTER_SENTENCE,
    sourceMatchText: OUTER_SENTENCE,
    sourceMatchKind: "exact",
    sourceMatchSource: "pdf-page-text",
    citationLabel: "Orion, 2025",
    sourceSectionLabel: "Analysis of the dissipation integral",
    sourceChunkKind: "body",
    contextItemId: 11,
    itemId: 11,
    pageHintIndex: 6,
    pageHintLabel: "7",
  })!;
}

const twoChunkPassage = [
  "[chunk 3]",
  "## Introduction",
  INTRO_SENTENCE,
  "",
  "[chunk 7]",
  "## Analysis of the dissipation integral",
  OUTER_SENTENCE,
  SINGULARITY_SENTENCE,
].join("\n");

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

describe("claimAnchoring chunk provenance boundaries", function () {
  it("drops the page hint when the anchor skips a chunk of a three-chunk read", function () {
    // A read of three chunks is the arm the two-chunk fixtures never exercise:
    // the anchor leaves chunk 0 and lands in chunk 2, so the comparison has to
    // hold for a non-adjacent pair, not merely for "not the other one".
    const threeChunkPassage = [
      "[chunk 3]",
      "## Introduction",
      INTRO_SENTENCE,
      "",
      "[chunk 5]",
      "## Methods",
      METHODS_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      OUTER_SENTENCE,
      SINGULARITY_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor([introCitation()], threeChunkPassage);

    assert.include(
      quoteCitations[0].quoteText,
      "logarithmically singular",
      "the anchor moves two chunks forward",
    );
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the provenance of the crossing citation only, whichever order the citations arrive in", function () {
    // Two citations of one read are re-anchored in a single call. The chunk
    // comparison is made per citation, so the order they arrive in must not
    // decide which one keeps its page: the crossing one loses its hint and the
    // one that stays inside its chunk keeps page 7 in either order.
    const answer = [
      SINGULARITY_CLAIM,
      "The same divergence governs the outer wedge region of the flow. [[quote:q2]]",
    ].join("\n");

    const forward = reanchor(
      [introCitation("q1"), analysisCitation("q2")],
      twoChunkPassage,
      answer,
    );
    const reversed = reanchor(
      [analysisCitation("q2"), introCitation("q1")],
      twoChunkPassage,
      answer,
    );

    const crossingForward = forward.quoteCitations.find((c) => c.id === "q1")!;
    const stayingForward = forward.quoteCitations.find((c) => c.id === "q2")!;
    const crossingReversed = reversed.quoteCitations.find(
      (c) => c.id === "q1",
    )!;
    const stayingReversed = reversed.quoteCitations.find((c) => c.id === "q2")!;

    assert.isUndefined(
      crossingForward.pageHintIndex,
      "the Introduction citation left its chunk",
    );
    assert.isUndefined(crossingForward.sourceSectionLabel);
    assert.isUndefined(
      crossingReversed.pageHintIndex,
      "reversing the input order must not spare the crossing citation",
    );
    assert.isUndefined(crossingReversed.sourceSectionLabel);

    assert.equal(
      stayingForward.pageHintIndex,
      6,
      "the Analysis citation never left its chunk",
    );
    assert.equal(stayingReversed.pageHintIndex, 6);
    assert.equal(
      stayingForward.pageHintIndex,
      stayingReversed.pageHintIndex,
      "the result is independent of the order of operations",
    );
  });

  it("stops the reader being sent to the page the quote left", function () {
    // The blast radius, through the consumer that reads the hint: the citation
    // chip resolves pageHintIndex/pageHintLabel into the page the reader jumps
    // to. A hint carried over from the abandoned chunk is a jump to a page the
    // quoted sentence is not on.
    const { quoteCitations } = reanchor([introCitation()], twoChunkPassage);

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isNull(
      resolveQuoteCitationPageHintForTests(quoteCitations[0]),
      "a re-anchored quote with no provable page must not resolve to one",
    );
  });

  it("drops the page hint when the quote text also occurs in an earlier chunk", function () {
    // The chunk lookup finds the first chunk containing the quote, so a
    // sentence repeated across chunks cannot be placed with certainty. The
    // provenance is dropped rather than credited to a chunk that may be the
    // wrong one: an unproven page is withheld, never guessed.
    const repeatedPassage = [
      "[chunk 3]",
      "## Introduction",
      OUTER_SENTENCE,
      INTRO_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      OUTER_SENTENCE,
      SINGULARITY_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [analysisCitation("q1")],
      repeatedPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(
      quoteCitations[0].pageHintIndex,
      "a quote occurring in two chunks cannot vouch for either page",
    );
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
  });

  it("keeps the page hint when a chunk marker is written mid-line (control)", function () {
    // Controls the marker boundary the split inherits: `[chunk N]` counts only
    // as its own line, so a passage mentioning one inside a sentence is a
    // single chunk and nothing is dropped. Guards against a split loosened to
    // match markers anywhere, which would invent a chunk edge mid-sentence.
    const inlineMarkerPassage = [
      "[chunk 3]",
      "## Introduction",
      `${INTRO_SENTENCE} [chunk 7] ${SINGULARITY_SENTENCE}`,
    ].join("\n");

    const { quoteCitations } = reanchor([introCitation()], inlineMarkerPassage);

    assert.equal(quoteCitations[0].pageHintIndex, 0);
    assert.equal(quoteCitations[0].pageHintLabel, "1");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Introduction");
  });

  it("decides the same way when the same passage is re-anchored twice (control)", function () {
    // Controls the global marker pattern: it is a /g regex, which carries a
    // lastIndex between uses. A second re-anchoring of the same passage — the
    // ordinary case, one per answer — must split it into the same chunks and
    // reach the same verdict as the first.
    const first = reanchor([introCitation()], twoChunkPassage);
    const second = reanchor([introCitation()], twoChunkPassage);

    assert.equal(
      first.quoteCitations[0].quoteText,
      second.quoteCitations[0].quoteText,
    );
    assert.equal(
      first.quoteCitations[0].pageHintIndex,
      second.quoteCitations[0].pageHintIndex,
      "a repeated split must not depend on the pattern's lastIndex",
    );
    assert.equal(
      first.quoteCitations[0].sourceSectionLabel,
      second.quoteCitations[0].sourceSectionLabel,
    );
  });
});
