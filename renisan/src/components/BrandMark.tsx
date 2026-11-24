/**
 * The Renisan mark: a graduation cap inside a ring, drawn flat in the brand gold
 * (currentColor, set by .brand-mark) so it follows the theme.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg class="brand-mark" aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} fill="none">
      <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2.5" opacity="0.4" />
      <path d="M6.5 13.5 16 9l9.5 4.5L16 18z" fill="currentColor" />
      <path d="M10.5 15.8v4.2c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M25.5 13.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}
