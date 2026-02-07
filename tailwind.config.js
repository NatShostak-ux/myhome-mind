/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                bg: '#FBFBF9',
                card: '#FFFFFF',
                text: '#2D2D2D',
                secondary: '#717171',
                accent: '#E5DED4',
                border: '#ECECEC',
                success: '#9CAF88'
            }
        },
    },
    plugins: [],
}
