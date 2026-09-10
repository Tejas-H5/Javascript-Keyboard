import * as esbuild from 'esbuild'
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import * as http from "http";
import { ChildProcess, spawn } from "node:child_process"

// @Tejas-H5: esbuild-build-script V0.0.5
// Add these scripts to your package.json
/** 
	"dev": "node ./build/build.ts devserver",
	"build": "node ./build/build.ts build"
*/

const config = process.argv[2];

if (config !== "devserver" && config !== "build") {
	throw new Error(
		"Got " + config + " instead of 'devserver' or 'build'"
	);
}

const HOST = "localhost";
const PORT = 5173;

const IMPORT_META_ENV = {
	IS_PROD: config === "build",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, "../");

const TEMPLATE_PATH = path.join(BASE_DIR, "/template.html");
const OUTPUT_FILE = path.join(BASE_DIR, "/dist/index.html");
const ENTRYPOINT = path.join(BASE_DIR, "/src/main.ts");

// NOTE: faster-reload is only really noticeable if you have your code and your website open at once.
// If you use a single-monitor alt-tab setup like me, you won't notice the difference.
const WORKING_SOURCEMAPS_OR_FASTER_RELOAD = "working-sourcemaps"
// const WORKING_SOURCEMAPS_OR_FASTER_RELOAD = "faster-reload"

// It isn't faster for some reason??
const USE_TSGO = false;

const templateString = await fs.readFile(TEMPLATE_PATH, "utf8");

const target = "{SCRIPT}";
const [templateStart, templateEnd] = templateString.split(target, 2);
if (!templateEnd) {
	throw new Error(`Target (${target}) was not found anywhere in the template`);
}

function getLogPrefix() {
	return "[" + config + "]";
}

function log(...messages: any[]) {
	console.log(getLogPrefix(), ...messages);
}

function logTrace(...messages: any[]) {
	// console.log(getLogPrefix(), ...messages);
}

function logError(...messages: any[]) {
	console.error(getLogPrefix(), ...messages);
}

function logServerUrl() {
	log(`http://${HOST}:${PORT}`);
}

const commonBuildOptions: esbuild.BuildOptions = {
	entryPoints: [ENTRYPOINT],
	bundle: true,
	treeShaking: true,
	define: Object.fromEntries(
		Object
			.entries(IMPORT_META_ENV)
			.map(([k, v]) => ["import.meta.env." + k, JSON.stringify(v)])
	),
	write: false,
	sourcemap: config === "devserver" ? "inline" : undefined,
}

let tscProcessLast: ChildProcess | undefined;
let lintingStartTime: number = 0;
async function runTscAndGetErrors() {
	const sb: string[] = [];
	const sbErr: string[] = [];

	if (tscProcessLast) {
		tscProcessLast.kill();
		log("Cancelled last linting run.");
	}

	if (config === "devserver") {
		console.clear();
	}

	const process = USE_TSGO ? "npx tsgo" : "tsc";
	log("Linting with " + process + " ...");
	lintingStartTime = performance.now();
	const tscProcess = spawn(process, {
		shell: true,
		cwd: BASE_DIR,
	}).on("error", err => { throw err });
	tscProcessLast = tscProcess;

	for await (const data of tscProcess.stdout) {
		sb.push(data);
		logTrace(`stdout chunk: ${data}`);
	}

	for await (const data of tscProcess.stderr) {
		sbErr.push(data);
		logTrace(`stderr chunk: ${data}`);
	}

	await new Promise<void>((resolve) => {
		tscProcess.on('close', (code) => {
			tscProcessLast = undefined;
			logTrace(`child process exited with code ${code}`);
			resolve();
		});
	});

	if (tscProcess.killed) {
		sb.push("....... Process was killed");
	}

	return {
		killed: tscProcess.killed,
		result: sb.join("\n"),
		error: sbErr.join("\n")
	};
}

function getBundledJs(result: esbuild.BuildResult): string {
	const singlarFile = result.outputFiles?.[0];
	if (!singlarFile) {
		console.error("Build not working as expected. See:");

		const locationsMap = new Map<string, number>();
		for (const error of result.errors) {
			if (error.location) {
				const file = error.location.file;
				let val = locationsMap.get(file) ?? 0;
				locationsMap.set(file, val + 1);
			}
		}

		[...locationsMap]
			.sort((a, b) => b[1] - a[1])
			.forEach(([loc, count]) => console.error(`\t${loc} -> ${count}`));

		throw new Error("Multiple blockers encountered");
	}

	return singlarFile.text;
}

function getSingleFileScript(bundledJs: string) {
	return `
<script>${bundledJs}</script>
`;
}

function getProdHtml(bundledJs: string) {
	return templateStart + getSingleFileScript(bundledJs) + templateEnd;
}

function getSSEAutoReloadScript() {
		return `
<script>
new EventSource('/events').addEventListener('change', (e) => location.reload())
</script>
`;
}

function getDevHtmlFastReload(bundledJs: string) {
	return templateStart + 
		getSingleFileScript(bundledJs) + 
		getSSEAutoReloadScript() +
		templateEnd;
}

function getDevHtmlWorkingSourcemaps() {
	// The sourcemaps won't work in the normal thing for some reason.
	return templateStart + `
<script src="/index.js"></script>
` + getSSEAutoReloadScript() +
		templateEnd;
}

function getErrorMap(result: string): string {
	let message = result;

	// A count of how many errors occured in each file. Very useful
	const errorCounts = new Map<string, number>();

	for (const line of result.split("\n")) {
		const file = line.split(" ", 2)[0];
		if (!file) continue;
		if (!file.includes("/")) continue;

		const lineNumberStart = file.indexOf("(");
		if (lineNumberStart === -1) continue;

		const key = file.substring(0, lineNumberStart);
		errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1)
	}

	message += "\n\n"
	for (const [file, count] of errorCounts) {
		message += `${count} errors -> ${file}\n`;
	}

	return message;
}

if (config === "build") {
	log("Building...");

	const { result, error } = await runTscAndGetErrors();
	if (error.length > 0 || result.length > 0) {
		// Pipeline should fail
		if (error) throw new Error(error);

		if (result) {
			const message = getErrorMap(result);
			throw new Error(message);
		}
	}

	await esbuild.build({
		...commonBuildOptions,
		plugins: [{
			name: "Custom dev server plugin",
			setup(build) {
				build.onEnd((result) => {
					const bundedJs = getBundledJs(result);
					const output = getProdHtml(bundedJs);
					fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
					fs.writeFile(OUTPUT_FILE, output);

					function bytesToMegabytes(bytes: number) {
						return bytes / 1024 / 1024;
					}

					log("Built - wrote " + bytesToMegabytes(output.length) + "mb");
				});
			},
		}],
	});
} else if (config === "devserver") {
	function newServer() {
		let currentFile = `console.log("Hello there")`;
		let currentScript = `console.log("Hello there 2")`

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
				logTrace("clients: ", clients.size);

				req.on("close", () => {
					clients.delete(res);
					logTrace("clients: ", clients.size);
					res.end();
				});
				return;
			}

			if (req.url === "/index.js") {
				res.writeHead(200, { 'Content-Type': 'text/javascript', });
				res.write(currentScript);
				res.end();
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html', });
			res.write(currentFile);
			res.end();
		});

		// MASSIVE performance boost. Web devs hate me for this one wierd trick.
		// Seems stupid, and it would be if it was a production server, but it isn't - 
		// it will only ever have 1 connection. So this should actually work just fine.
		// The Vite maintainers have been informed: https://github.com/vitejs/vite/issues/21653
		// and in the meantime, we will just use this custom dev-server with ESBuild.
		// I am curious if this will be triaged before I ship this framework. 
		// In the meantime, I will open it a couple of times every hour, ever day
		server.keepAliveTimeout = 2147480000;

		server.listen(PORT, HOST, () => {
			logServerUrl();
		});

		function setCurrentFile(newFile: string) {
			currentFile = newFile;
		}

		function setCurrentScript(newScript: string) {
			currentScript = newScript;
		}

		function broadcastRefreshMessage() {
			for (const client of clients) {
				client.write(`event: change\n`);
				client.write(`data: true\n\n`);
			}
			logTrace("refreshed x", clients.size);
		}

		return {
			server,
			setCurrentFile,
			setCurrentScript,
			broadcastRefreshMessage,
		};
	}

	const { setCurrentScript, setCurrentFile, broadcastRefreshMessage } = newServer();

	const ctx = await esbuild.context({
		...commonBuildOptions,
		plugins: [{
			name: "Custom dev server plugin",
			setup(build) {
				build.onEnd((result) => {
					// TODO: fix bug where we put the PC to sleep, reopen and auto-reload is broken

					const bundledJs = getBundledJs(result);
					if (WORKING_SOURCEMAPS_OR_FASTER_RELOAD === "working-sourcemaps") {
						setCurrentFile(getDevHtmlWorkingSourcemaps());
						setCurrentScript(bundledJs);
					} else {
						setCurrentFile(getDevHtmlFastReload(bundledJs));
						setCurrentScript("");
					}

					broadcastRefreshMessage();
					runTscAndGetErrors()
						.then((result) => {
							if (result.killed) return;

							if (result.result.length === 0) {
								log("Type errors: None!");
							} else {
								log("Type errors: \n\n" + getErrorMap(result.result));
							}

							log("Time taken: " + (performance.now() - lintingStartTime) + "ms");
							logServerUrl();
						});
				});
			},
		}],
	});

	await ctx.watch();
} else {
	throw new Error("Invalid config");
}

