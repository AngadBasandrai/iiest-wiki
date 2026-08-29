const PATHS = {
  grid: <><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></>,
  table: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.1a4 4 0 0 1 0 7.75"/></>,
  bell: <><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M21 15H3l1.5-2V9a7.5 7.5 0 0 1 15 0v4z"/></>,
  file: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/></>,
  rupee: <><path d="M6 3h12M6 8h12M6 13h6a5 5 0 0 0 0-10"/><path d="M6 13l7 8"/></>,
  panel: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></>,
  trend: <><path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/></>,
  check: <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>,
  cross: <><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></>,
  ban: <><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
  cal: <><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  cup: <><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/></>,
  out: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
  down: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
  cat: <><path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3.1-9-7.56c0-1.25.43-2.37 1-3.44 0 0-1.82-6.42-.42-7 1.39-.58 4.64.26 6.42 2.26A9 9 0 0 1 12 5Z"/><path d="M8 14v.5M16 14v.5"/><path d="M11.25 16.25h1.5L12 17z"/></>,
  dog: <><path d="M7 5.2 5.2 3.4a1 1 0 0 0-1.7.7v3.7"/><path d="M17 5.2l1.8-1.8a1 1 0 0 1 1.7.7v3.7"/><path d="M3.5 8.8a8.5 8.5 0 0 1 17 0v2.9a6.5 6.5 0 0 1-3 5.5V21h-11v-3.8a6.5 6.5 0 0 1-3-5.5z"/><path d="M9.5 12h.01M14.5 12h.01"/><path d="M11 15.4h2"/></>,
  ext: <><path d="M7 17 17 7"/><path d="M8 7h9v9"/></>,
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></>,
  star: <><path d="M11.5 3.4a.6.6 0 0 1 1 0l2.2 4.5 4.9.7a.6.6 0 0 1 .3 1l-3.5 3.5.8 4.9a.6.6 0 0 1-.8.6L12 16.3l-4.4 2.3a.6.6 0 0 1-.8-.6l.8-4.9-3.5-3.5a.6.6 0 0 1 .3-1l4.9-.7z"/></>,
};

export default function Icon({ name, className = "ico" }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">{body}</svg>
    </span>
  );
}
