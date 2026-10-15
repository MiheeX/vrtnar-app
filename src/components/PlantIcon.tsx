import { useState, type ReactNode } from "react";

// Ikona rastline, enaka na vseh napravah:
// 1) lastna SVG ikona (plants.icon), za rastline brez ustreznega emojija,
// 2) sicer Twemoji slika emojija (plants.img) — tudi novejši emojiji (🫛, 🫘, 🫑) se izrišejo,
// 3) če slike ni mogoče naložiti, navaden emoji.
// Twemoji grafike: © Twitter/X in sodelavci, CC-BY 4.0 (navedba v meniju).

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";

function twemojiUrl(emoji: string) {
  const codepoints = [...emoji]
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f) // brez variation selectorja
    .map((cp) => cp.toString(16));
  return `${TWEMOJI_BASE}${codepoints.join("-")}.svg`;
}

const S = { strokeLinecap: "round" as const, fill: "none" };

// Lastne ikone (viewBox 36×36, ploskovni slog kot Twemoji)
const ICONS: Record<string, ReactNode> = {
  pea: (
    <>
      <path d="M5 27c4-12 14-20 25-21-1 11-9 21-21 24-2 0-4-1-4-3z" fill="#77B255" />
      <path d="M9 25c3-9 11-15 19-17" stroke="#5C913B" strokeWidth="1.5" {...S} />
      <circle cx="13" cy="21" r="3.2" fill="#A6D388" />
      <circle cx="18.5" cy="16.5" r="3.2" fill="#A6D388" />
      <circle cx="24" cy="12" r="3" fill="#A6D388" />
      <path d="M30 6l3-3" stroke="#5C913B" strokeWidth="2.5" {...S} />
    </>
  ),
  bean: (
    <>
      <path d="M7 31c4-11 10-20 19-26 1 1 1 2 0 3-7 6-12 14-15 23-1 2-3 2-4 0z" fill="#77B255" />
      <path d="M14 33c3-9 9-17 17-22 1 1 1 2 0 3-6 5-11 12-13 20-1 2-3 2-4-1z" fill="#5C913B" />
      <path d="M26 5l2-3M31 11l2-2" stroke="#3E721D" strokeWidth="2" {...S} />
    </>
  ),
  pepper: (
    <>
      <path d="M18 10c-7 0-11 4-11 11 0 8 5 13 11 13s11-5 11-13c0-7-4-11-11-11z" fill="#DD2E44" />
      <path d="M18 11c-2 4-2 17 0 23" stroke="#A0041E" strokeWidth="1.5" opacity=".45" {...S} />
      <path d="M12 22c-1-4 1-7 3-8" stroke="#fff" strokeWidth="1.8" opacity=".45" {...S} />
      <path d="M12 11c2-2 10-2 12 0-3 2-9 2-12 0z" fill="#5C913B" />
      <path d="M17 11c0-3 1-5 3-7" stroke="#3E721D" strokeWidth="2.5" {...S} />
    </>
  ),
  beet: (
    <>
      <path d="M15 12C10 8 8 4 10 1c3 1 6 5 6 10z" fill="#5C913B" />
      <path d="M20 11c1-5 4-9 8-9 1 3-2 7-6 10z" fill="#77B255" />
      <path d="M17 13V6M19 13l2-5" stroke="#BE1931" strokeWidth="1.8" {...S} />
      <circle cx="18" cy="21.5" r="10" fill="#9B1B4B" />
      <path d="M18 31c0 2-1 4-2 5" stroke="#9B1B4B" strokeWidth="2" {...S} />
      <path d="M12 18c1-2 3-4 6-4" stroke="#fff" strokeWidth="1.8" opacity=".35" {...S} />
    </>
  ),
  radish: (
    <>
      <path d="M15 14C10 10 9 5 11 2c3 1 6 5 6 11z" fill="#5C913B" />
      <path d="M20 13c1-5 4-9 8-9 1 3-2 7-6 10z" fill="#77B255" />
      <circle cx="18" cy="22" r="8.5" fill="#E8344B" />
      <path d="M10.2 24.5A8.5 8.5 0 0 0 25.8 24.5Z" fill="#F4F4F4" />
      <path d="M18 30.5v5" stroke="#E6E6E6" strokeWidth="1.5" {...S} />
      <path d="M13 19c1-2 3-3 5-3" stroke="#fff" strokeWidth="1.6" opacity=".45" {...S} />
    </>
  ),
  leek: (
    <>
      <path d="M16 18C14 11 10 6 5 2c6 1 10 5 12 11z" fill="#5C913B" />
      <path d="M20 18c1-7 4-12 10-16-2 5-5 10-7 16z" fill="#77B255" />
      <path d="M18 18V3" stroke="#3E721D" strokeWidth="3.5" {...S} />
      <rect x="14.5" y="17" width="7" height="17" rx="3.5" fill="#F5F0DC" />
      <rect x="14.5" y="17" width="7" height="5" fill="#D9E8B0" />
      <path d="M16 34l-1.5 1.5M18 34.5v1.5M20 34l1.5 1.5" stroke="#C9B98A" strokeWidth="1" {...S} />
    </>
  ),
  celery: (
    <>
      <circle cx="11.5" cy="9.5" r="4.5" fill="#5C913B" />
      <circle cx="24.5" cy="9.5" r="4.5" fill="#5C913B" />
      <circle cx="18" cy="6.5" r="5" fill="#77B255" />
      <path d="M12 34l2-21" stroke="#A6D388" strokeWidth="4.5" {...S} />
      <path d="M24 34l-2-21" stroke="#A6D388" strokeWidth="4.5" {...S} />
      <path d="M18 35V12" stroke="#C6E5B3" strokeWidth="5" {...S} />
    </>
  ),
  kohlrabi: (
    <>
      <path d="M13 16L8 7M18 14V4M23 16l5-9" stroke="#77B255" strokeWidth="2" {...S} />
      <ellipse cx="7.5" cy="5.5" rx="3.5" ry="2.5" fill="#5C913B" />
      <ellipse cx="18" cy="3.5" rx="3" ry="2.5" fill="#5C913B" />
      <ellipse cx="28.5" cy="5.5" rx="3.5" ry="2.5" fill="#5C913B" />
      <circle cx="18" cy="24" r="10" fill="#C5E3A0" />
      <path d="M12 22c2-3 4-4 7-4" stroke="#fff" strokeWidth="1.8" opacity=".6" {...S} />
      <path d="M18 34v2" stroke="#8B5E3C" strokeWidth="1.5" {...S} />
    </>
  ),
  "kohlrabi-purple": (
    <>
      <path d="M13 16L8 7M18 14V4M23 16l5-9" stroke="#9B6BC9" strokeWidth="2" {...S} />
      <ellipse cx="7.5" cy="5.5" rx="3.5" ry="2.5" fill="#5C913B" />
      <ellipse cx="18" cy="3.5" rx="3" ry="2.5" fill="#5C913B" />
      <ellipse cx="28.5" cy="5.5" rx="3.5" ry="2.5" fill="#5C913B" />
      <circle cx="18" cy="24" r="10" fill="#8E5BB5" />
      <path d="M12 22c2-3 4-4 7-4" stroke="#fff" strokeWidth="1.8" opacity=".4" {...S} />
      <path d="M18 34v2" stroke="#8B5E3C" strokeWidth="1.5" {...S} />
    </>
  ),
  chard: (
    <>
      <path d="M13 17C5 15 4 6 9 2c6 2 8 9 4 15z" fill="#5C913B" />
      <path d="M25 15c-2-7 2-13 8-13 2 6-2 12-8 13z" fill="#77B255" />
      <path d="M17 14c-4-5-3-11 1-13 4 3 4 9-1 13z" fill="#3E721D" />
      <path d="M10 34c0-8 1-14 3-18" stroke="#DD2E44" strokeWidth="2.5" {...S} />
      <path d="M21 34c0-9 1-15 4-19" stroke="#F4900C" strokeWidth="2.5" {...S} />
      <path d="M16 35c0-10 0-17 1-21" stroke="#BE1931" strokeWidth="2.5" {...S} />
    </>
  ),
  spinach: (
    <>
      <ellipse cx="10.5" cy="17" rx="6" ry="9" transform="rotate(-32 10.5 17)" fill="#3E721D" />
      <ellipse cx="25.5" cy="17" rx="6" ry="9" transform="rotate(32 25.5 17)" fill="#3E721D" />
      <ellipse cx="18" cy="13" rx="6.5" ry="10.5" fill="#5C913B" />
      <path d="M18 34V17M18 34l-7-9M18 34l7-9" stroke="#A6D388" strokeWidth="1.6" {...S} />
    </>
  ),
  arugula: (
    <>
      <path d="M11 34C9 26 5 22 3 15c3 1 4 2 5 4 0-4 0-7 2-10 1 3 2 6 2 9 1-4 2-7 5-10 0 6-2 15-3 26z" fill="#5C913B" />
      <path d="M25 34c2-8 6-12 8-19-3 1-4 2-5 4 0-4 0-7-2-10-1 3-2 6-2 9-1-4-2-7-5-10 0 6 2 15 3 26z" fill="#77B255" />
      <path d="M11 34l1-14M25 34l-1-14" stroke="#A6D388" strokeWidth="1.2" {...S} />
    </>
  ),
  lettuce: (
    <>
      <circle cx="18" cy="20" r="13.5" fill="#77B255" />
      <circle cx="18" cy="21" r="9.5" fill="#A6D388" />
      <circle cx="18" cy="22" r="5" fill="#D3EBC1" />
      <path d="M6.5 15c3 1 5 3 6 6M29.5 15c-3 1-5 3-6 6M12 8c2 2 3 4 3 7M24 8c-2 2-3 4-3 7" stroke="#5C913B" strokeWidth="1.5" {...S} />
    </>
  ),
  cabbage: (
    <>
      <circle cx="18" cy="19" r="14.5" fill="#5C913B" />
      <circle cx="18" cy="19.5" r="10.5" fill="#A6D388" />
      <path d="M18 9.5c-4 4-4 16 0 20M18 9.5c4 4 4 16 0 20M8.5 17c5 0 10 1 13 4M27.5 17c-5 0-10 1-13 4" stroke="#77B255" strokeWidth="1.5" {...S} />
    </>
  ),
  cauliflower: (
    <>
      <path d="M3 21c2 9 8 13 15 13s13-4 15-13c-4 3-9 5-15 5S7 24 3 21z" fill="#5C913B" />
      <path d="M6 21c1 3 3 6 6 7M30 21c-1 3-3 6-6 7" stroke="#3E721D" strokeWidth="1.3" {...S} />
      <g fill="#F3EBD3" stroke="#DDD1AE" strokeWidth="1">
        <circle cx="11.5" cy="17" r="6" />
        <circle cx="24.5" cy="17" r="6" />
        <circle cx="18" cy="12.5" r="7" />
        <circle cx="18" cy="20.5" r="6.5" />
      </g>
    </>
  ),
  brussels: (
    <>
      <path d="M18 35V4" stroke="#A6D388" strokeWidth="3" {...S} />
      <path d="M18 5c-4-3-8-3-11-1 3 2 8 2 11 1zM18 5c4-3 8-3 11-1-3 2-8 2-11 1z" fill="#3E721D" />
      {[
        [12.5, 10],
        [23.5, 14.5],
        [12.5, 19.5],
        [23.5, 24.5],
        [12.5, 29.5],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="4.3" fill="#5C913B" />
          <circle cx={cx} cy={cy} r="2.2" fill="#77B255" />
        </g>
      ))}
    </>
  ),
  zucchini: (
    <>
      <path d="M6 31c-2-2-1-5 2-8L24 7c3-3 6-4 8-2s1 5-2 8L14 29c-3 3-6 4-8 2z" fill="#3E721D" />
      <path d="M10 27L26 11" stroke="#77B255" strokeWidth="1.8" opacity=".75" {...S} />
      <path d="M31 5l2.5-2.5" stroke="#8B5E3C" strokeWidth="3" {...S} />
      <circle cx="7.5" cy="29.5" r="1.8" fill="#FDCB58" />
    </>
  ),
};

interface Props {
  icon?: string | null; // plants.icon — ključ lastne ikone
  emoji?: string | null; // plants.img
  size?: number; // px
  title?: string;
  className?: string;
}

export function PlantIcon({ icon, emoji, size = 24, title, className }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const custom = icon ? ICONS[icon] : undefined;

  if (custom) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        className={className}
        role="img"
        aria-label={title}
        style={{ display: "inline-block", flexShrink: 0 }}
      >
        {title && <title>{title}</title>}
        {custom}
      </svg>
    );
  }

  if (emoji && !imgFailed) {
    return (
      <img
        src={twemojiUrl(emoji)}
        width={size}
        height={size}
        alt={title ?? emoji}
        title={title}
        draggable={false}
        decoding="async"
        onError={() => setImgFailed(true)}
        className={className}
        style={{ display: "inline-block", flexShrink: 0, pointerEvents: "none" }}
      />
    );
  }

  return (
    <span
      className={className}
      role="img"
      aria-label={title}
      style={{ fontSize: size * 0.85, lineHeight: 1, display: "inline-block" }}
    >
      {emoji ?? "🌱"}
    </span>
  );
}
