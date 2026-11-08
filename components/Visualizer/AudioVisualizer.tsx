'use client';

import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  color?: string;
  height?: number;
  width?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioRef,
  isPlaying,
  color = '#c6f277',
  height = 54,
  width = 240,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // Set up Web Audio Analyser safely on interaction
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const setupAudioContext = () => {
      if (audioCtxRef.current) {
        if (audioCtxRef.current.state === 'suspended' && isPlaying) {
          audioCtxRef.current.resume().catch(() => {});
        }
        return;
      }

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;

        // Try connecting media element
        // If cross-origin audio rejects createMediaElementSource, catch gracefully
        try {
          const source = ctx.createMediaElementSource(audioElement);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          sourceRef.current = source;
        } catch {
          // If media element source can't be created (e.g. already connected or CORS),
          // fallback to procedural visualizer
        }

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        // Fallback procedural animation
      }
    };

    if (isPlaying) {
      setupAudioContext();
    }
  }, [audioRef, isPlaying]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    const barCount = 28;

    const render = () => {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let dataArray: Uint8Array | null = null;
      let hasRealAudioData = false;

      if (analyserRef.current && isPlaying) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const raw = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(raw);
        // Check if there is actual non-zero frequency energy
        if (raw.some((val) => val > 0)) {
          dataArray = raw;
          hasRealAudioData = true;
        }
      }

      const barWidth = Math.max(2, Math.floor((canvas.width - barCount * 2) / barCount));
      const maxHeight = canvas.height - 4;

      for (let i = 0; i < barCount; i++) {
        let barHeight = 4;

        if (isPlaying) {
          if (hasRealAudioData && dataArray) {
            const dataIndex = Math.floor((i / barCount) * dataArray.length);
            const value = dataArray[dataIndex] || 0;
            barHeight = Math.max(4, (value / 255) * maxHeight);
          } else {
            // Procedural organic frequency bounce
            const freq1 = Math.sin(tick * 0.08 + i * 0.35);
            const freq2 = Math.cos(tick * 0.05 + i * 0.18);
            const normalized = Math.abs(freq1 * 0.6 + freq2 * 0.4);
            barHeight = Math.max(4, normalized * maxHeight * 0.85);
          }
        }

        const x = i * (barWidth + 2);
        const y = canvas.height - barHeight;

        // Draw bar with gradient
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, 'rgba(198, 242, 119, 0.4)');
        gradient.addColorStop(0.6, color);
        gradient.addColorStop(1, '#e3eea8');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
      }}
    />
  );
};
