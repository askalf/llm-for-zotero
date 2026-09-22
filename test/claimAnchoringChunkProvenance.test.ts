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
const ABSENT_SENTENCE =
  "A short-time existence result closes the section on the weak formulation.";
const SINGULARITY_CLAIM =
  "The pressure gradient is singular at the contact line because the viscous dissipation integral diverges logarithmically. [[quote:q1]]";

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

function analysisCitation(
  id = "q2",
  quoteText = OUTER_SENTENCE,
): QuoteCitation {
  return buildQuoteCitation({
    id,
    quoteText,
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

function resultsCitation(quoteText: string): QuoteCitation {
  return buildQuoteCitation({
    id: "q1",
    quoteText,
    sourceMatchText: quoteText,
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

const singleChunkPassage = [
  "Recovery was 81% across the later sessions.",
  "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
].join("\n");

const RECOVERY_CLAIM =
  "After washout recovery was 81% across the later sessions [[quote:q1]].";

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

describe("claimAnchoring chunk provenance", function () {
  it("drops the page hint and section label when the anchor moves to another chunk", function () {
    const { quoteCitations, decisions } = reanchor(
      [introCitation()],
      twoChunkPassage,
    );

    assert.equal(decisions[0].match, "claim");
    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);

    assert.equal(quoteCitations[0].id, "q1");
    assert.equal(quoteCitations[0].citationLabel, "(Orion, 2025)");
    assert.equal(quoteCitations[0].contextItemId, 11);
    assert.equal(quoteCitations[0].itemId, 11);
    assert.equal(quoteCitations[0].anchorMatch, "claim");
    assert.equal(
      quoteCitations[0].sourceMatchText,
      quoteCitations[0].quoteText,
      "the locator follows the quote it locates",
    );
  });

  it("stops the reader being sent to the page the quote left", function () {
    const { quoteCitations } = reanchor([introCitation()], twoChunkPassage);

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isNull(resolveQuoteCitationPageHintForTests(quoteCitations[0]));
  });

  it("drops the page hint when the original quote is in no chunk of the passage", function () {
    // The collector bounds a passage at 8000 characters, so the sentence a
    // citation was cut from can be missing from the text handed back.
    const { quoteCitations } = reanchor(
      [
        buildQuoteCitation({
          ...introCitation(),
          quoteText: ABSENT_SENTENCE,
          sourceMatchText: ABSENT_SENTENCE,
        })!,
      ],
      twoChunkPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
  });

  it("drops the page hint when the anchor skips a chunk of a three-chunk read", function () {
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

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the provenance of the crossing citation only, whichever order the citations arrive in", function () {
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

    for (const result of [forward, reversed]) {
      const crossing = result.quoteCitations.find((c) => c.id === "q1")!;
      const staying = result.quoteCitations.find((c) => c.id === "q2")!;
      assert.isUndefined(crossing.pageHintIndex);
      assert.isUndefined(crossing.sourceSectionLabel);
      assert.equal(staying.pageHintIndex, 6);
      assert.equal(
        staying.sourceSectionLabel,
        "Analysis of the dissipation integral",
      );
    }
  });

  it("drops the page hint when the quote text also occurs in an earlier chunk", function () {
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
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
  });

  it("drops the page hint when the quote text also occurs in a later chunk", function () {
    // The citation was cut from the later occurrence, on page 7, while the same
    // sentence opens chunk 3. The anchor lands in chunk 3, where an index of
    // the first occurrence would agree and carry page 7 onto text from page 1.
    const repeatedPassage = [
      "[chunk 3]",
      "## Introduction",
      OUTER_SENTENCE,
      SINGULARITY_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      OUTER_SENTENCE,
      METHODS_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [analysisCitation("q1")],
      repeatedPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the page hint when the quote text occurs in three chunks of the read", function () {
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

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the page hint of an ambiguous quote even when the anchor stays in its own chunk", function () {
    // The citation was cut from chunk 0 and the anchor lands in chunk 0, but
    // the same sentence also sits in chunk 1, so nothing places the citation.
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

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
  });

  it("keeps the page hint when only the anchor sentence is duplicated", function () {
    // The lookup searches for the quote the citation was cut from, never for
    // the sentence the anchor lands on, so this passage is unambiguous.
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
    assert.equal(quoteCitations[0].pageHintIndex, 0);
    assert.equal(quoteCitations[0].pageHintLabel, "1");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Introduction");
  });

  it("keeps the page hint when the anchor stays inside its own chunk", function () {
    const { quoteCitations } = reanchor(
      [analysisCitation("q1")],
      twoChunkPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.equal(quoteCitations[0].pageHintIndex, 6);
    assert.equal(quoteCitations[0].pageHintLabel, "7");
    assert.equal(
      quoteCitations[0].sourceSectionLabel,
      "Analysis of the dissipation integral",
    );
  });

  it("keeps the page hint when a line-wrapped quote sits in its own chunk", function () {
    // PDF extraction wraps a sentence over several lines while the passage copy
    // uses single spaces, so the lookup compares flattened text.
    const { quoteCitations } = reanchor(
      [analysisCitation("q1", OUTER_SENTENCE.replace(/ /g, "\n"))],
      twoChunkPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.equal(quoteCitations[0].pageHintIndex, 6);
    assert.equal(quoteCitations[0].pageHintLabel, "7");
    assert.equal(
      quoteCitations[0].sourceSectionLabel,
      "Analysis of the dissipation integral",
    );
  });

  it("keeps the page hint when the passage copy of the quote is line-wrapped", function () {
    const wrappedPassage = [
      "[chunk 3]",
      "## Introduction",
      INTRO_SENTENCE,
      "",
      "[chunk 7]",
      "## Analysis of the dissipation integral",
      OUTER_SENTENCE.replace(/ /g, "\n"),
      SINGULARITY_SENTENCE,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [analysisCitation("q1")],
      wrappedPassage,
    );

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.equal(quoteCitations[0].pageHintIndex, 6);
    assert.equal(quoteCitations[0].pageHintLabel, "7");
    assert.equal(
      quoteCitations[0].sourceSectionLabel,
      "Analysis of the dissipation integral",
    );
  });

  it("keeps the page hint when a chunk marker is written mid-line", function () {
    // `[chunk N]` counts only as its own line, so this passage is one chunk.
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

  it("keeps the page hint of a passage with no chunk markers", function () {
    const { quoteCitations } = reanchor(
      [
        resultsCitation(
          "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
        ),
      ],
      singleChunkPassage,
      RECOVERY_CLAIM,
    );

    assert.equal(quoteCitations[0].pageHintIndex, 4);
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });

  it("keeps the page hint of a single-chunk read whose snippet does not carry the quote", function () {
    // A bounded retrieval window with no marker: the lookup can only answer
    // "unprovable", and a read of one chunk has no other chunk to cross into.
    const { quoteCitations } = reanchor(
      [resultsCitation(ABSENT_SENTENCE)],
      singleChunkPassage,
      RECOVERY_CLAIM,
    );

    assert.equal(
      quoteCitations[0].quoteText,
      "Recovery was 81% across the later sessions.",
    );
    assert.equal(quoteCitations[0].pageHintIndex, 4);
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });

  it("keeps the page hint of a single-chunk read led by its marker when the snippet does not carry the quote", function () {
    const markedSingleChunkPassage = ["[chunk 3]", singleChunkPassage].join(
      "\n",
    );

    const { quoteCitations } = reanchor(
      [resultsCitation(ABSENT_SENTENCE)],
      markedSingleChunkPassage,
      RECOVERY_CLAIM,
    );

    assert.equal(
      quoteCitations[0].quoteText,
      "Recovery was 81% across the later sessions.",
    );
    assert.equal(quoteCitations[0].pageHintIndex, 4);
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });

  it("keeps the page hint when a blank chunk precedes the one that was read", function () {
    const emptyChunkPassage = [
      "[chunk 3]",
      "   ",
      "[chunk 4]",
      singleChunkPassage,
    ].join("\n");

    const { quoteCitations } = reanchor(
      [resultsCitation(ABSENT_SENTENCE)],
      emptyChunkPassage,
      RECOVERY_CLAIM,
    );

    assert.equal(
      quoteCitations[0].quoteText,
      "Recovery was 81% across the later sessions.",
    );
    assert.equal(quoteCitations[0].pageHintIndex, 4);
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });

  it("leaves the citation untouched for a passage of chunk markers alone", function () {
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

  it("reaches the same verdict when the same passage is re-anchored twice", function () {
    // The marker pattern is a /g regex, which carries a lastIndex between uses.
    const first = reanchor([introCitation()], twoChunkPassage);
    const second = reanchor([introCitation()], twoChunkPassage);

    for (const result of [first, second]) {
      const citation = result.quoteCitations[0];
      assert.include(citation.quoteText, "logarithmically singular");
      assert.isUndefined(citation.pageHintIndex);
      assert.isUndefined(citation.pageHintLabel);
      assert.isUndefined(citation.sourceSectionLabel);
      assert.isUndefined(citation.sourceChunkKind);
    }
    assert.equal(
      first.quoteCitations[0].quoteText,
      second.quoteCitations[0].quoteText,
    );
  });
});
