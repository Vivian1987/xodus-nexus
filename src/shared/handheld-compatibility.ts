/** Microsoft's Windows PC handheld program; never a Linux/Proton certification. */
export interface HandheldCompatibility {
  rating: 'optimized' | 'playable' | 'unsupported' | 'unknown';
  source: 'microsoft-catalog';
  platform: 'windows-pc';
  /** Explicit provider classification, without interpreting unrelated capabilities. */
  rawRating: number;
  /** Individual published results; an overall rating does not populate these. */
  criteria?: {
    id: 'defaults-work' | 'iconography' | 'text-input' | 'ui-legibility' | 'supported-display';
    rating: HandheldCompatibility['rating'];
  }[];
}
