import { useEffect } from 'react';
import './App.css';
import { TranscriptSync } from 'react-transcript-sync'

const options = {
  blockSelector: '.block-selector',
  phraseSelector: '.phrase-selector',
  alignmentFuzziness: 0.1,
  timeOffset: 0,
  autoScroll: 'smooth',
  clickable: true,
};

const vttText = `WEBVTT

1
00:00:00.000 --> 00:00:01.000
Welcome to the TranscriptTracer demo.

2
00:00:01.000 --> 00:00:03.000
This is an example of how it works.
`;


function App() {
  useEffect(() => {
    document.addEventListener('DOMContentLoaded', () => {
      TranscriptSync(options, vttText);
    });
  })
  return (
    <div className="App">
      <h1>TranscriptTracer Demo</h1>
      <audio controls>
        <source src="your-audio-file.mp3" type="audio/mp3" />
        Your browser does not support the audio element.
      </audio>
      <div className="tt-transcript" data-tt-media-urls="your-audio-file.mp3">
        <p className="block-selector">Welcome to the TranscriptTracer demo. This is an example of how it works.</p>
      </div>
      <div className="tt-transcript" data-tt-media-urls="your-audio-file.mp3">
        <p className="block-selector">Welcome to the TranscriptTracer demo. This is an example of how it works.</p>
      </div>
    </div>
  );
}

export default App;
