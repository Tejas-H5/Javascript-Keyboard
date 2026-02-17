import * as esbuild from 'esbuild'
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import * as http from "http";

const config = process.argv[2];

if (config !== "devserver" && config !== "build") {
	throw new Error(
		"Got " + config + " instead of 'devserver' or 'build'"
	);
}

const HOST = "localhost";
const PORT = 5174;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BASE_DIR   = path.join(__dirname, "/../");

const TEMPLATE_PATH = path.join(BASE_DIR, "/template.html");
const OUTPUT_FILE   = path.join(BASE_DIR, "/dist/index.html");
const ENTRYPOINT    = path.join(BASE_DIR, "/src/entrypoint.ts");

const templateString = await fs.readFile(TEMPLATE_PATH, "utf8");

const target = "{SCRIPT}";
const [templateStart, templateEnd] = templateString.split(target, 2);
if (!templateEnd) {
	throw new Error(`Target (${target}) was not found anywhere in the template`);
}

function log(...messages: any[]) {
	console.log("[dev-server]", ...messages);
}

function logError(...messages: any[]) {
	console.error("[dev-server]", ...messages);
}

const commonBuildOptions: esbuild.BuildOptions = {
	entryPoints: [ENTRYPOINT],
	bundle: true,
	treeShaking: true,
	sourceRoot: path.join(__dirname, '/../src'),
	define: {
		"import.meta.env.IS_PROD": JSON.stringify(config === "build"),
	},
	write: false,
}

function getOutputHtml(result: esbuild.BuildResult) {
	const singlarFile = result.outputFiles?.[0];
	if (!singlarFile) {
		throw new Error("Build not working as expected");
	}

	// TODO: handle the </script> edgecase - if this text appears anywhere in our code, right now, we're toast
	let outputText = templateStart + singlarFile.text + templateEnd;
	return outputText;
}

if (config === "build") {
	log("Building...");
	await esbuild.build({
		...commonBuildOptions,
		plugins: [{
			name: "Custom dev server plugin",
			setup(build) {
				build.onEnd((result) => {
					const outputText = getOutputHtml(result);
					fs.writeFile(OUTPUT_FILE, outputText);
				});
			},
		}],
	});
	log("Built");
} else {
	function newServer() {
		let currentFile = templateStart + `console.log("Hello there")`;

		const clients = new Set<http.ServerResponse>();

		const server = http.createServer((req, res) => {
			if (req.url === "/events") {
				res.writeHead(200, { 
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
				});
				res.write(`event: first_event\n\n`);
				res.write(`data: refreshUrself\n\n`);

				clients.add(res);
				log("clients: ", clients.size);

				req.on("close", () => {
					clients.delete(res);
					log("clients: ", clients.size);
					res.end();
				});
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html', });
			res.write(currentFile);
			res.end();
		});

		// MASSIVE performance boost. 
		// Seems stupid, and it would be if it was a production server, but it isn't - 
		// it will only ever have 1 connection. So this should actually work just fine.
		server.keepAliveTimeout = 2147480000;

		server.listen(PORT, HOST, () => {
			log(`Server is running on http://${HOST}:${PORT}`);
		});

		function setCurrentFile(newFile: string) {
			currentFile = newFile;
		}

		function broadcastRefreshMessage() {
			for (const client of clients) {
				client.write(`event: change\n`);
				client.write(`data: true\n\n`);
			}
			log("refreshed x", clients.size);
		}

		return {
			server,
			setCurrentFile,
			broadcastRefreshMessage,
		};
	}

	const { setCurrentFile, broadcastRefreshMessage } = newServer();

	const ctx = await esbuild.context({
		...commonBuildOptions,
		footer: {
			js: "new EventSource('/events').addEventListener('change', (e) => location.reload())",
		},
		plugins: [{
			name: "Custom dev server plugin",
			setup(build) {
				build.onEnd((result) => {
					const outputText = getOutputHtml(result);
					setCurrentFile(outputText);
					broadcastRefreshMessage();
				});
			},
		}],
	});

	await ctx.watch();
}

