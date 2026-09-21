import { assert } from "chai";
import { reanchorQuoteCitationsToClaims } from "../src/services/quotes/claimAnchoring";
import { buildQuoteCitation } from "../src/services/quotes/quoteCitations";

/** A read that spanned two chunks of one paper: the Introduction on page 1 and
 * the Analysis section on page 7, delimited the way paper_read delimits them. */
const twoChunkPassage = [
  "[chunk 3]",
  "## Introduction",
  "Wetting phenomena have been studied for over two centuries, and the moving contact line remains a canonical difficulty for continuum hydrodynamics.",
  "",
  "[chunk 7]",
  "## Analysis of the dissipation integral",
  "The dissipation integral is evaluated over the outer region of the wedge.",
  "The pressure gradient diverges as the contact line is approached, so the viscous dissipation integral is logarithmically singular at alpha equal to three.",
].join("\n");

const INTRO_SENTENCE =
  "Wetting phenomena have been studied for over two centuries, and the moving contact line remains a canonical difficulty for continuum hydrodynamics.";
const OUTER_SENTENCE =
  "The dissipation integral is evaluated over the outer region of the wedge.";
const SINGULARITY_CLAIM =
  "The pressure gradient is singular at the contact line because the viscous dissipation integral diverges logarithmically. [[quote:q1]]";

function introCitation() {
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

describe("claimAnchoring chunk provenance", function () {
  it("drops the page hint and section label when the anchor moves to another chunk", function () {
    const original = introCitation();
    assert.equal(original.sourceSectionLabel, "Introduction");
    assert.equal(original.pageHintIndex, 0);

    const { quoteCitations, decisions } = reanchorQuoteCitationsToClaims({
      text: SINGULARITY_CLAIM,
      quoteCitations: [original],
      passageTextByCitationId: new Map([["q1", twoChunkPassage]]),
    });

    assert.equal(decisions[0].match, "claim");
    assert.include(
      quoteCitations[0].quoteText,
      "the viscous dissipation integral is logarithmically singular",
      "the anchor moves to the analysis chunk",
    );
    assert.isUndefined(
      quoteCitations[0].sourceSectionLabel,
      "an Introduction label must not credit a sentence from the analysis section",
    );
    assert.isUndefined(
      quoteCitations[0].pageHintIndex,
      "page 1 is where the old quote sat, not the new one",
    );
    assert.isUndefined(quoteCitations[0].pageHintLabel);
    assert.isUndefined(quoteCitations[0].sourceChunkKind);
  });

  it("drops the page hint when the original quote is in no chunk of the bounded passage", function () {
    // The collector bounds a passage at 8000 characters, so the sentence a
    // citation was cut from can be missing from the text handed back. Nothing
    // then places the citation in a chunk, and its page cannot be vouched for.
    const original = buildQuoteCitation({
      id: "q1",
      quoteText:
        "A short-time existence result closes the section on the weak formulation.",
      sourceMatchText:
        "A short-time existence result closes the section on the weak formulation.",
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

    const { quoteCitations } = reanchorQuoteCitationsToClaims({
      text: SINGULARITY_CLAIM,
      quoteCitations: [original],
      passageTextByCitationId: new Map([["q1", twoChunkPassage]]),
    });

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.isUndefined(quoteCitations[0].sourceSectionLabel);
    assert.isUndefined(quoteCitations[0].pageHintIndex);
    assert.isUndefined(quoteCitations[0].pageHintLabel);
  });

  it("keeps the page hint when a line-wrapped quote is found in its own chunk (control)", function () {
    // Controls the flattening the chunk lookup does: PDF extraction wraps a
    // sentence over several lines while the passage copy uses single spaces.
    // A lookup comparing raw text would miss the chunk and strip a page hint
    // that is still correct, so this pins the within-chunk answer.
    const wrapped = buildQuoteCitation({
      id: "q1",
      quoteText: OUTER_SENTENCE.replace(/ /g, "\n"),
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

    const { quoteCitations } = reanchorQuoteCitationsToClaims({
      text: SINGULARITY_CLAIM,
      quoteCitations: [wrapped],
      passageTextByCitationId: new Map([["q1", twoChunkPassage]]),
    });

    assert.include(quoteCitations[0].quoteText, "logarithmically singular");
    assert.equal(
      quoteCitations[0].pageHintIndex,
      6,
      "a wrapped quote still sits in the chunk that holds it",
    );
    assert.equal(quoteCitations[0].pageHintLabel, "7");
    assert.equal(
      quoteCitations[0].sourceSectionLabel,
      "Analysis of the dissipation integral",
    );
  });

  it("keeps the identity fields of a citation whose provenance was dropped (control)", function () {
    // Controls for the rebuild itself: dropping the chunk-scoped fields must
    // not disturb the ones that identify the citation and its source item.
    const { quoteCitations } = reanchorQuoteCitationsToClaims({
      text: SINGULARITY_CLAIM,
      quoteCitations: [introCitation()],
      passageTextByCitationId: new Map([["q1", twoChunkPassage]]),
    });

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

  it("keeps the page hint when a multi-chunk anchor stays inside its own chunk (control)", function () {
    // Controls the other arm of the chunk comparison: the passage still holds
    // two chunks, but the winning sentence sits in the chunk the citation was
    // cut from, so its page and section still describe it.
    const analysisCitation = buildQuoteCitation({
      id: "q1",
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

    const { quoteCitations } = reanchorQuoteCitationsToClaims({
      text: SINGULARITY_CLAIM,
      quoteCitations: [analysisCitation],
      passageTextByCitationId: new Map([["q1", twoChunkPassage]]),
    });

    assert.include(
      quoteCitations[0].quoteText,
      "logarithmically singular",
      "the anchor still moves, within the chunk",
    );
    assert.equal(
      quoteCitations[0].pageHintIndex,
      6,
      "a move inside one chunk keeps the page the chunk was read from",
    );
    assert.equal(quoteCitations[0].pageHintLabel, "7");
    assert.equal(
      quoteCitations[0].sourceSectionLabel,
      "Analysis of the dissipation integral",
    );
  });

  it("keeps the page hint for a passage with no chunk markers (control)", function () {
    // Controls the single-chunk arm: a library_retrieve snippet carries no
    // markers at all, so no comparison can be made and nothing is dropped.
    const singleChunk = [
      "Recovery was 81% across the later sessions.",
      "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
    ].join("\n");

    const original = buildQuoteCitation({
      id: "q1",
      quoteText:
        "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
      sourceMatchText:
        "The treatment group recovered after washout to the same level as sham animals in the later sessions.",
      sourceMatchKind: "exact",
      sourceMatchSource: "pdf-page-text",
      citationLabel: "Orion, 2025",
      sourceSectionLabel: "Results",
      contextItemId: 11,
      itemId: 11,
      pageHintIndex: 4,
      pageHintLabel: "5",
    })!;

    const { quoteCitations } = reanchorQuoteCitationsToClaims({
      text: "After washout recovery was 81% across the later sessions [[quote:q1]].",
      quoteCitations: [original],
      passageTextByCitationId: new Map([["q1", singleChunk]]),
    });

    assert.equal(quoteCitations[0].pageHintIndex, 4);
    assert.equal(quoteCitations[0].pageHintLabel, "5");
    assert.equal(quoteCitations[0].sourceSectionLabel, "Results");
  });
});
