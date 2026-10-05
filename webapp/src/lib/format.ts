// Number/time formatting. Every number shown in the UI goes through one of these so units are
// never dropped.

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Adaptive significant-figure formatting for quantities spanning orders of magnitude. */
export function fmtSig(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) return fmtInt(n);
  if (a >= 100) return fmtNum(n, 0);
  if (a >= 10) return fmtNum(n, 1);
  if (a >= 1) return fmtNum(n, 2);
  if (a === 0) return '0';
  return fmtNum(n, 3);
}

/** Seconds -> "hh:mm:ss". */
export function clock(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Seconds -> "T+1 h 05 min" style. */
export function tPlus(t: number): string {
  if (!Number.isFinite(t) || t < 0) return '—';
  return `T+${dur(t)}`;
}

/** Duration in compact human form: "42 s", "12 min", "1 h 05 min", "2 d 3 h". */
export function dur(t: number): string {
  if (!Number.isFinite(t)) return '—';
  const neg = t < 0;
  let s = Math.abs(t);
  let out: string;
  if (s < 60) out = `${Math.round(s)} s`;
  else if (s < 3600) out = `${Math.round(s / 60)} min`;
  else if (s < 86400) {
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    out = `${h} h ${String(Math.round(s / 60)).padStart(2, '0')} min`;
  } else {
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    out = `${d} d ${Math.round(s / 3600)} h`;
  }
  return neg ? `−${out}` : out;
}

export function fmtVolume(m3: number): string {
  if (!Number.isFinite(m3)) return '—';
  if (Math.abs(m3) >= 1e9) return `${fmtNum(m3 / 1e9, 2)} km³`;
  if (Math.abs(m3) >= 1e5) return `${fmtNum(m3 / 1e6, 2)} Mm³`;
  return `${fmtInt(m3)} m³`;
}

export function fmtPct(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return '—';
  return `${fmtNum(p, digits)} %`;
}

export function fmtLatLng(lng: number, lat: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
}
