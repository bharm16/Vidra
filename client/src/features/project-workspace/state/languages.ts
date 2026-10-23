/** Language codes a language setting offers by name; any other code reads as itself. */
export const LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "en", name: "English" }, { code: "es", name: "Spanish" }, { code: "fr", name: "French" }, { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" }, { code: "ja", name: "Japanese" }, { code: "it", name: "Italian" }, { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" }, { code: "hi", name: "Hindi" }, { code: "ar", name: "Arabic" }, { code: "ru", name: "Russian" },
  { code: "nl", name: "Dutch" }, { code: "pl", name: "Polish" }, { code: "tr", name: "Turkish" }, { code: "sv", name: "Swedish" },
  { code: "id", name: "Indonesian" }, { code: "vi", name: "Vietnamese" }, { code: "uk", name: "Ukrainian" }, { code: "he", name: "Hebrew" },
];

export function languageName(code: string): string {
  return LANGUAGES.find(language => language.code === code.trim().toLowerCase())?.name ?? code;
}
