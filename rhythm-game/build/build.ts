import * as esbuild from 'esbuild'
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import * as http from "http";
import { ChildProcess, spawn } from "node:child_process"

// Internal version: 0.0.4
//
// "dev"    runs a development server that rebuilds and restarts 
//			 your website whenever a change is made.
//
// "build"  builds the final artifact.
//
// Dependencies:
//	- tsc must be installed and present on the PATH

/** Add these scripts to your package.json
	"dev": "node ./build/build.ts dev",
	"build": "node ./build/build.ts build"
*/

const config = process.argv[2];

if (config !== "dev" && config !== "build") {
	throw new Error(
		"Got " + config + " instead of 'dev' or 'build'"
	);
}

const HOST = "localhost";
const PORT = 5174;

const IMPORT_META_ENV = {
	IS_PROD: config === "build",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BASE_DIR   = path.join(__dirname, "../");

const TEMPLATE_PATH = path.join(BASE_DIR, "/template.html");
const OUTPUT_FILE   = path.join(BASE_DIR, "/dist/index.html");
const ENTRYPOINT    = path.join(BASE_DIR, "/src/entrypoint.ts");

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

const commonBuildOptions: esbuild.BuildOptions = {
	entryPoints: [ENTRYPOINT],
	bundle: true,
	treeShaking: true,
	sourceRoot: path.join(__dirname, '/../src'),
	define: Object.fromEntries(
		Object
			.entries(IMPORT_META_ENV)
			.map(([k, v]) => ["import.meta.env." + k, JSON.stringify(v)])
	),
	write: false,
}

let tscProcessLast: ChildProcess | undefined;
async function runTscAndGetErrors() {
	const sb: string[] = [];
	const sbErr: string[] = [];

	if (tscProcessLast) {
		tscProcessLast.kill();
		log("Cancelled last linting run.");
	}

	if (config === "dev") {
		console.clear();
	}

	log("Linting ... ");

	const tscProcess = spawn("tsc", {
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

	const { result, error } = await runTscAndGetErrors();
	if (error.length > 0 || result.length > 0) {
		// Pipeline should fail
		if (result) throw new Error(result);
		throw new Error(error);
	}

	await esbuild.build({
		...commonBuildOptions,
		plugins: [{
			name: "Custom dev server plugin",
			setup(build) {
				build.onEnd((result) => {
					const outputText = getOutputHtml(result);
					fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
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
				logTrace("clients: ", clients.size);

				req.on("close", () => {
					clients.delete(res);
					logTrace("clients: ", clients.size);
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
			logTrace("refreshed x", clients.size);
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
					runTscAndGetErrors()
						.then((result) => {
							if (result.killed) return;
							if (result.result.length === 0) {
								log("Type errors: None!");
							} else {
								log("Type errors: \n\n" + result.result);
							}
						});
				});
			},
		}],
	});

	await ctx.watch();
}

