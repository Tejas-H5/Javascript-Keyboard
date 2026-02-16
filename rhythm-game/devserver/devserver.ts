import * as esbuild from 'esbuild'
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import * as http from "http";
import * as ws from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const templatePath = path.join(__dirname, "/../template.html");

const templateString = await fs.readFile(templatePath, "utf8");
const target = "{SCRIPT}";
const [templateStart, templateEnd] = templateString.split(target, 2);

let startServer = false;
let currentFile = Buffer.from(templateStart + `console.log("Hello there")` + templateEnd, 'utf8');

let footer = ``;


const host = "localhost"
const port = 5174;
const portws = port + 1;
const WEBSOCKET_URL = `ws://${host}:${portws}`;

const wss = new ws.WebSocketServer({
	host: host,
	port: portws,
	perMessageDeflate: false,
});

const MessageCodes = {
	Refresh: 70,
};

function broadcastRefreshMessage() {
	console.log("[websockets] broadcastRefreshMessage sent");
	wss.clients?.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(MessageCodes.Refresh);
		}
	});
}


// Dev server
{

	// Footer code
	{
		function footerCode() {
			const socket = new WebSocket(WEBSOCKET_URL);

			// Executes when the connection is successfully established.
			socket.addEventListener('open', event => {
				console.log('WebSocket connection established!');
				// Sends a message to the WebSocket server.
				socket.send('Hello Server!');
			});

			// Listen for messages and executes when a message is received from the server.
			socket.addEventListener('message', event => {
				console.log('Message from server: ', event.data);
				window.location.reload();
			});

			// Executes when the connection is closed, providing the close code and reason.
			socket.addEventListener('close', event => {
				console.log('WebSocket connection closed:', event.code, event.reason);
			});

			// Executes if an error occurs during the WebSocket communication.
			socket.addEventListener('error', error => {
				console.error('WebSocket error:', error);
			});
		}

		footer = `
${Object.entries({
			WEBSOCKET_URL
		}).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`).join("\n")}
(${footerCode})();
`;
		// console.log(footer);
	}

	// Web socket server
	{
		wss.on('connection', (ws) => {
			ws.on('error', console.error);

			ws.on('message', (data) => {
				console.log('received: %s', data);
			})
		});
	}

	if (startServer) {
		const server = http.createServer((req, res) => {
			res.writeHead(200, {
				'Content-Type': 'text/html',
				'Content-Length': currentFile.length,
			});
			res.end(currentFile);
		});

		server.listen(port, host, () => {
			console.log(`Server is running on http://${host}:${port}`);
		});
	}
}

const outdir = path.join(__dirname, '/../dist2');
const outputFile = path.join(outdir, "result-dev.html");

if (!startServer) {
	console.log(`Open the output on ${pathToFileURL(outputFile)}`);
}

const ctx = await esbuild.context({
	entryPoints: [path.join(__dirname, '/../src/entrypoint.ts')],
	bundle: true,
	treeShaking: true,
	outdir: outdir,
	footer: { js: footer },
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

				// You won't believe this - 
				// but what this dev server does, is write a file output. 
				// You should open that file. It will open a websocket
				// connection to this server, and reload INSTANTLY
				// when we make a change - this is NOT the case
				// when we serve the file via a normal HTTP server for some reason.

				if (startServer) {
					currentFile = Buffer.from(outputText, 'utf8');
				} else {
					fs.writeFile(outputFile, outputText);
				}

				broadcastRefreshMessage();
			});
		},
	}]
})

await ctx.watch();
