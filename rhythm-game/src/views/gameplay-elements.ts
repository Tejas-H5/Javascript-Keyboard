import { ImCache, imdom } from "imcf";
import { BLOCK, cssVars, imui, PERCENT, PX, ROW } from "imcf/im-ui";

// We want to put the game inside a container that maintains it's aspect ratio, so that 
// I can play this on my 4:3 screen as well.
// It also means there are fewer edge-cases I need to account for r.e playfield sizes.
// Another factor is actually keeping all the lanes in my FOV
// while I'm playing the game, so that if there are notes on the far-side of 
// the chart, I don't miss them.

export function imGameplayContainerBegin(c: ImCache, isPreview: boolean) {
    const { size: rootContainerSize } = imdom.TrackSize(c);

    // Chosen such that it's easy to see all the keys at once. 
    // I may make the aspect ratio more square like if needed.
    const wantedAspectRatio = 5/4;
    let currentAspectRatio = rootContainerSize.width / rootContainerSize.height;
    let widthReduction = 0, heightReduction = 0;
    if (currentAspectRatio > wantedAspectRatio) {
        let wantedWidth = rootContainerSize.height * wantedAspectRatio;
        let wantedWidthPercent = 100 * (wantedWidth / rootContainerSize.width);
        widthReduction = 100 - wantedWidthPercent;
    } else {
        let wantedHeight = rootContainerSize.width / wantedAspectRatio;
        let wantedHeightPercent = 100 * (wantedHeight / rootContainerSize.height);
        heightReduction = 100 - wantedHeightPercent;
    }

    // Curtains
    {
        const curtainColor = isPreview ? cssVars.bg : cssVars.fg;

        // Top and bottom 
        {
            imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, curtainColor);
            imui.Absolute(c, 0, PX, 0, PX, (100 - heightReduction / 2), PERCENT, 0, PX); imui.End(c);

            imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, curtainColor);
            imui.Absolute(c, (100 - heightReduction / 2), PERCENT, 0, PX, 0, PX, 0, PX); imui.End(c);
        }

        // Left and right
        {
            imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, curtainColor);
            imui.Absolute(c, 0, PX, (100 - widthReduction / 2), PERCENT, 0, PX, 0, PX); imui.End(c);

            imui.Begin(c, BLOCK); imui.Justify(c); imui.Bg(c, curtainColor);
            imui.Absolute(c, 0, PX, 0, PX, 0, PX, (100 - widthReduction / 2), PERCENT); imui.End(c);
        }
    }

    imui.Begin(c, ROW); imui.Justify(c);
    imui.Absolute(c, heightReduction / 2, PERCENT, widthReduction / 2, PERCENT, heightReduction / 2, PERCENT, widthReduction / 2, PERCENT);
}

export function imGameplayContainerEnd(c: ImCache) {
    imui.End(c);
}
