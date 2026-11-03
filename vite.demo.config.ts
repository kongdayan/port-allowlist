import {defineConfig} from 'vite';
export default defineConfig({base:'./',build:{outDir:'demo-dist',target:'es2022'},server:{host:'localhost',port:8800}});
