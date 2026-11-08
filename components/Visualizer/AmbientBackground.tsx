'use client';

import React, { useEffect, useState } from 'react';

interface AmbientBackgroundProps {
  imageUrl?: string;
  onColorExtracted?: (colorRgba: string) => void;
}

export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  imageUrl,
  onColorExtracted,
}) => {
  const [ambientColor, setAmbientColor] = useState('rgba(110, 133, 75, 0.18)');

  useEffect(() => {
    if (!imageUrl) return;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, 24, 24);
        const imgData = ctx.getImageData(0, 0, 24, 24).data;

        let bestR = 110;
        let bestG = 133;
        let bestB = 75;
        let maxSaturation = -1;

        // Sample pixels to find the most vibrant / saturated color
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          const lightness = (max + min) / 2;

          // Skip near-black or near-white
          if (lightness < 25 || lightness > 230) continue;

          const saturation = max === 0 ? 0 : delta / max;

          if (saturation > maxSaturation) {
            maxSaturation = saturation;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }

        if (isMounted) {
          const color = `rgba(${bestR}, ${bestG}, ${bestB}, 0.22)`;
          setAmbientColor(color);
          onColorExtracted?.(color);
        }
      } catch {
        // In case cross-origin canvas is tainted, retain default glow
      }
    };

    return () => {
      isMounted = false;
    };
  }, [imageUrl, onColorExtracted]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `radial-gradient(ellipse at 50% 10%, ${ambientColor} 0%, transparent 65%)`,
        transition: 'background 1.2s ease-in-out',
      }}
    />
  );
};
