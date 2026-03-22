import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html'),
                admin: resolve(__dirname, 'admin.html'),
                track: resolve(__dirname, 'track.html'),

            }
        }
    }
})
