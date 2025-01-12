import { initializeDomUtils, newInsertable } from "./utils/dom-utils";
import { initStyles } from "./views/styling";

export const domRoot = newInsertable(document.body);
initializeDomUtils(domRoot);
const styles = initStyles(domRoot);

export const colours = styles.colours;
export const cnColourVars = styles.colourVars;
export const cnSizeVars = styles.sizeVars;
export const cnStyle = styles.cnStyle;
export const cnLayout = styles.cnLayout;
