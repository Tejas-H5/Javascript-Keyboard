import { defineConfig } from 'vite'
import { viteSingleFile } from "vite-plugin-singlefile"
import path from 'path';

export default defineConfig({
  base: "/Working-on-Tree/",
  plugins: [viteSingleFile()],
  build: {
    // Would like people to see the source code of the thing they're using actually - it should 
    // make bug reporting and open source contributions a bit easier.
    minify: false,
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src/")
    }
  }
});
