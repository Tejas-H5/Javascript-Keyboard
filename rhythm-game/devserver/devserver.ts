import * as esbuild from 'esbuild'
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import * as http from "http";
import * as ws from "ws";

const HOST          = "localhost";
const PORT          = 5174;
const PORTWS        = PORT + 1;
const WEBSOCKET_URL = `ws://${HOST}:${PORTWS}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const templatePath = path.join(__dirname, "/../template.html");
const templateString = await fs.readFile(templatePath, "utf8");

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

function generateFooter(): string {
	const variables = Object.entries({
		WEBSOCKET_URL,
		MessageCodes
	}).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`).join("\n");
	function footerCode() {
		function log(...messages: any[]) {
			console.log("[dev-server client]", ...messages);
		}
		function logError(...messages: any[]) {
			console.error("[dev-server client]", ...messages);
		}

		const socket = new WebSocket(WEBSOCKET_URL);

		socket.addEventListener("open", event => {
			log("Connection to dev-server established");
			socket.send("Client successfully connected");
		});

		socket.addEventListener("message", event => {
			log("Recieved message: " + event.data);
			switch (event.data) {
				case MessageCodes.Refresh: {
					window.location.reload();
				} break;
			}
		});

		socket.addEventListener("close", event => {
			log("Connection to dev-server closed: ", event.code, event.reason, "you'll need to reload the page manually");
		});

		// Executes if an error occurs during the WebSocket communication.
		socket.addEventListener("error", error => {
			logError("Connection to dev-server closed due to error: ", error, "you'll need to reload the page manually");
		});
	}

	return `${variables}\n (${footerCode})()`
}

const MessageCodes = {
	Refresh: "Refresh",
};

function newWebSocketServer() {
	const wss = new ws.WebSocketServer({
		host: HOST,
		port: PORTWS,
		perMessageDeflate: false,
	});

	wss.on("connection", (w) => {
		w.on("open", () => {
			log("Connected to a client! Current clients: ", (wss.clients?.length) ?? 0);
		});
	});

	function broadcastRefreshMessage() {
		let clients = 0;
		wss.clients?.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				clients++;
				client.send(MessageCodes.Refresh);
			}
		});

		log("Triggered reload x" + clients);
	}

	return {
		wss,
		broadcastRefreshMessage,
	};
}

function newServer() {
	let currentFile = templateStart + `console.log("Hello there")`;

	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html', });
		res.write(currentFile);
		res.end();
	});

	// MASSIVE performance boost. 
	// Seems stupid, but it works.
	server.keepAliveTimeout = 2147480000;

	server.listen(PORT, HOST, () => {
		log(`Server is running on http://${HOST}:${PORT}`);
	});

	function setCurrentFile(newFile: string) {
		currentFile = newFile;
	}

	return { 
		server,
		setCurrentFile
	};
}


const outdir = path.join(__dirname, '/../dist2');

const { broadcastRefreshMessage } = newWebSocketServer();
const { setCurrentFile } = newServer();

const ctx = await esbuild.context({
	entryPoints: [path.join(__dirname, '/../src/entrypoint.ts')],
	bundle: true,
	treeShaking: true,
	outdir: outdir,
	footer: { 
		js: generateFooter(),
	},
	sourceRoot: path.join(__dirname, '/../src'),
	define: {
		"import.meta.env.PROD": "false",
	},
	write: false,
	plugins: [{
		name: "Custom dev server plugin",
		setup(build) {
			build.onEnd((result) => {
				const singlarFile = result.outputFiles?.[0];
				if (!singlarFile) {
					throw new Error("Build not working as expected");
				}

				// TODO: handle the </script> edgecase - if this text appears anywhere in our code, right now, we're toast
				let outputText = templateStart + singlarFile.text + templateEnd;
				setCurrentFile(outputText);
				broadcastRefreshMessage();
			});
		},
	}]
})

await ctx.watch();
