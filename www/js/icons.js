// ===========================================================================
// icons.js — inline SVG line icons. Icons.get('home') -> '<svg ...>'.
// 24x24, stroke=currentColor, no fill — they inherit text color for theming.
// ===========================================================================
(function () {
  const W = 'stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"';
  // stroke="currentColor" on the root so EVERY icon is visible by default (was
  // only set in the tab-bar CSS before — which is why most icons vanished).
  // width/height 100% makes the icon fill its sized wrapper.
  const S = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const I = {
    home: S(`<path ${W} d="M3 10.5 12 3l9 7.5"/><path ${W} d="M5 9.5V20h14V9.5"/><path ${W} d="M9.5 20v-5h5v5"/>`),
    sleep: S(`<path ${W} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/><path ${W} d="M15 4h4l-4 4h4"/>`),
    patterns: S(`<circle cx="6" cy="7" r="2.2" ${W}/><circle cx="18" cy="9" r="2.2" ${W}/><circle cx="9" cy="17" r="2.2" ${W}/><path ${W} d="m8 8 8 1M8.6 15l8.2-4.4"/>`),
    weather: S(`<circle cx="8.5" cy="9" r="3.2" ${W}/><path ${W} d="M16.5 18a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6.8"/><path ${W} d="M7 19h.01M10.5 21h.01M14 19h.01"/>`),
    lab: S(`<path ${W} d="M9 3v6.5L4.5 17a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3"/><path ${W} d="M8 3h8M7.5 14h9"/>`),
    decompress: S(`<path ${W} d="M12 3a4 4 0 0 1 4 4c0 2-1.5 3-1.5 5h-5C9.5 10 8 9 8 7a4 4 0 0 1 4-4Z"/><path ${W} d="M9.5 16h5M10 19h4"/>`),
    compass: S(`<circle cx="12" cy="12" r="9" ${W}/><path ${W} d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>`),
    mirror: S(`<rect x="6" y="3" width="12" height="18" rx="6" ${W}/><path ${W} d="M9 8c1 1.5 5 1.5 6 0M9.5 12h.01M14.5 12h.01"/>`),
    energy: S(`<path ${W} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`),
    journal: S(`<path ${W} d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5Z"/><path ${W} d="M9 3v18M12 8h4M12 12h4"/>`),
    checkin: S(`<circle cx="12" cy="12" r="9" ${W}/><path ${W} d="M8.5 10h.01M15.5 10h.01M8 14.5c1.2 1.3 6.8 1.3 8 0"/>`),
    settings: S(`<circle cx="12" cy="12" r="3.2" ${W}/><path ${W} d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L16.5 2h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2Z"/>`),
    more: S(`<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>`),
    heart: S(`<path ${W} d="M12 20s-7-4.5-9.2-8.5C1 8 3 4.5 6.3 4.5 8.5 4.5 12 7 12 7s3.5-2.5 5.7-2.5C21 4.5 23 8 21.2 11.5 19 15.5 12 20 12 20Z"/>`),
    plus: S(`<path ${W} d="M12 5v14M5 12h14"/>`),
    check: S(`<path ${W} d="m5 12.5 4.5 4.5L19 7"/>`),
    x: S(`<path ${W} d="M6 6l12 12M18 6 6 18"/>`),
    chevron: S(`<path ${W} d="m9 6 6 6-6 6"/>`),
    arrow: S(`<path ${W} d="M5 12h14M13 6l6 6-6 6"/>`),
    spark: S(`<path ${W} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>`),
    moon: S(`<path ${W} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>`),
    thermo: S(`<path ${W} d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/>`),
    droplet: S(`<path ${W} d="M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3Z"/>`),
    sound: S(`<path ${W} d="M4 9v6h4l5 4V5L8 9H4Z"/><path ${W} d="M16 9a4 4 0 0 1 0 6"/>`),
    mic: S(`<rect x="9" y="3" width="6" height="11" rx="3" ${W}/><path ${W} d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>`),
    sun: S(`<circle cx="12" cy="12" r="4" ${W}/><path ${W} d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>`),
    leaf: S(`<path ${W} d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Z"/><path ${W} d="M5 19 12 12"/>`),
    trend: S(`<path ${W} d="M4 16l5-5 3 3 7-7"/><path ${W} d="M15 7h4v4"/>`),
    flag: S(`<path ${W} d="M5 21V4M5 4h11l-2 4 2 4H5"/>`),
    bolt: S(`<path ${W} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`),
    book: S(`<path ${W} d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5Z"/><path ${W} d="M5 18.5h14"/>`),
    wind: S(`<path ${W} d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h14a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2"/>`),
    bell: S(`<path ${W} d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"/><path ${W} d="M10 19a2 2 0 0 0 4 0"/>`),
    globe: S(`<circle cx="12" cy="12" r="9" ${W}/><path ${W} d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/>`),
    download: S(`<path ${W} d="M12 4v10M8 11l4 4 4-4M5 19h14"/>`),
    trash: S(`<path ${W} d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"/>`),
    target: S(`<circle cx="12" cy="12" r="8" ${W}/><circle cx="12" cy="12" r="4" ${W}/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`),
    scale: S(`<path ${W} d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6Z"/>`),
    grid: S(`<rect x="4" y="4" width="6.5" height="6.5" rx="2" ${W}/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" ${W}/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" ${W}/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" ${W}/>`),
    user: S(`<circle cx="12" cy="8" r="4" ${W}/><path ${W} d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>`),
    lock: S(`<rect x="5" y="11" width="14" height="9" rx="2.5" ${W}/><path ${W} d="M8 11V8a4 4 0 0 1 8 0v3"/>`),
    sunrise: S(`<path ${W} d="M3 18h18M7 18a5 5 0 0 1 10 0M12 3v4M5.5 8.5 7 10M18.5 8.5 17 10M2 14h2M20 14h2M12 7l-2.5 2.5h5L12 7Z"/>`),
  };
  window.Icons = { get(name) { return I[name] || I.spark; }, names: Object.keys(I) };
})();
