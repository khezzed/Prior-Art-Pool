/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        subtle: 'var(--bg-subtle)',
        surface: 'var(--bg-surface)',
        inset: 'var(--bg-inset)',
        hoverbg: 'var(--bg-hover)',
        ink: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          onAccent: 'var(--text-on-accent)',
        },
        line: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        brand: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
        },
        pass: {
          ink: 'var(--status-pass-ink)',
          bg: 'var(--status-pass-bg)',
          border: 'var(--status-pass-border)',
        },
        fail: {
          ink: 'var(--status-fail-ink)',
          bg: 'var(--status-fail-bg)',
          border: 'var(--status-fail-border)',
        },
        warn: {
          ink: 'var(--status-warn-ink)',
          bg: 'var(--status-warn-bg)',
          border: 'var(--status-warn-border)',
        },
        neutralst: {
          ink: 'var(--status-neutral-ink)',
          bg: 'var(--status-neutral-bg)',
          border: 'var(--status-neutral-border)',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)'],
        sans: ['var(--font-sans)'],
        code: ['var(--font-code)'],
      },
      fontSize: {
        dossier: ['var(--text-dossier)', { lineHeight: '1.18', letterSpacing: '-0.025em' }],
        heading: ['var(--text-heading)', { lineHeight: '1.32', letterSpacing: '-0.015em' }],
        body: ['var(--text-body)', { lineHeight: '1.58' }],
        compact: ['var(--text-compact)', { lineHeight: '1.45' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sheet: 'var(--shadow-sheet)',
        control: 'var(--shadow-control)',
      },
    },
  },
  plugins: [],
};
