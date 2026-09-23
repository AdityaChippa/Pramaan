import * as THREE from "three";

export interface AtlasCard {
  id: string;
  verdict: "authentic" | "inconclusive" | "manipulated" | null;
  label: string;
  confidence: string;
  mediaType: "image" | "video" | "audio";
  date: string;
  color: string;
  seed: string;
  imageUrl: string | null;
}

/** 200 px cells keep 300 cards (18×18 grid = 3600 px) under the common 4096 px texture limit. */
export const CELL = 200;

export function atlasGrid(n: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

const ICON: Record<AtlasCard["mediaType"], string> = { image: "IMG", video: "VID", audio: "AUD" };

function overlay(ctx: CanvasRenderingContext2D, x: number, y: number, card: AtlasCard) {
  ctx.fillStyle = card.color;
  ctx.fillRect(x, y, 10, CELL);
  ctx.fillStyle = "rgba(12,12,12,0.78)";
  ctx.fillRect(x + 10, y + CELL - 64, CELL - 10, 64);
  ctx.fillRect(x + CELL - 50, y + 8, 42, 22);
  ctx.fillStyle = "#D7E2EA";
  ctx.font = "600 12px monospace";
  ctx.fillText(ICON[card.mediaType], x + CELL - 44, y + 24);
  ctx.fillStyle = card.color;
  ctx.font = "600 18px sans-serif";
  ctx.fillText(card.label, x + 18, y + CELL - 42, CELL - 30);
  ctx.fillStyle = "#D7E2EA";
  ctx.font = "15px monospace";
  ctx.fillText(card.confidence, x + 18, y + CELL - 22, 90);
  ctx.fillStyle = "rgba(215,226,234,0.6)";
  ctx.font = "11px monospace";
  ctx.fillText(card.date, x + CELL - 82, y + CELL - 22, 76);
}

/**
 * One canvas texture for every archive card: thumbnail (or engine waveform image for audio),
 * verdict colour strip, confidence in mono, media-type tag and date. Thumbnails patch their cell on load.
 */
export function buildAtlas(cards: AtlasCard[]): { texture: THREE.CanvasTexture; grid: number; dispose: () => void } {
  const grid = atlasGrid(cards.length);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = grid * CELL;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let disposed = false;

  cards.forEach((card, i) => {
    const x = (i % grid) * CELL;
    const y = Math.floor(i / grid) * CELL;
    ctx.fillStyle = "#161616";
    ctx.fillRect(x, y, CELL, CELL);
    overlay(ctx, x, y, card);
    if (!card.imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (disposed) return;
      const s = Math.max(CELL / img.width, CELL / img.height);
      const w = img.width * s;
      const h = img.height * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, CELL, CELL);
      ctx.clip();
      ctx.drawImage(img, x + (CELL - w) / 2, y + (CELL - h) / 2, w, h);
      ctx.restore();
      overlay(ctx, x, y, card);
      texture.needsUpdate = true;
    };
    img.src = card.imageUrl;
  });
  texture.needsUpdate = true;
  return { texture, grid, dispose: () => { disposed = true; texture.dispose(); } };
}
