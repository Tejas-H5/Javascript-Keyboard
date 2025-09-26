// A single file with all the test flags to enable/disable various scenarios for testing purposes.
// If you need a particular view or particular data to be loaded ever time you refresh, this is the place to configure that.

export const IS_PROD = import.meta.env.PROD;

const ON = IS_PROD ? 0 : 1;
const OFF = 0;

export const TEST_EDIT_VIEW         = ON;
export const TEST_LOAD_SAVE         = ON;

export const TEST_EDIT_VIEW_EXPORT  = OFF;
export const TEST_EDIT_VIEW_IMPORT  = OFF;
export const TEST_COPY_MODAL        = OFF;
export const TEST_CHART             = "Melange Copy";
export const DEBUG_UNDO_BUFFER      = OFF;
export const TEST_CHART_SELECT_VIEW = OFF;

export const TEST_GAMEPLAY          = OFF;
export const TEST_RESULTS_VIEW      = OFF;

// NOTE: to test this correctly if at all, put the timeout _after_ something that might be a single API request
export const TEST_ASYNCHRONICITY    = ON;

