import fs from "node:fs";
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dirToWatch = path.join(__dirname, "/../");
const DEBOUNCE   = 50;

function filenameFilter(name: string): boolean {
	if (name.endsWith("index.html")) return true;
	if (name.endsWith(".ts")) return true;
	if (name.endsWith(".js")) return true;

	return false;
}

function dependencyFilter(name: string): boolean {
	switch (name) {
		// TODO: add our non-dev dependencies. We currently have 0!!!
	}
	return false;
}

let loading = false;
let filenamesUpdated = new Set<string>();
let processFilesTimeout: NodeJS.Timeout | null = null;
let allFiles = new Map<string, {
	path: string;
	data: string;
	version: number;
}>(); // Map<absolute path -> text content>

function initializeAllFiles() {
	function walk(dir: string, cb: (path: string, stats: fs.Stats) => void) {
		fs.readdir(dir, (err, files) => {
			if (err) throw err;

			for (const name of files) {
				if (path.basename(dir) === "node_modules") {
					if (!dependencyFilter(name)) {
						continue;
					}
					console.log("Loading dependency ", name, " ...");
				}

				const filepath = path.join(dir, name);
				fs.stat(filepath, (err, stats) => {
					if (err) throw err;

					if (stats.isDirectory()) {
						walk(filepath, cb);
					} else if (stats.isFile()) {
						cb(filepath, stats);
					} 
				});
			}
		});
	}

	walk(dirToWatch, (path) => onFileChanged(path));
}

initializeAllFiles();

function getOrCreateSlot(path: string) {
	let slot = allFiles.get(path);
	if (!slot) {
		slot = { path: path, data: "", version: 0 };
		allFiles.set(path, slot);
	}

	return slot;
}

function onFileChanged(filename: string) {
	if (!filename)                 return;
	if (filename.endsWith("~"))    return;
	if (!filenameFilter(filename)) return;

	filenamesUpdated.add(filename);
	processQueueDebounced();
}

fs.watch(dirToWatch, { recursive: true }, (event, name) => {
	if (!name) return;
	const filename = path.join(dirToWatch, name);
	onFileChanged(filename);
});

function processQueueDebounced() {
	if (processFilesTimeout != null) clearTimeout(processFilesTimeout);

	if (!loading) {
		console.log("Loading...");
		loading = true;
	}

	processFilesTimeout = setTimeout(() => {
		processQueue();
		filenamesUpdated.clear();
	}, DEBOUNCE);
}

function processQueue() {
	const count = filenamesUpdated.size;
	let finished = 0;

	const handleNewFilesWrapper = () => {
		finished += 1;
		if (count === finished) {
			handleNewFiles();
		}
	}

	for (const name of filenamesUpdated) {
		const slot = getOrCreateSlot(name);
		slot.version += 1;
		const version = slot.version;

		try {
			fs.stat(name, (err, stats) => {
				if (slot.version !== version) return;
				if (err) return console.error(err);
				if (!stats.isFile()) return;

				fs.readFile(name, "utf8", (err, data) => {
					if (slot.version !== version) return;
					if (err) return console.error(err);

					slot.data = data;
					handleNewFilesWrapper();
				});
			});
		} catch (err) {
			// File was probably removed
			slot.data = "";
			handleNewFilesWrapper();
		}
	}
}

// Cool learning experience, but totally useless. Can't feed this to esbuild. xDD
function handleNewFiles() {
	loading = false;
	console.log("Ready");


	const allFilesArray = [...allFiles.values()];

	let count = 0;
	for (const file of allFilesArray) {
		if (file.data.length === 0) continue;
		count += file.data.length;
	}

	console.log("total char count: ", count);

	const topTen = [...allFilesArray]
		.sort((a, b) => b.data.length - a.data.length)
		.slice(0, 10);

	console.log("Top 10:")
	console.log(topTen.map(val => val.path + " => " + val.data.length).join("\n"))
}

