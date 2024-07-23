"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
// Your TranscriptTracer code here (extracted to separate functions for readability)
var ttIsInitialized = false;
var ttTranscripts;
var ttMediaPlayers;
var ttActivePlayer;
var ttLinkedDataByMediaUrl = {};
// Configuration variables
var ttBlockSelector = null;
var ttPhraseSelector = null;
var ttAlignmentFuzziness = 0;
var ttTimeOffset = 0;
var ttAutoScroll = null;
var ttClickable = false;
// The main TranscriptSync component
var TranscriptSync = function (_a) {
    var options = _a.options, vttText = _a.vttText;
    (0, react_1.useEffect)(function () {
        loadTranscriptTracer(options, vttText);
    }, [options, vttText]);
    return null;
};
function loadTranscriptTracer(options, vttText) {
    if (options === void 0) { options = null; }
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
        if ("blockSelector" in options)
            ttBlockSelector = options.blockSelector;
        if ("phraseSelector" in options)
            ttPhraseSelector = options.phraseSelector;
        if ("alignmentFuzziness" in options)
            ttAlignmentFuzziness = options.alignmentFuzziness;
        if ("timeOffset" in options)
            ttTimeOffset = options.timeOffset;
        if ("autoScroll" in options)
            ttAutoScroll = options.autoScroll;
        if ("clickable" in options)
            ttClickable = options.clickable;
    }
    if (ttIsInitialized) {
        if (ttTranscripts)
            for (var t = 0; t < ttTranscripts.length; t++) {
                unlinkTranscript(ttTranscripts[t]);
                ttTranscripts[t].dataset.ttTranscript = "";
            }
        ttTranscripts = null;
        ttMediaPlayers = null;
        ttActivePlayer = null;
        ttLinkedDataByMediaUrl = {};
        document.querySelectorAll(".tt-word, .tt-whitespace").forEach(function (element) {
            element.outerHTML = element.innerHTML;
        });
    }
    ttIsInitialized = true;
    ttTranscripts = document.getElementsByClassName("tt-transcript");
    ttMediaPlayers = document.querySelectorAll("audio");
    for (var t = 0; t < ttTranscripts.length; t++) {
        var transcript = ttTranscripts[t];
        if (!transcript.dataset.ttMediaUrls)
            continue;
        transcript.dataset.ttTranscript = t.toString();
        var iter = document.createNodeIterator(transcript, NodeFilter.SHOW_TEXT);
        var textNode = void 0;
        while ((textNode = iter.nextNode())) {
            var text = textNode.textContent;
            if (text.replace(/\s/g, "").length !== 0) {
                var spannedText = '<span class="tt-word">' +
                    text.replace(/(\s+)/g, '</span><span class="tt-whitespace">$1</span><span class="tt-word">') +
                    "</span>";
                spannedText = spannedText.replace('<span class="tt-word"></span>', "");
                var template = document.createElement("template");
                template.innerHTML = spannedText;
                textNode.parentNode.insertBefore(template.content, textNode);
                textNode.parentNode.removeChild(textNode);
            }
        }
    }
    for (var i = 0; i < ttMediaPlayers.length; i++) {
        var mediaPlayer = ttMediaPlayers[i];
        linkTranscripts(mediaPlayer, vttText);
        mediaPlayer.addEventListener("play", function (e) {
            if (ttActivePlayer !== e.currentTarget) {
                if (ttActivePlayer) {
                    ttActivePlayer.pause();
                    ttActivePlayer.removeEventListener("timeupdate", ttTimeUpdate);
                }
                ttActivePlayer = e.currentTarget;
                if (ttCurrentTranscript)
                    clearHighlightedWords(ttCurrentTranscript);
                if (ttCurrentEvent)
                    ttCurrentEvent = null;
            }
            ttActivePlayer.addEventListener("timeupdate", ttTimeUpdate);
            var currentTranscript = ttTranscripts[ttLinkedDataByMediaUrl[ttActivePlayer.dataset.ttLinkedMediaUrl]
                .transcriptIndex];
            currentTranscript.dataset.ttCurrentMediaUrl =
                ttActivePlayer.dataset.ttLinkedMediaUrl;
        });
        mediaPlayer.addEventListener("ended", function (e) {
            if (ttCurrentTranscript)
                clearHighlightedWords(ttCurrentTranscript);
            if (ttCurrentEvent)
                ttCurrentEvent = null;
        });
    }
}
// Link media player to relevant transcripts
function linkTranscripts(mediaPlayer, vttText) {
    var _a;
    var trackElement = mediaPlayer.querySelector('track[kind="metadata"]');
    var mediaPlayerSourceUrls = [];
    var mediaPlayerSrc = mediaPlayer.getAttribute("src");
    var mediaPlayerSourceElements = mediaPlayer.querySelectorAll("source");
    if (mediaPlayerSrc)
        mediaPlayerSourceUrls.push(mediaPlayerSrc);
    if (mediaPlayerSourceElements)
        for (var _i = 0, mediaPlayerSourceElements_1 = mediaPlayerSourceElements; _i < mediaPlayerSourceElements_1.length; _i++) {
            var s = mediaPlayerSourceElements_1[_i];
            mediaPlayerSourceUrls.push(s.src);
        }
    // If there's nothing to link, return
    if (!trackElement ||
        !trackElement.getAttribute("src") ||
        mediaPlayerSourceUrls.length == 0)
        return;
    // Fetch WebVTT content and link related transcripts
    for (var t = 0; t < ttTranscripts.length; t++) {
        var transcript = ttTranscripts[t];
        for (var _b = 0, mediaPlayerSourceUrls_1 = mediaPlayerSourceUrls; _b < mediaPlayerSourceUrls_1.length; _b++) {
            var mediaUrl = mediaPlayerSourceUrls_1[_b];
            if ((_a = transcript.dataset.ttMediaUrls) === null || _a === void 0 ? void 0 : _a.includes(mediaUrl)) {
                mediaPlayer.dataset.ttLinkedMediaUrl = mediaUrl;
                linkTranscript(mediaPlayer, vttText, transcript);
                break;
            }
        }
    }
    function linkTranscript(mediaPlayer, vttContent, transcript) {
        var _a, _b, _c, _d, _e, _f;
        var wordTimings = parseJsonToWordTimings(vttContent);
        if (wordTimings.length === 0) {
            return;
        }
        transcript.dataset.ttCurrentMediaUrl = mediaPlayer.dataset.ttLinkedMediaUrl;
        function normalizedWord(word) {
            // Convert to lowercase, normalize, and remove anything that's not a letter or number
            return (word
                .toLowerCase()
                .normalize("NFD")
                // @ts-ignore
                .replace(/[^\p{L}\p{N}]/gu, ""));
        }
        // Add metadata to block and phrase containers (if ttBlockSelector and ttPhraseSelector are defined)
        var blockContainers = ttBlockSelector
            ? transcript.querySelectorAll(ttBlockSelector)
            : [];
        for (var c = 0; c < blockContainers.length; c++)
            blockContainers[c].dataset.ttBlock = c;
        var phraseContainers = ttPhraseSelector
            ? transcript.querySelectorAll(ttPhraseSelector)
            : [];
        for (var c = 0; c < phraseContainers.length; c++)
            phraseContainers[c].dataset.ttPhrase = c;
        // Add metadata to each word span, and build timed events list
        var timedEvents = [];
        var wordTimingsIndex = 0;
        var wordSpans = transcript.getElementsByClassName("tt-word");
        for (var s = 0; s < wordSpans.length; s++) {
            var span = wordSpans[s];
            // Find the next word timing object that matches the current span's text
            var initialWordTimingsIndex = wordTimingsIndex;
            var maxFuzzyWordTimingsIndex = Math.min(wordTimingsIndex + ttAlignmentFuzziness, wordTimings.length - 1);
            while (normalizedWord(span.innerText) !=
                normalizedWord(wordTimings[wordTimingsIndex].text) &&
                wordTimingsIndex < maxFuzzyWordTimingsIndex) {
                wordTimingsIndex += 1;
            }
            if (normalizedWord(span.innerText) !=
                normalizedWord(wordTimings[wordTimingsIndex].text)) {
                // Could not find matching word within the fuzziness range
                wordTimingsIndex = initialWordTimingsIndex;
                continue;
            }
            // Get the block, phrase, and word index
            var blockIndex = ttBlockSelector
                ? (_c = (_b = (_a = span.closest(ttBlockSelector)) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.ttBlock) !== null && _c !== void 0 ? _c : null
                : wordTimings[wordTimingsIndex].blockIndex;
            var phraseIndex = ttPhraseSelector
                ? (_f = (_e = (_d = span.closest(ttPhraseSelector)) === null || _d === void 0 ? void 0 : _d.dataset) === null || _e === void 0 ? void 0 : _e.ttPhrase) !== null && _f !== void 0 ? _f : null
                : wordTimings[wordTimingsIndex].phraseIndex;
            var wordIndex = wordTimings[wordTimingsIndex].wordIndex;
            // Add block, phrase, and word index as metadata on the span
            span.dataset.ttBlock = blockIndex;
            span.dataset.ttPhrase = phraseIndex;
            span.dataset.ttWord = wordIndex;
            // Add timed event to timed events list
            if (timedEvents.length != 0 &&
                wordTimings[wordTimingsIndex].startSeconds ==
                    timedEvents[timedEvents.length - 1].seconds) {
                timedEvents[timedEvents.length - 1].currentWordIndexes.push(wordIndex);
            }
            else {
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
        function findRelevantParent(startingElement, endingElement, childSelector, relevantChildSelector) {
            var currentElement = startingElement;
            while (currentElement && currentElement != endingElement) {
                var currentElement = currentElement.parentElement;
                var children = currentElement.querySelectorAll(childSelector);
                var relevantChildren = document.querySelectorAll(relevantChildSelector);
                if (children.length == relevantChildren.length) {
                    // Relevant parent found
                    return currentElement;
                }
                else if (children.length > relevantChildren.length) {
                    // Failed to find a relevant parent
                    break;
                }
            }
            return null;
        }
        // Add metadata to block and phrase containers (if ttBlockSelector and ttPhraseSelector aren't defined)
        if (!ttBlockSelector) {
            var count = wordTimings[wordTimings.length - 1].blockIndex + 1;
            for (var c = 0; c < count; c++) {
                var startingElement = document.querySelector("[data-tt-block=\"".concat(c, "\"]"));
                var blockContainer = findRelevantParent(startingElement, transcript, "[data-tt-word]", "[data-tt-word][data-tt-block=\"".concat(c, "\"]"));
                if (blockContainer)
                    blockContainer.dataset.ttBlock = c;
            }
        }
        if (!ttPhraseSelector) {
            var count = wordTimings[wordTimings.length - 1].phraseIndex + 1;
            for (var c = 0; c < count; c++) {
                var startingElement = document.querySelector("[data-tt-phrase=\"".concat(c, "\"]"));
                var phraseContainer = findRelevantParent(startingElement, transcript, "[data-tt-word]", "[data-tt-word][data-tt-phrase=\"".concat(c, "\"]"));
                if (phraseContainer)
                    phraseContainer.dataset.ttPhrase = c;
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
            for (var i = 0; i < document.querySelectorAll(".tt-word").length; i++) {
                var word = document.querySelectorAll(".tt-word")[i];
                word.addEventListener("click", handleWordClick);
            }
        }
    }
}
// Unlink transcript from previous VTT
function unlinkTranscript(transcript) {
    clearHighlightedWords(transcript);
    var ttLinkedElements = transcript.querySelectorAll("[data-tt-word]");
    for (var _i = 0, ttLinkedElements_1 = ttLinkedElements; _i < ttLinkedElements_1.length; _i++) {
        var element = ttLinkedElements_1[_i];
        element.dataset.ttWord = "";
        element.dataset.ttPhrase = "";
        element.dataset.ttBlock = "";
    }
    var mediaUrl = transcript.dataset.ttCurrentMediaUrl;
    if (mediaUrl) {
        delete ttLinkedDataByMediaUrl[mediaUrl];
        transcript.dataset.ttCurrentMediaUrl = "";
    }
    for (var _a = 0, _b = document.querySelectorAll(".tt-word"); _a < _b.length; _a++) {
        var word = _b[_a];
        word.removeEventListener("click", handleWordClick);
    }
}
function parseJsonToWordTimings(script) {
    var lines = script.trim().split("\n");
    var wordTimings = [];
    var pattern = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\s*(.*)/;
    for (var i = 0; i < lines.length; i++) {
        var match = pattern.exec(lines[i]);
        if (match) {
            var _ = match[0], startTime = match[1], endTime = match[2];
            var text = "";
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
function convertTimeToSeconds(time) {
    var _a = time.split(":"), hours = _a[0], minutes = _a[1], seconds = _a[2];
    return (parseInt(hours, 10) * 3600 +
        parseInt(minutes, 10) * 60 +
        parseFloat(seconds));
}
// Respond to timeupdate event (progress as the audio or video is playing)
var ttCurrentTranscript = null;
var ttPreviousEvent = null;
var ttCurrentEvent = null;
var ttNextEvent = null;
function ttTimeUpdate(e) {
    var _a, _b, _c, _d;
    // If the current player isn't active or doesn't have data, return
    if (!ttActivePlayer ||
        e.currentTarget != ttActivePlayer || // @ts-ignore - TypeScript doesn't recognize dataset properties
        !(ttActivePlayer.dataset.ttLinkedMediaUrl in ttLinkedDataByMediaUrl))
        return;
    var adjustedCurrentTime = ttActivePlayer.currentTime + ttTimeOffset * -1;
    var ttData = ttLinkedDataByMediaUrl[ttActivePlayer.dataset.ttLinkedMediaUrl];
    // Make sure the correct transcript is selected
    if (!ttCurrentTranscript ||
        ttCurrentTranscript.dataset.ttTranscript != ttData.transcriptIndex) {
        ttCurrentTranscript = document.querySelector("[data-tt-transcript=\"".concat(ttData.transcriptIndex, "\"]"));
    }
    // If before the first event, after the last event, or within the range of the current event, return
    if (ttCurrentEvent &&
        (ttCurrentEvent.seconds < ttData.timedEvents[0].seconds ||
            ttCurrentEvent.seconds >
                ttData.timedEvents[ttData.timedEvents.length - 1].seconds))
        return;
    if (ttCurrentEvent &&
        ttNextEvent &&
        ttCurrentEvent.seconds <= adjustedCurrentTime &&
        ttNextEvent.seconds > adjustedCurrentTime)
        return;
    // Clear words that were highlighted from the previous event
    clearHighlightedWords(ttCurrentTranscript);
    // Add highlights for the current event
    for (var t = 0; t < ttData.timedEvents.length; t++) {
        if (ttData.timedEvents[t].seconds <= adjustedCurrentTime &&
            (!ttData.timedEvents[t + 1] ||
                adjustedCurrentTime < ((_a = ttData.timedEvents[t + 1]) === null || _a === void 0 ? void 0 : _a.seconds))) {
            ttPreviousEvent = ttData.timedEvents[t - 1] || null;
            ttCurrentEvent = ttData.timedEvents[t];
            ttNextEvent = ttData.timedEvents[t + 1] || null;
            // Mark blocks
            if (ttCurrentEvent.blockIndex != null) {
                var blockElements = ttCurrentTranscript === null || ttCurrentTranscript === void 0 ? void 0 : ttCurrentTranscript.querySelectorAll("[data-tt-block=\"".concat(ttCurrentEvent.blockIndex, "\"]"));
                for (var b = 0; b < blockElements.length; b++)
                    blockElements[b].classList.add(b == 0 && !blockElements[b].classList.contains("tt-word")
                        ? "tt-current-block-container"
                        : "tt-current-block");
            }
            // Mark phrases
            if (ttCurrentEvent.phraseIndex != null) {
                var phraseElements = ttCurrentTranscript === null || ttCurrentTranscript === void 0 ? void 0 : ttCurrentTranscript.querySelectorAll("[data-tt-phrase=\"".concat(ttCurrentEvent.phraseIndex, "\"]"));
                for (var p = 0; p < phraseElements.length; p++)
                    phraseElements[p].classList.add(p == 0 && !phraseElements[p].classList.contains("tt-word")
                        ? "tt-current-phrase-container"
                        : "tt-current-phrase");
            }
            // Mark words
            if (ttCurrentEvent.currentWordIndexes.length > 0) {
                for (var _i = 0, _e = ttCurrentEvent.currentWordIndexes; _i < _e.length; _i++) {
                    var wordIndex = _e[_i];
                    var wordElements = ttCurrentTranscript === null || ttCurrentTranscript === void 0 ? void 0 : ttCurrentTranscript.querySelectorAll("[data-tt-word=\"".concat(wordIndex, "\"]"));
                    for (var _f = 0, wordElements_1 = wordElements; _f < wordElements_1.length; _f++) {
                        var wordElement = wordElements_1[_f];
                        wordElement.classList.add("tt-current-word");
                    }
                }
                for (var _g = 0, _h = ttCurrentTranscript.getElementsByClassName("tt-word"); _g < _h.length; _g++) {
                    var wordElement = _h[_g];
                    if (wordElement.classList.contains("tt-current-word"))
                        break;
                    wordElement.classList.add("tt-previous-word");
                }
            }
            // Auto-scroll to the highlighted text
            if (ttAutoScroll) {
                var scrollOptions = {
                    behavior: "smooth",
                    block: "start",
                    inline: "nearest",
                };
                if (ttAutoScroll == "block" &&
                    (ttPreviousEvent === null || ttPreviousEvent === void 0 ? void 0 : ttPreviousEvent.blockIndex) != ttCurrentEvent.blockIndex) {
                    (_b = document === null || document === void 0 ? void 0 : document.querySelector(".tt-current-block-container")) === null || _b === void 0 ? void 0 : _b.scrollIntoView(scrollOptions);
                }
                else if (ttAutoScroll == "phrase" &&
                    (ttPreviousEvent === null || ttPreviousEvent === void 0 ? void 0 : ttPreviousEvent.phraseIndex) != ttCurrentEvent.phraseIndex) {
                    (_c = document === null || document === void 0 ? void 0 : document.querySelector(".tt-current-phrase-container")) === null || _c === void 0 ? void 0 : _c.scrollIntoView(scrollOptions);
                }
                else if (ttAutoScroll == "word") {
                    (_d = document
                        .querySelector(".tt-current-word")) === null || _d === void 0 ? void 0 : _d.scrollIntoView(scrollOptions);
                }
            }
            break;
        }
    }
}
// Clear highlighted words in transcript
function clearHighlightedWords(transcript) {
    if (!transcript)
        return;
    var ttHighlightedElements = transcript.querySelectorAll('[class*="tt-current"], [class*="tt-previous"]');
    for (var _i = 0, ttHighlightedElements_1 = ttHighlightedElements; _i < ttHighlightedElements_1.length; _i++) {
        var element = ttHighlightedElements_1[_i];
        element.classList.remove("tt-current-block", "tt-current-block-container", "tt-current-phrase", "tt-current-phrase-container", "tt-current-word", "tt-previous-word");
    }
}
// Handle when a word in the transcript with an event listener is clicked
function handleWordClick(e) {
    var wordElement = e.currentTarget;
    var wordIndex = wordElement.dataset.ttWord;
    var transcript = wordElement.closest(".tt-transcript");
    var mediaUrl = transcript.dataset.ttCurrentMediaUrl;
    var startSeconds = ttLinkedDataByMediaUrl[mediaUrl].wordTimings[wordIndex].startSeconds;
    ttLinkedDataByMediaUrl[mediaUrl].mediaElement.currentTime = startSeconds;
}
exports.default = TranscriptSync;
