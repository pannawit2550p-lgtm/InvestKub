import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gain: '#16a34a',
        loss: '#dc2626',
        accent: '#2563eb',
      },
    },
  },
  plugins: [],
};

export default config;
