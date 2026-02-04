// src/utils/notes.ts

export const URL_REGEX = /https?:\/\/[^\s]+/gi;

export const extractLinks = (text?: string | null) => {
  if (!text) return [];
  const matches = text.match(new RegExp(URL_REGEX));
  return matches ?? [];
};

export const extractListItems = (text?: string | null) => {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
};
