import { defineConfig } from 'vite'

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                login: 'login.html',
                admin: 'admin.html',
                track: 'track.html'
            }
        }
    }
})
