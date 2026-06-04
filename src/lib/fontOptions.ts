export interface FontOption {
  value: string;
  label: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "Poppins, sans-serif",        label: "Poppins" },
  { value: "'Patrick Hand', cursive",    label: "Patrick Hand (handdrawn)" },
  { value: "'Caveat', cursive",          label: "Caveat (handwritten)" },
  { value: "'Shadows Into Light', cursive", label: "Shadows Into Light" },
  { value: "Inter, sans-serif",          label: "Inter" },
  { value: "Georgia, serif",             label: "Georgia" },
  { value: "'Courier New', monospace",   label: "Courier New" },
  { value: "'Comic Sans MS', cursive",   label: "Comic Sans" },
  { value: "system-ui, sans-serif",      label: "System UI" },
];
