module.exports = {
  content: ['./frontend/index.html', './frontend/src/main.js'],
  theme: {
    extend: {
      colors: {
        surface: '#fafaf7',
        sidebar: '#eceae4',
        editor: '#fffffc',
        border: '#d8d6ce',
        'border-soft': '#e8e6df',
        muted: '#6b6e68',
        accent: '#2f6f61',
        'accent-hover': '#267058',
        'accent-text': '#fffffb',
        selected: '#dde8df',
        hover: '#e7ece5',
        unsaved: '#c57933',
        star: '#d49e2a',
        'star-off': '#b8b5ad',
        danger: '#c54b33',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
    },
  },
};
