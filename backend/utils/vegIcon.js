// Before MenuItem.isVeg existed as a real field, some item names carried a
// hand-typed veg/non-veg marker (a leading emoji like 🟢/🔴, or a bracketed
// tag like "(Veg)"/"(Non-Veg)") as a workaround. Now that isVeg is a proper
// field with dashboard controls, these are redundant and get stripped from
// the name on every save; detectVegFromIcon lets the dashboard pre-fill the
// veg toggle from a legacy marker instead of leaving it unset.

const GREEN_ICON_RE = /^[\u{1F7E2}\u{1F49A}\u{2705}]/u; // 🟢 💚 ✅
const RED_ICON_RE = /^[\u{1F534}\u{1F7E5}\u{274C}]/u;   // 🔴 🟥 ❌
const BRACKET_NONVEG_RE = /^[([]\s*(non[\s-]?veg(?:etarian)?|nv)\s*[)\]]/i;
const BRACKET_VEG_RE = /^[([]\s*veg(?:etarian)?\s*[)\]]/i;

const LEADING_ICON_STRIP_RE = /^[\s]*[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]+[\s\-–—:•]*/u;
const LEADING_BRACKET_STRIP_RE = /^[([]\s*(non[\s-]?veg(?:etarian)?|veg(?:etarian)?|nv|v)\s*[)\]]\s*[\-–—:•]?\s*/i;

export function detectVegFromIcon(name) {
  if (!name) return null;
  const trimmed = name.trim();
  if (GREEN_ICON_RE.test(trimmed)) return true;
  if (RED_ICON_RE.test(trimmed)) return false;
  if (BRACKET_NONVEG_RE.test(trimmed)) return false;
  if (BRACKET_VEG_RE.test(trimmed)) return true;
  return null;
}

export function stripVegIcon(name) {
  if (!name) return name;
  let cleaned = name.trim();
  // Run twice — covers the rare case of both an emoji and a bracketed tag.
  for (let i = 0; i < 2; i++) {
    cleaned = cleaned.replace(LEADING_ICON_STRIP_RE, '').replace(LEADING_BRACKET_STRIP_RE, '');
  }
  return cleaned.trim();
}
