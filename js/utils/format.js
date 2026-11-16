import { LOCALE } from "../config.js";

const numberFormat = new Intl.NumberFormat(LOCALE);
const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

export const formatNumber = (value) => numberFormat.format(value ?? 0);

/** "7,8" — ou null quando o título ainda não tem votos suficientes. */
export function formatRating(value, voteCount) {
  if (!value || (voteCount !== undefined && voteCount === 0)) return null;
  return value.toFixed(1).replace(".", ",");
}

export function yearOf(dateString) {
  return dateString ? String(dateString).slice(0, 4) : "";
}

export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** 135 -> "2h 15min" */
export function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function pluralize(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

let regionNames;
let languageNames;
try {
  regionNames = new Intl.DisplayNames([LOCALE], { type: "region" });
  languageNames = new Intl.DisplayNames([LOCALE], { type: "language" });
} catch {
  /* navegador sem Intl.DisplayNames: cai para o código */
}

export function countryName(code) {
  if (!code) return "";
  try {
    return capitalize(regionNames?.of(code) || code);
  } catch {
    return code;
  }
}

export function languageName(code) {
  if (!code) return "";
  try {
    return capitalize(languageNames?.of(code) || code);
  } catch {
    return code;
  }
}

export function relativeTime(timestamp) {
  const diff = timestamp - Date.now();
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "agora há pouco";
}

export function ageFrom(birthday, deathday) {
  if (!birthday) return null;
  const birth = new Date(`${birthday}T12:00:00`);
  const end = deathday ? new Date(`${deathday}T12:00:00`) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    end.getMonth() < birth.getMonth() || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const MEDIA_LABEL = { movie: "Filme", tv: "Série", person: "Pessoa" };
export const MEDIA_PATH = { movie: "filme", tv: "serie", person: "pessoa" };

export const detailsPath = (mediaType, id) => `/${MEDIA_PATH[mediaType] || "filme"}/${id}`;
