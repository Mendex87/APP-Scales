# Performance Baseline

## v3.0.2 baseline before preview-performance changes

- Command: `npm run build`
- Measured total build command time: 6.37s
- Vite build time: 1.41s
- Modules transformed: 1792
- HTML: 2.82 kB (0.90 kB gzip)
- CSS: 58.10 kB (11.03 kB gzip)
- JS: 490.07 kB (135.09 kB gzip)

## Runtime data-volume logging

The preview adds a one-time browser console log after initial data load:

`[Calibra Cinta performance]`

It records:

- app version
- data source
- equipment count
- chain count
- event count
- initial data load time in milliseconds

Use this log on desktop and mobile to compare real data volume and load time before/after changes without exposing internal provider details in the UI.

## v3.0.3 preview-performance build after changes

- Command: `npm run build`
- Measured total build command time: 5.41s
- Vite build time: 1.38s
- Modules transformed: 1797
- HTML: 2.82 kB (0.90 kB gzip)
- CSS: 58.29 kB (11.07 kB gzip)
- Main JS: 490.56 kB (135.94 kB gzip)
- Lazy history chunk: 2.99 kB (1.32 kB gzip)

## Notes

- Initial render now avoids painting every filtered history event at once; the UI renders 25 history cards per page.
- The history card component is code-split and loaded on demand when the history list renders.
- Equipment photos now use lazy image loading and async decoding.
