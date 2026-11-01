import type { CSSProperties } from "react";

type ArtworkProps = {
  id: number;
  className?: string;
  style?: CSSProperties;
};

export function SectionArt({ id, className, style }: ArtworkProps) {
  if (id === 1) {
    return (
      <svg
        className={className}
        style={style}
        viewBox="0 0 300 300"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <g stroke="white" strokeOpacity="0.34" strokeWidth="1.4">
          {[46, 68, 92, 118, 148, 182].map((radius) => (
            <circle key={radius} cx="150" cy="214" r={radius} />
          ))}
        </g>
        <circle cx="150" cy="214" r="34" fill="white" fillOpacity="0.16" />
        <circle cx="150" cy="214" r="18" fill="white" fillOpacity="0.4" />
      </svg>
    );
  }

  if (id === 2) {
    return (
      <svg
        className={className}
        style={style}
        viewBox="0 0 300 300"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <path
            key={index}
            d={`M-30 ${70 + index * 46} C 60 ${20 + index * 46}, 150 ${
              140 + index * 40
            }, 330 ${54 + index * 46}`}
            stroke="white"
            strokeOpacity={0.38 - index * 0.05}
            strokeWidth={2.2 - index * 0.25}
            strokeLinecap="round"
          />
        ))}
        <circle cx="226" cy="82" r="26" fill="white" fillOpacity="0.12" />
      </svg>
    );
  }

  const stars = [
    [62, 78],
    [118, 52],
    [176, 96],
    [228, 58],
    [252, 138],
    [196, 172],
    [132, 148],
    [84, 196],
    [162, 238],
    [236, 216],
  ];
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 300 300"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="white" strokeOpacity="0.32" strokeWidth="1">
        {stars.slice(0, -1).map(([x, y], index) => {
          const [nextX, nextY] = stars[index + 1];
          return (
            <line key={index} x1={x} y1={y} x2={nextX} y2={nextY} />
          );
        })}
        <line x1="62" y1="78" x2="228" y2="58" />
        <line x1="132" y1="148" x2="196" y2="172" />
      </g>
      {stars.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={index % 3 === 0 ? 3.2 : 2}
          fill="white"
          fillOpacity={index % 3 === 0 ? 0.75 : 0.5}
        />
      ))}
    </svg>
  );
}
