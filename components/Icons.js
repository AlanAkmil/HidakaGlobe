const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

export const IconSearch = (p) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const IconClose = (p) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconLayers = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12.2l8.5 4.5 8.5-4.5" />
    <path d="M3.5 16.2l8.5 4.5 8.5-4.5" />
  </svg>
);

export const IconTilt = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </svg>
);

export const IconLocate = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5" />
  </svg>
);

export const IconCompass = (p) => (
  <svg {...base} {...p}>
    <path className="n" d="M12 3l3.4 9.2H8.6z" fill="currentColor" stroke="none" />
    <path d="M12 21l-3.4-9.2h6.8z" fill="currentColor" stroke="none" opacity="0.35" />
  </svg>
);

export const IconSun = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </svg>
);

export const IconMoon = (p) => (
  <svg {...base} {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z" />
  </svg>
);

export const IconCopy = (p) => (
  <svg {...base} {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
  </svg>
);

export const IconCheck = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

// Lambang merek: bola bumi dengan garis siang-malam
export const IconBrand = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 0 0 18c-3.2-2.6-3.2-15.4 0-18z" fill="currentColor" stroke="none" />
  </svg>
);
