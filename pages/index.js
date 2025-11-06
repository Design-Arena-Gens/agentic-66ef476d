import { useEffect, useRef, useState } from "react";
import AudioEngine from "../src/components/AudioEngine";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [tension, setTension] = useState(70);
  const [pulse, setPulse] = useState(60);
  const [reverb, setReverb] = useState(65);
  const [volume, setVolume] = useState(75);

  return (
    <div className="container">
      <main className="main">
        <h1 className="title">Suspenseful Music Generator</h1>
        <p className="subtitle">Generative tension soundscape in your browser</p>

        <div className="controls">
          <div className="control">
            <label>Tension: {tension}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={tension}
              onChange={(e) => setTension(Number(e.target.value))}
            />
          </div>
          <div className="control">
            <label>Pulse: {pulse}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={pulse}
              onChange={(e) => setPulse(Number(e.target.value))}
            />
          </div>
          <div className="control">
            <label>Reverb: {reverb}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={reverb}
              onChange={(e) => setReverb(Number(e.target.value))}
            />
          </div>
          <div className="control">
            <label>Volume: {volume}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          className={`primaryButton ${isRunning ? "stop" : "start"}`}
          onClick={() => setIsRunning((v) => !v)}
        >
          {isRunning ? "Stop" : "Start"}
        </button>

        <AudioEngine
          isRunning={isRunning}
          tension={tension}
          pulse={pulse}
          reverb={reverb}
          volume={volume}
        />
      </main>
      <footer className="footer">Use headphones for best experience</footer>
    </div>
  );
}
