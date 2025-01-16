import { initializeDomUtils, newInsertable } from "./utils/dom-utils";
import { initStyles } from "./views/styling";

export const domRoot = newInsertable(document.body);
initializeDomUtils(domRoot);
const styles = initStyles(domRoot);

const cnColourLiterals = styles.colours;
const cnColourVars = styles.colourVars;
const cnSizeVars = styles.sizeVars;
const cnStyle = styles.cnStyle;
const cnLayout = styles.cnLayout;

export const cn = {
    ...cnColourLiterals,
    ...cnColourVars,
    ...cnSizeVars,
    ...cnStyle,
    ...cnLayout,
};
