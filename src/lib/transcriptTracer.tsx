import React, { useEffect } from "react";

// Your TranscriptTracer code here (extracted to separate functions for readability)
let ttIsInitialized = false;
let ttTranscripts: HTMLCollectionOf<Element>;
let ttMediaPlayers: NodeListOf<HTMLAudioElement>;
let ttActivePlayer: HTMLAudioElement | HTMLVideoElement;
let ttLinkedDataByMediaUrl: { [key: string]: any } = {};

// Configuration variables
let ttBlockSelector: string | null = null;
let ttPhraseSelector: string | null = null;
let ttAlignmentFuzziness: number = 0;
let ttTimeOffset: number = 0;
let ttAutoScroll: string | null = null;
let ttClickable: boolean = false;

// The main TranscriptSync component
const TranscriptSync: React.FC<{ options: any; vttText: string }> = ({
  options,
  vttText,
}: any) => {
  useEffect(() => {
    loadTranscriptTracer(options, vttText);
  }, [options, vttText]);

  return null;
};

function loadTranscriptTracer(options: any = null, vttText: string): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadTranscriptTracer(options, vttText);
    });
    return;
  }

  if (!vttText) {
    return;
  }

  if (options) {
    if ("blockSelector" in options) ttBlockSelector = options.blockSelector;
    if ("phraseSelector" in options) ttPhraseSelector = options.phraseSelector;
    if ("alignmentFuzziness" in options)
      ttAlignmentFuzziness = options.alignmentFuzziness;
    if ("timeOffset" in options) ttTimeOffset = options.timeOffset;
    if ("autoScroll" in options) ttAutoScroll = options.autoScroll;
    if ("clickable" in options) ttClickable = options.clickable;
  }

  if (ttIsInitialized) {
    if (ttTranscripts)
      for (let t = 0; t < ttTranscripts.length; t++) {
        unlinkTranscript(ttTranscripts[t] as HTMLElement);
        (ttTranscripts[t] as HTMLElement).dataset.ttTranscript = "";
      }
    ttTranscripts = null!;
    ttMediaPlayers = null!;
    ttActivePlayer = null!;
    ttLinkedDataByMediaUrl = {};
    document.querySelectorAll(".tt-word, .tt-whitespace").forEach((element) => {
      element.outerHTML = element.innerHTML;
    });
  }

  ttIsInitialized = true;
  ttTranscripts = document.getElementsByClassName("tt-transcript");
  ttMediaPlayers = document.querySelectorAll("audio");

  for (let t = 0; t < ttTranscripts.length; t++) {
    const transcript = ttTranscripts[t] as HTMLElement;
    if (!transcript.dataset.ttMediaUrls) continue;

    transcript.dataset.ttTranscript = t.toString();

    const iter = document.createNodeIterator(transcript, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = iter.nextNode())) {
      const text = textNode.textContent!;
      if (text.replace(/\s/g, "").length !== 0) {
        let spannedText =
          '<span class="tt-word">' +
          text.replace(
            /(\s+)/g,
            '</span><span class="tt-whitespace">$1</span><span class="tt-word">'
          ) +
          "</span>";
        spannedText = spannedText.replace('<span class="tt-word"></span>', "");

        const template = document.createElement("template");
        template.innerHTML = spannedText;
        textNode.parentNode!.insertBefore(template.content, textNode);
        textNode.parentNode!.removeChild(textNode);
      }
    }
  }

  for (let i = 0; i < ttMediaPlayers.length; i++) {
    const mediaPlayer = ttMediaPlayers[i];

    linkTranscripts(mediaPlayer, vttText as string);

    mediaPlayer.addEventListener("play", function (e) {
      if (ttActivePlayer !== e.currentTarget) {
        if (ttActivePlayer) {
          ttActivePlayer.pause();
          ttActivePlayer.removeEventListener("timeupdate", ttTimeUpdate);
        }
        ttActivePlayer = e.currentTarget as HTMLAudioElement | HTMLVideoElement;
        if (ttCurrentTranscript) clearHighlightedWords(ttCurrentTranscript);
        if (ttCurrentEvent) ttCurrentEvent = null;
      }
      ttActivePlayer.addEventListener("timeupdate", ttTimeUpdate);
      const currentTranscript = ttTranscripts[
        ttLinkedDataByMediaUrl[ttActivePlayer.dataset.ttLinkedMediaUrl as any]
          .transcriptIndex
      ] as HTMLElement;
      currentTranscript.dataset.ttCurrentMediaUrl =
        ttActivePlayer.dataset.ttLinkedMediaUrl!;
    });

    mediaPlayer.addEventListener("ended", function (e) {
      if (ttCurrentTranscript) clearHighlightedWords(ttCurrentTranscript);
      if (ttCurrentEvent) ttCurrentEvent = null;
    });
  }
}

// Link media player to relevant transcripts
function linkTranscripts(mediaPlayer: any, vttText: string) {
  var trackElement = mediaPlayer.querySelector('track[kind="metadata"]');

  var mediaPlayerSourceUrls = [];
  var mediaPlayerSrc = mediaPlayer.getAttribute("src");
  var mediaPlayerSourceElements = mediaPlayer.querySelectorAll("source");
  if (mediaPlayerSrc) mediaPlayerSourceUrls.push(mediaPlayerSrc);
  if (mediaPlayerSourceElements)
    for (const s of mediaPlayerSourceElements)
      mediaPlayerSourceUrls.push(s.src);

  // If there's nothing to link, return
  if (
    !trackElement ||
    !trackElement.getAttribute("src") ||
    mediaPlayerSourceUrls.length == 0
  )
    return;

  // Fetch WebVTT content and link related transcripts
  for (let t = 0; t < ttTranscripts.length; t++) {
    const transcript = ttTranscripts[t] as HTMLElement;
    for (const mediaUrl of mediaPlayerSourceUrls) {
      if (transcript.dataset.ttMediaUrls?.includes(mediaUrl)) {
        mediaPlayer.dataset.ttLinkedMediaUrl = mediaUrl;
        linkTranscript(mediaPlayer, vttText, transcript);
        break;
      }
    }
  }

  function linkTranscript(mediaPlayer: any, vttContent: any, transcript: any) {
    var wordTimings = parseJsonToWordTimings(vttContent);
    if (wordTimings.length === 0) {
      return;
    }
    transcript.dataset.ttCurrentMediaUrl = mediaPlayer.dataset.ttLinkedMediaUrl;

    function normalizedWord(word: any) {
      // Convert to lowercase, normalize, and remove anything that's not a letter or number
      return (
        word
          .toLowerCase()
          .normalize("NFD")
          // @ts-ignore
          .replace(/[^\p{L}\p{N}]/gu, "")
      );
    }

    // Add metadata to block and phrase containers (if ttBlockSelector and ttPhraseSelector are defined)
    var blockContainers = ttBlockSelector
      ? transcript.querySelectorAll(ttBlockSelector)
      : [];
    for (let c = 0; c < blockContainers.length; c++)
      blockContainers[c].dataset.ttBlock = c;
    var phraseContainers = ttPhraseSelector
      ? transcript.querySelectorAll(ttPhraseSelector)
      : [];
    for (let c = 0; c < phraseContainers.length; c++)
      phraseContainers[c].dataset.ttPhrase = c;

    // Add metadata to each word span, and build timed events list
    var timedEvents = [];
    var wordTimingsIndex = 0;
    var wordSpans = transcript.getElementsByClassName("tt-word");
    for (let s = 0; s < wordSpans.length; s++) {
      var span = wordSpans[s];

      // Find the next word timing object that matches the current span's text
      var initialWordTimingsIndex = wordTimingsIndex;
      var maxFuzzyWordTimingsIndex = Math.min(
        wordTimingsIndex + ttAlignmentFuzziness,
        wordTimings.length - 1
      );
      while (
        normalizedWord(span.innerText) !=
          normalizedWord(wordTimings[wordTimingsIndex].text) &&
        wordTimingsIndex < maxFuzzyWordTimingsIndex
      ) {
        wordTimingsIndex += 1;
      }
      if (
        normalizedWord(span.innerText) !=
        normalizedWord(wordTimings[wordTimingsIndex].text)
      ) {
        // Could not find matching word within the fuzziness range
        wordTimingsIndex = initialWordTimingsIndex;
        continue;
      }

      // Get the block, phrase, and word index
      var blockIndex = ttBlockSelector
        ? span.closest(ttBlockSelector)?.dataset?.ttBlock ?? null
        : wordTimings[wordTimingsIndex].blockIndex;
      var phraseIndex = ttPhraseSelector
        ? span.closest(ttPhraseSelector)?.dataset?.ttPhrase ?? null
        : wordTimings[wordTimingsIndex].phraseIndex;
      var wordIndex = wordTimings[wordTimingsIndex].wordIndex;

      // Add block, phrase, and word index as metadata on the span
      span.dataset.ttBlock = blockIndex;
      span.dataset.ttPhrase = phraseIndex;
      span.dataset.ttWord = wordIndex;

      // Add timed event to timed events list
      if (
        timedEvents.length != 0 &&
        wordTimings[wordTimingsIndex].startSeconds ==
          timedEvents[timedEvents.length - 1].seconds
      ) {
        timedEvents[timedEvents.length - 1].currentWordIndexes.push(wordIndex);
      } else {
        timedEvents.push({
          seconds: wordTimings[wordTimingsIndex].startSeconds,
          currentWordIndexes: [wordIndex],
          phraseIndex: phraseIndex,
          blockIndex: blockIndex,
        });
      }

      wordTimingsIndex += 1;
    }

    // For a given element, find the first parent element containing relevant children
    function findRelevantParent(
      startingElement: any,
      endingElement: any,
      childSelector: any,
      relevantChildSelector: any
    ) {
      var currentElement = startingElement;
      while (currentElement && currentElement != endingElement) {
        var currentElement = currentElement.parentElement;
        var children = currentElement.querySelectorAll(childSelector);
        var relevantChildren = document.querySelectorAll(relevantChildSelector);
        if (children.length == relevantChildren.length) {
          // Relevant parent found
          return currentElement;
        } else if (children.length > relevantChildren.length) {
          // Failed to find a relevant parent
          break;
        }
      }
      return null;
    }

    // Add metadata to block and phrase containers (if ttBlockSelector and ttPhraseSelector aren't defined)
    if (!ttBlockSelector) {
      var count = wordTimings[wordTimings.length - 1].blockIndex + 1;
      for (let c = 0; c < count; c++) {
        var startingElement = document.querySelector(`[data-tt-block="${c}"]`);
        var blockContainer = findRelevantParent(
          startingElement,
          transcript,
          "[data-tt-word]",
          `[data-tt-word][data-tt-block="${c}"]`
        );
        if (blockContainer) blockContainer.dataset.ttBlock = c;
      }
    }
    if (!ttPhraseSelector) {
      var count = wordTimings[wordTimings.length - 1].phraseIndex + 1;
      for (let c = 0; c < count; c++) {
        var startingElement = document.querySelector(`[data-tt-phrase="${c}"]`);
        var phraseContainer = findRelevantParent(
          startingElement,
          transcript,
          "[data-tt-word]",
          `[data-tt-word][data-tt-phrase="${c}"]`
        );
        if (phraseContainer) phraseContainer.dataset.ttPhrase = c;
      }
    }

    // Sort timed events list by time
    timedEvents = timedEvents.sort(function (a, b) {
      return a.seconds - b.seconds;
    });

    // Add reference data to ttLinkedDataByMediaUrl
    var transcriptIndex = parseInt(transcript.dataset.ttTranscript);
    ttLinkedDataByMediaUrl[mediaPlayer.dataset.ttLinkedMediaUrl] = {
      transcriptIndex: transcriptIndex,
      wordTimings: wordTimings,
      timedEvents: timedEvents,
      mediaElement: mediaPlayer,
      textTrackData: mediaPlayer.textTracks[0],
    };

    // Add click listeners to words
    if (ttClickable) {
      for (let i = 0; i < document.querySelectorAll(".tt-word").length; i++) {
        const word = document.querySelectorAll(".tt-word")[i];
        word.addEventListener("click", handleWordClick);
      }
    }
  }
}
// Unlink transcript from previous VTT
function unlinkTranscript(transcript: any) {
  clearHighlightedWords(transcript);

  var ttLinkedElements = transcript.querySelectorAll("[data-tt-word]");
  for (const element of ttLinkedElements) {
    element.dataset.ttWord = "";
    element.dataset.ttPhrase = "";
    element.dataset.ttBlock = "";
  }

  var mediaUrl = transcript.dataset.ttCurrentMediaUrl;
  if (mediaUrl) {
    delete ttLinkedDataByMediaUrl[mediaUrl];
    transcript.dataset.ttCurrentMediaUrl = "";
  }

  for (const word of document.querySelectorAll(".tt-word") as any) {
    word.removeEventListener("click", handleWordClick);
  }
}

function parseJsonToWordTimings(script: string) {
  const lines = script.trim().split("\n");
  const wordTimings = [] as any;
  const pattern =
    /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s*(.*)/;

  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      const [_, startTime, endTime] = match;
      let text = "";
      i++;
      while (i < lines.length && !pattern.test(lines[i])) {
        text += lines[i].trim() + " ";
        i++;
      }
      i--; // Step back one line because the outer loop will increment it again
      wordTimings.push({
        text: text.trim().replace(/[,.:;?!]$/, ""), // Remove trailing punctuation
        startSeconds: convertTimeToSeconds(startTime),
        endSeconds: convertTimeToSeconds(endTime),
        wordIndex: wordTimings.length,
        phraseIndex: 0, // Assuming single phrase for simplicity
        blockIndex: 0, // Assuming single block for simplicity
      });
    }
  }
  return wordTimings;
}

function convertTimeToSeconds(time: any) {
  const [hours, minutes, seconds] = time.split(":");
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseFloat(seconds)
  );
}

// Respond to timeupdate event (progress as the audio or video is playing)
var ttCurrentTranscript = null as HTMLElement | null;
var ttPreviousEvent = null as any;
var ttCurrentEvent = null as any;
var ttNextEvent = null as any;

function ttTimeUpdate(e: any) {
  // If the current player isn't active or doesn't have data, return
  if (
    !ttActivePlayer ||
    e.currentTarget != ttActivePlayer || // @ts-ignore - TypeScript doesn't recognize dataset properties
    !(ttActivePlayer.dataset.ttLinkedMediaUrl in ttLinkedDataByMediaUrl)
  )
    return;

  var adjustedCurrentTime = ttActivePlayer.currentTime + ttTimeOffset * -1;
  var ttData =
    ttLinkedDataByMediaUrl[ttActivePlayer.dataset.ttLinkedMediaUrl as any];

  // Make sure the correct transcript is selected
  if (
    !ttCurrentTranscript ||
    ttCurrentTranscript.dataset.ttTranscript != ttData.transcriptIndex
  ) {
    ttCurrentTranscript = document.querySelector(
      `[data-tt-transcript="${ttData.transcriptIndex}"]`
    );
  }

  // If before the first event, after the last event, or within the range of the current event, return
  if (
    ttCurrentEvent &&
    (ttCurrentEvent.seconds < ttData.timedEvents[0].seconds ||
      ttCurrentEvent.seconds >
        ttData.timedEvents[ttData.timedEvents.length - 1].seconds)
  )
    return;
  if (
    ttCurrentEvent &&
    ttNextEvent &&
    ttCurrentEvent.seconds <= adjustedCurrentTime &&
    ttNextEvent.seconds > adjustedCurrentTime
  )
    return;

  // Clear words that were highlighted from the previous event
  clearHighlightedWords(ttCurrentTranscript);

  // Add highlights for the current event
  for (let t = 0; t < ttData.timedEvents.length; t++) {
    if (
      ttData.timedEvents[t].seconds <= adjustedCurrentTime &&
      (!ttData.timedEvents[t + 1] ||
        adjustedCurrentTime < ttData.timedEvents[t + 1]?.seconds)
    ) {
      ttPreviousEvent = ttData.timedEvents[t - 1] || null;
      ttCurrentEvent = ttData.timedEvents[t];
      ttNextEvent = ttData.timedEvents[t + 1] || null;

      // Mark blocks
      if (ttCurrentEvent.blockIndex != null) {
        var blockElements = ttCurrentTranscript?.querySelectorAll(
          `[data-tt-block="${ttCurrentEvent.blockIndex}"]`
        ) as any;
        for (let b = 0; b < blockElements.length; b++)
          blockElements[b].classList.add(
            b == 0 && !blockElements[b].classList.contains("tt-word")
              ? "tt-current-block-container"
              : "tt-current-block"
          );
      }

      // Mark phrases
      if (ttCurrentEvent.phraseIndex != null) {
        var phraseElements = ttCurrentTranscript?.querySelectorAll(
          `[data-tt-phrase="${ttCurrentEvent.phraseIndex}"]`
        ) as any;
        for (let p = 0; p < phraseElements.length; p++)
          phraseElements[p].classList.add(
            p == 0 && !phraseElements[p].classList.contains("tt-word")
              ? "tt-current-phrase-container"
              : "tt-current-phrase"
          );
      }

      // Mark words
      if (ttCurrentEvent.currentWordIndexes.length > 0) {
        for (const wordIndex of ttCurrentEvent.currentWordIndexes) {
          var wordElements = ttCurrentTranscript?.querySelectorAll(
            `[data-tt-word="${wordIndex}"]`
          ) as any;
          for (const wordElement of wordElements)
            wordElement.classList.add("tt-current-word");
        }
        for (const wordElement of (
          ttCurrentTranscript as any
        ).getElementsByClassName("tt-word")) {
          if (wordElement.classList.contains("tt-current-word")) break;
          wordElement.classList.add("tt-previous-word");
        }
      }

      // Auto-scroll to the highlighted text
      if (ttAutoScroll) {
        var scrollOptions = {
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        } as ScrollIntoViewOptions;
        if (
          ttAutoScroll == "block" &&
          ttPreviousEvent?.blockIndex != ttCurrentEvent.blockIndex
        ) {
          document
            ?.querySelector(".tt-current-block-container")
            ?.scrollIntoView(scrollOptions);
        } else if (
          ttAutoScroll == "phrase" &&
          ttPreviousEvent?.phraseIndex != ttCurrentEvent.phraseIndex
        ) {
          document
            ?.querySelector(".tt-current-phrase-container")
            ?.scrollIntoView(scrollOptions);
        } else if (ttAutoScroll == "word") {
          document
            .querySelector(".tt-current-word")
            ?.scrollIntoView(scrollOptions);
        }
      }

      break;
    }
  }
}

// Clear highlighted words in transcript
function clearHighlightedWords(transcript: any) {
  if (!transcript) return;
  var ttHighlightedElements = transcript.querySelectorAll(
    '[class*="tt-current"], [class*="tt-previous"]'
  );
  for (const element of ttHighlightedElements) {
    element.classList.remove(
      "tt-current-block",
      "tt-current-block-container",
      "tt-current-phrase",
      "tt-current-phrase-container",
      "tt-current-word",
      "tt-previous-word"
    );
  }
}

// Handle when a word in the transcript with an event listener is clicked
function handleWordClick(e: any) {
  var wordElement = e.currentTarget;
  var wordIndex = wordElement.dataset.ttWord;
  var transcript = wordElement.closest(".tt-transcript");
  var mediaUrl = transcript.dataset.ttCurrentMediaUrl;
  var startSeconds =
    ttLinkedDataByMediaUrl[mediaUrl].wordTimings[wordIndex].startSeconds;
  ttLinkedDataByMediaUrl[mediaUrl].mediaElement.currentTime = startSeconds;
}

export default TranscriptSync;
