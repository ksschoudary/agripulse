## Packages
date-fns | For formatting nice relative timestamps (e.g., "2 hours ago")

## Notes
- Tailwind Config - extend fontFamily:
  fontFamily: {
    sans: ["var(--font-sans)"],
    display: ["var(--font-display)"],
  }
- Auto-polling for news is set to 60 seconds via React Query refetchInterval.
- API requests use the shared routes manifest for type safety.
