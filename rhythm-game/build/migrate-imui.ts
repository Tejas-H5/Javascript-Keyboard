import path from 'node:path';
import fs from 'node:fs/promises';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BASE_DIR   = path.join(__dirname, "../");

for await (const file of fs.glob("**/*.ts", { cwd: BASE_DIR })) {
	if (file.includes("node_modules")) continue;
	if (file.includes("migrate")) continue;
	if (file.includes("im-ui")) continue;

	const filePath = path.join(BASE_DIR, file);

	let newText = await fs.readFile(filePath, { encoding: "utf-8" });

	newText = newText
		.replace(/\bnewCssBuilder\b/g, "imui.newCssBuilder")      
		.replace(/\bgetCssVarsDict\b/g, "imui.getCssVarsDict")     
		// .replace(/\bgetCurrentTheme\b/g, "imui.getCurrentTheme") 
		.replace(/\bsetCurrentTheme\b/g, "imui.setCurrentTheme") 
		.replace(/\bsetCssVar\b/g, "imui.setCssVar")
		.replace(/\bnewColor\b/g, "imui.newColor")
		.replace(/\bnewColorFromHexOrUndefined\b/g, "imui.newColorFromHexOrUndefined")
		.replace(/\bnewColorFromHex\b/g, "imui.newColorFromHex")
		.replace(/\bnewColorFromHsv\b/g, "imui.newColorFromHsv")
		.replace(/\blerpColor\b/g, "imui.lerpColor")
		.replace(/\binitImUi\b/g, "imui.init")
		.replace(/\bimRelative\b/g, "imui.Relative")
		.replace(/\bimFixed\b/g, "imui.Fixed")
		.replace(/\bimAbsolute\b/g, "imui.Absolute")
		.replace(/\bimAbsoluteXY\b/g, "imui.AbsoluteXY")
		.replace(/\bimScrollOverflow\b/g, "imui.ScrollOverflow")
		.replace(/\bimZIndex\b/g, "imui.ZIndex")
		.replace(/\bimPre\b/g, "imui.Pre")
		.replace(/\bimPreWrap\b/g, "imui.PreWrap")
		.replace(/\bimNoWrap\b/g, "imui.NoWrap")
		.replace(/\bimHandleLongWords\b/g, "imui.HandleLongWords")
		.replace(/\bimAlign\b/g, "imui.Align")
		.replace(/\bimJustify\b/g, "imui.Justify")
		.replace(/\bimFlex\b/g, "imui.Flex")
		.replace(/\bimFlex1\b/g, "imui.Flex1")
		.replace(/\bimFlexWrap\b/g, "imui.FlexWrap")
		.replace(/\bimSize\b/g, "imui.Size")
		.replace(/\bimPadding\b/g, "imui.Padding")
		.replace(/\bimGap\b/g, "imui.Gap")
		.replace(/\bimAspectRatio\b/g, "imui.AspectRatio")
		.replace(/\bimLayoutBeginInternal\b/g, "imui.LayoutBeginInternal")
		.replace(/\bimLayout\b/g, "imui.Layout")
		.replace(/\bimLayoutBegin\b/g, "imui.Begin")
		.replace(/\bimLayoutEnd\b/g, "imui.End")
		.replace(/\bimLayoutBegin\b/g, "imui.LayoutBegin")
		.replace(/\bimLayoutEnd\b/g, "imui.LayoutEnd")
		.replace(/\bimOpacity\b/g, "imui.Opacity")
		.replace(/\bimBg\b/g, "imui.Bg")
		.replace(/\bimFg\b/g, "imui.Fg")
		.replace(/\bimFontSize\b/g, "imui.FontSize")
		.replace(/\binitCssbStyles\b/g, "imui.init");

	newText = newText
		.replace(/(imui\.)+/g, "imui.")

	newText = replaceBetween(newText, "import ", "core/layout\";", `import { imui, BLOCK, ROW, COL, PX, NA } from "src/utils/im-js/im-ui";`);
	newText = replaceBetween(newText, "import ", "core/stylesheets\";", "");
	newText = replaceBetween(newText, "import ", "cssb\";", "");
	newText = replaceBetween(newText, "import ", "dom-utils\";", "");

	await fs.writeFile(filePath, newText);

	console.log("Updated " + filePath);
}

function replaceBetween(text: string, from: string, to: string, replacement: string): string {
	const idx = text.indexOf(to);
	if (idx === -1) return text;

	const fromIdx = text.lastIndexOf(from, idx);
	if (fromIdx === -1) return text;

	return text.substring(0, fromIdx) + replacement + text.substring(idx + to.length);
}
